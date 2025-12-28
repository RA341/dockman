package ssh

import (
	"bytes"
	"fmt"
	"net"
	"time"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/pkg/sftp"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/ssh"
)

type Service struct {
	machines MachineManager
	keys     KeyManager
}

func NewService(keyMan KeyManager, machManager MachineManager) *Service {
	if err := initSSHkeys(keyMan); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize ssh keys")
	}

	srv := &Service{
		machines: machManager,
		keys:     keyMan,
	}

	log.Debug().Msg("SSH service loaded successfully")
	return srv
}

func (m *Service) ListConfig() ([]MachineOptions, error) {
	return m.machines.List()
}

func (m *Service) LoadClient(machine *MachineOptions, create bool) (*ssh.Client, *sftp.Client, error) {
	cli, err := m.newClient(machine)
	if err != nil {
		return nil, nil, err
	}

	defer func() {
		fileutil.CloseIfErr(err, cli)
	}()

	// user has requested keys to be transferred,
	// and use the password only on first connect
	transferKeyOnFirstConnect := machine.UsePublicKeyAuth && machine.Password != ""
	if transferKeyOnFirstConnect {
		err = m.transferPublicKey(cli, machine)
		if err != nil {
			return nil, nil, fmt.Errorf("unable to transfer public key: %w", err)
		}

		// remove password so that public key auth is used on subsequent connections
		machine.Password = ""
	}

	sftpCli, err := sftp.NewClient(cli)
	if err != nil {
		return nil, nil, err
	}

	if create {
		if err = m.machines.Save(machine); err != nil {
			return nil, nil, err
		}
	}

	return cli, sftpCli, nil
}

func (m *Service) Delete(machine *MachineOptions) error {
	return m.machines.Delete(machine)
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
	log.Debug().Msg("falling back to SSH keys from home directory")
	return withKeyPairFromHome()

}

func (m *Service) saveHostKey(machine *MachineOptions) func(hostname string, remote net.Addr, key ssh.PublicKey) error {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		log.Debug().Msg("Empty public key for, public key will be saved on connect")

		comment := fmt.Sprintf("added by dockman for on %s", time.Now().Format(time.RFC3339))
		stringKey, err := publicKeyToString(key, comment)
		if err != nil {
			return fmt.Errorf("unable to convert public key for machine: %w", err)
		}

		machine.RemotePublicKey = stringKey
		return nil
	}
}

// transferPublicKey transfers the local public key to a remote server.
func (m *Service) transferPublicKey(client *ssh.Client, machine *MachineOptions) error {
	keys, err := m.keys.GetKey(DefaultKeyName)
	if err != nil {
		return fmt.Errorf("failed to get public key: %w", err)
	}

	remoteCommand := getTransferCommand(keys.PublicKey)

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

	log.Info().Msg("Public key transferred successfully.")
	return nil
}

func (m *Service) newClient(machine *MachineOptions) (*ssh.Client, error) {
	auth, err := m.getAuthMethod(machine)
	if err != nil {
		return nil, fmt.Errorf("failed to load auth method for host: %w", err)
	}

	client, err := createSSHClient(machine, auth, m.saveHostKey(machine))
	if err != nil {
		return nil, fmt.Errorf("failed to create SSH client: %w", err)
	}
	defer func() {
		fileutil.CloseIfErr(err, client)
	}()

	return client, err
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
