package ssh

import (
	"bytes"
	"fmt"
	"net"
	"time"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/ssh"
)

type Service struct {
	machines         MachineManager
	keys             KeyManager
	connectedClients syncmap.Map[string, *ConnectedMachine]
}

func NewService(keyMan KeyManager, machManager MachineManager) *Service {
	if err := initSSHkeys(keyMan); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize ssh keys")
	}

	srv := &Service{
		machines:         machManager,
		keys:             keyMan,
		connectedClients: syncmap.Map[string, *ConnectedMachine]{},
	}

	if err := srv.loadEnabled(); err != nil {
		log.Fatal().Err(err).Msg("Failed to load SSH keys")
	}

	log.Debug().Msg("SSH service loaded successfully")
	return srv
}

func (m *Service) Get(name string) (*ConnectedMachine, bool) {
	return m.connectedClients.Load(name)
}

func (m *Service) GetMach(name string) (MachineOptions, error) {
	return m.machines.Get(name)
}

func (m *Service) GetMachByID(id uint) (MachineOptions, error) {
	return m.machines.GetByID(id)
}

func (m *Service) ListConnected() map[string]*ConnectedMachine {
	var clientMap = make(map[string]*ConnectedMachine)
	m.connectedClients.Range(func(k string, c *ConnectedMachine) bool {
		clientMap[k] = c
		return true
	})
	return clientMap
}

func (m *Service) ListConfig() ([]MachineOptions, error) {
	return m.machines.List()
}

func (m *Service) EnableClient(machine *MachineOptions) error {
	log.Info().Str("client", machine.Name).Msg("Enabling client")

	machine.Enable = true
	if err := m.machines.Save(machine); err != nil {
		return fmt.Errorf("failed to update client info in DB: %w", err)
	}

	if err := m.LoadClient(machine, false); err != nil {
		return fmt.Errorf("failed to enable client: %w", err)
	}
	return nil
}

func (m *Service) DisableClient(machine *MachineOptions) error {
	log.Info().Str("client", machine.Name).Msg("Disabling client")
	machine.Enable = false

	if conn, ok := m.connectedClients.Load(machine.Name); ok {
		fileutil.Close(conn)
		m.connectedClients.Delete(machine.Name)
	}

	if err := m.machines.Save(machine); err != nil {
		return fmt.Errorf("failed to save client: %w", err)
	}

	return nil
}

func (m *Service) AddClient(machine *MachineOptions) (err error) {
	if _, err = m.machines.Get(machine.Name); err == nil {
		return fmt.Errorf("machine %s already exists use a different name", machine.Name)
	}

	return m.LoadClient(machine, true)
}

func (m *Service) LoadClient(machine *MachineOptions, newClient bool) error {
	if !newClient && !machine.Enable {
		log.Info().Str("client", machine.Name).Msg("machine is disabled")
		return nil
	}

	cli, err := m.newClient(machine)
	if err != nil {
		return fmt.Errorf("%s unable to connect: %w", machine.Name, err)
	}

	defer func() {
		// if the function returns with an error close client
		if err != nil {
			fileutil.Close(cli)
		}
	}()

	// user has requested keys to be transferred,
	// and use the password only on first connect
	transferKeyOnFirstConnect := machine.UsePublicKeyAuth && machine.Password != ""
	if transferKeyOnFirstConnect {
		if err = m.transferPublicKey(cli, machine); err != nil {
			return fmt.Errorf("unable to transfer public key for %s: %w", machine.Name, err)
		}
		// remove password so that public key auth is used on subsequent connections
		machine.Password = ""
	}

	sftpCli, err := NewSFTPFromSSH(cli)
	if err != nil {
		return fmt.Errorf("failed to create sftp client: %w", err)
	}

	if newClient {
		if err = m.machines.Save(machine); err != nil {
			return err
		}
	}

	// we check enable again because if a new client is
	// created we need to check if they want to enable it or not
	if machine.Enable {
		m.connectedClients.Store(machine.Name, NewConnectedMachine(cli, sftpCli))
	} else {
		fileutil.Close(cli)
	}

	return nil
}

func (m *Service) DeleteMachine(machine *MachineOptions) error {
	if conn, ok := m.connectedClients.Load(machine.Name); ok {
		fileutil.Close(conn)
		m.connectedClients.Delete(machine.Name)
	}

	if err := m.machines.Delete(machine); err != nil {
		return err
	}

	return nil
}

func (m *Service) getAuthMethod(machine *MachineOptions) (ssh.AuthMethod, error) {
	if machine.UsePublicKeyAuth {
		// user has requested to transfer public key since it's the first connect
		if machine.Password != "" {
			return ssh.Password(machine.Password), nil
		}

		return withKeyPairFromDB(m.keys)
	}

	if machine.Password != "" {
		return withPasswordAuth(machine), nil
	}

	// final fallback use .ssh in user dir
	// should fail on docker containers
	log.Debug().Str("client", machine.Name).Msg("falling back to SSH keys from home directory")
	return withKeyPairFromHome()

}

func (m *Service) saveHostKey(machine *MachineOptions) func(hostname string, remote net.Addr, key ssh.PublicKey) error {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		log.Debug().Str("name", machine.Name).Msg("Empty public key for, public key will be saved on connect")

		comment := fmt.Sprintf("added by dockman for machine %s on %s", machine.Name, time.Now().Format(time.RFC3339))
		stringKey, err := publicKeyToString(key, comment)
		if err != nil {
			return fmt.Errorf("unable to convert public key for machine %s: %w", machine.Name, err)
		}

		machine.RemotePublicKey = stringKey
		err = m.machines.Save(machine)
		if err != nil {
			return err
		}

		return nil
	}
}

func (m *Service) loadEnabled() error {
	configs, err := m.machines.List()
	if err != nil {
		return fmt.Errorf("failed to list machine configs: %s", err)
	}

	for _, machine := range configs {
		if err = m.LoadClient(&machine, false); err != nil {
			log.Warn().Err(err).
				Str("machine", machine.Name).Msg("Failed to add client")
			continue
		}
	}

	return nil
}

// transferPublicKey transfers the local public key to a remote server.
func (m *Service) transferPublicKey(client *ssh.Client, machine *MachineOptions) error {
	keys, err := m.keys.GetKey(DefaultKeyName)
	if err != nil {
		return fmt.Errorf("failed to get public key: %w", err)
	}

	remoteCommand := getTransferCommand(keys.PublicKey)

	// Create a new session
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	defer fileutil.Close(session)

	// Set the public key as the standard input to the remote command
	session.Stdin = bytes.NewReader(keys.PublicKey)

	// Run the command
	var out bytes.Buffer
	session.Stdout = &out
	if err := session.Run(remoteCommand); err != nil {
		return fmt.Errorf("failed to run remote command: %w", err)
	}
	log.Debug().Str("out", out.String()).Msg("Remote command ran with the following output")

	log.Info().Str("machine", machine.Name).Msg("Public key transferred successfully.")
	return nil
}

func (m *Service) newClient(machine *MachineOptions) (*ssh.Client, error) {
	auth, err := m.getAuthMethod(machine)
	if err != nil {
		return nil, fmt.Errorf("failed to load auth method for host: %w", err)
	}

	return createSSHClient(machine, auth, m.saveHostKey(machine))
}

func (m *Service) loadClients() error {
	list, err := m.machines.List()
	if err != nil {
		return err
	}

	for _, machine := range list {
		sshClient, err := m.newClient(&machine)
		if err != nil {
			log.Warn().Err(err).Str("client", machine.Name).Msg("Failed to setup ssh client")
			continue
		}

		sftpClient, err := NewSFTPFromSSH(sshClient)
		if err != nil {
			log.Error().Err(err).Str("client", machine.Name).Msg("Failed to setup sftp client")
			continue
		}

		m.connectedClients.Store(machine.Name, NewConnectedMachine(sshClient, sftpClient))
	}

	return nil
}

// The command will be executed on the remote server.
// This command creates the .ssh directory if it doesn't exist,
// sets its permissions, and then appends the key to the authorized_keys file
// after checking if it already exists.
func getTransferCommand(pubKey []byte) string {
	remoteCommand := fmt.Sprintf(
		"mkdir -p ~/.ssh && chmod 700 ~/.ssh && "+
			"touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && "+
			"if ! grep -q -f - ~/.ssh/authorized_keys; then echo '%s' >> ~/.ssh/authorized_keys; fi",
		bytes.TrimSpace(pubKey),
	)
	return remoteCommand
}

func initSSHkeys(keyMan KeyManager) error {
	_, err := keyMan.GetKey(DefaultKeyName)
	if err == nil {
		return nil
	}

	// error occurred while getting default key generate new keys
	private, public, err := generateKeyPair()
	if err != nil {
		return err
	}

	err = keyMan.SaveKey(KeyConfig{
		Name:       DefaultKeyName,
		PublicKey:  public,
		PrivateKey: private,
	})
	if err != nil {
		return err
	}

	return nil
}
