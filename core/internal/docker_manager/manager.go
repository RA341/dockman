package docker_manager

import (
	"fmt"
	"sync"

	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/pkg/syncmap"
	dkClient "github.com/docker/docker/client"
	"github.com/rs/zerolog/log"
)

type ClientManager struct {
	ssh              *ssh.Service
	connectedClients syncmap.Map[string, *ConnectedDockerClient]
}

func NewClientManager(sshSrv *ssh.Service) (*ClientManager, string) {
	cm := &ClientManager{
		ssh:              sshSrv,
		connectedClients: syncmap.Map[string, *ConnectedDockerClient]{},
	}

	defaultHost, err := cm.loadAllHosts()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load clients")
	}

	return cm, defaultHost
}

func (m *ClientManager) GetMachine(name string) (*ConnectedDockerClient, error) {
	val, ok := m.connectedClients.Load(name)
	if !ok {
		// this should never happen since only way of changing client should be Switched,
		// and we can choose only from valid list of clients validated by Switch
		return nil, fmt.Errorf(
			"client: %s is not not found in cache, THIS SHOULD NEVER HAPPEN, submit a bug report https://github.com/RA341/dockman/issues",
			name,
		)
	}
	return val, nil
}

func (m *ClientManager) Delete(name string) {
	if cli, ok := m.connectedClients.Load(name); ok {
		cli.Close()
		m.connectedClients.Delete(name)
	}
}

func (m *ClientManager) ListHostNames() []string {
	var cliList []string
	m.connectedClients.Range(func(key string, _ *ConnectedDockerClient) bool {
		cliList = append(cliList, key)
		return true
	})

	return cliList
}

func (m *ClientManager) ListHosts() map[string]*ConnectedDockerClient {
	var cliList = make(map[string]*ConnectedDockerClient)
	m.connectedClients.Range(func(name string, key *ConnectedDockerClient) bool {
		cliList[name] = key
		return true
	})

	return cliList
}

func (m *ClientManager) Load(name string, sshCon *ssh.ConnectedMachine) error {
	client, err := newDockerSSHClient(sshCon.SshClient)
	if err != nil {
		return fmt.Errorf("unable to create docker client: %w", err)
	}

	// todo remove this when compose is compatible with moby
	dk, err := dkClient.NewClientWithOpts(dkClient.WithAPIVersionNegotiation())
	if err != nil {
		return err
	}

	connection, err := testDockerConnection(client)
	if err != nil {
		return fmt.Errorf("unable to test docker connection: %w", err)
	}

	log.Info().Str("name", connection.Name).
		Str("Kernel", connection.KernelVersion).Msg("Connected to client")

	m.connectedClients.Store(name, NewConnectedDockerClient(client, dk, sshCon))
	return nil
}

func (m *ClientManager) Exists(name string) bool {
	_, ok := m.connectedClients.Load(name)
	return ok
}

func (m *ClientManager) loadAllHosts() (string, error) {
	machines := m.ssh.ListConnected()

	var wg sync.WaitGroup
	for name, machine := range machines {
		wg.Go(func() {
			m.loadSSHClient(name, machine)
		})
	}

	// todo toggle local client
	//if !clientConfig.EnableLocalDocker {
	//	log.Info().Msgf("Local docker is disabled in config")
	//	return
	//}
	wg.Go(func() {
		m.loadLocalClient()
	})

	wg.Wait()

	conClients := m.ListHostNames()
	if len(conClients) < 1 {
		// at least a single machine should always be available
		return "", fmt.Errorf("no docker clients could be connected, check your config")
	}

	//if machines.DefaultHost != "" {
	//	return machines.DefaultHost, nil
	//}

	if m.Exists(container.LocalClient) {
		return container.LocalClient, nil
	}

	// get first available host
	return conClients[0], nil
}

func (m *ClientManager) loadLocalClient() {
	localClient, err := NewLocalClient()
	if err != nil {
		log.Error().Err(err).Msg("Failed to setup local docker client")
		return
	}

	localDkClient, err := dkClient.NewClientWithOpts(dkClient.WithAPIVersionNegotiation(), dkClient.WithHostFromEnv())
	if err != nil {
		log.Error().Err(err).Msg("Failed to setup local docker client")
		return
	}

	m.testAndStore(container.LocalClient, NewConnectedDockerClient(
		localClient,
		localDkClient,
		nil,
	))
}

func (m *ClientManager) loadSSHClient(name string, machine *ssh.ConnectedMachine) {
	dockerCli, err := newDockerSSHClient(machine.SshClient)
	if err != nil {
		log.Error().Err(err).Str("client", name).Msg("Failed to setup remote docker client")
		return
	}

	// todo remove once moby is ready with docker/compose
	newClient, err := dkClient.NewClientWithOpts(
		dkClient.WithDialContext(dockerSSHDialer(machine.SshClient)),
		dkClient.WithAPIVersionNegotiation(),
	)
	if err != nil {
		log.Error().Err(err).Str("client", name).Msg("Failed to setup remote docker client")
		return
	}

	m.testAndStore(name, NewConnectedDockerClient(
		dockerCli,
		newClient,
		machine,
	))
}

func (m *ClientManager) testAndStore(name string, newClient *ConnectedDockerClient) {
	if _, err := testDockerConnection(newClient.mobyClient); err != nil {
		log.Warn().Err(err).Msgf("docker client health check failed: %s", name)
		return
	}

	m.connectedClients.Store(name, newClient)
}
