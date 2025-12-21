package docker_manager

import (
	"fmt"
	"path/filepath"

	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/docker/compose"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/rs/zerolog/log"
	ssh2 "golang.org/x/crypto/ssh"
)

type ComposeRootProvider func() string
type LocalAddrProvider func() string
type UpdaterConfigProvider func() *config.UpdaterConfig

type Service struct {
	composeRoot ComposeRootProvider
	localAddr   LocalAddrProvider

	manager *ClientManager
	ssh     *ssh.Service

	userConfig config.Store
	updaterCtx chan interface{}

	updater UpdaterConfigProvider
	fs      compose.GetHost
}

func NewService(
	ssh *ssh.Service,
	userConfig config.Store,
	composeRoot ComposeRootProvider,
	localAddr LocalAddrProvider,
	fs compose.GetHost,
) *Service {
	if !filepath.IsAbs(composeRoot()) {
		log.Fatal().Str("path", composeRoot()).Msg("composeRoot must be an absolute path")
	}
	// todo maybe do something with default
	clientManager, _ := NewClientManager(ssh)
	srv := &Service{
		manager: clientManager,
		ssh:     ssh,
		fs:      fs,

		userConfig:  userConfig,
		composeRoot: composeRoot,
		localAddr:   localAddr,
	}

	log.Debug().Msg("Docker manager service loaded successfully")
	return srv
}

func (srv *Service) GetService(name string) (*docker.Service, error) {
	machine, err := srv.manager.GetMachine(name)
	if err != nil {
		return nil, fmt.Errorf("machine not found %w", err)
	}
	return srv.loadDockerService(name, machine), nil
}

func (srv *Service) EditClient(editedMach *ssh.MachineOptions) error {
	oldMach, err := srv.ssh.GetMachByID(editedMach.ID)
	if err != nil {
		return fmt.Errorf("could not find machine with id %q: %w", editedMach.ID, err)
	}

	err = srv.DeleteClient(&oldMach)
	if err != nil {
		return fmt.Errorf("unable to delete client: %w", err)
	}

	err = srv.AddClient(editedMach)
	if err != nil {
		return fmt.Errorf("unable to create client: %w", err)
	}

	return nil
}

func (srv *Service) AddClient(mach *ssh.MachineOptions) error {
	err := srv.ssh.AddClient(mach)
	if err != nil {
		return fmt.Errorf("failed to create ssh client: %w", err)
	}

	if !mach.Enable {
		// saved not loaded
		return nil
	}

	return srv.LoadMachine(mach)
}

func (srv *Service) LoadMachine(mach *ssh.MachineOptions) error {
	val, ok := srv.ssh.Get(mach.Name)
	if !ok {
		return fmt.Errorf("ssh client not found, This should never happen")
	}

	if err := srv.manager.Load(mach.Name, val); err != nil {
		return fmt.Errorf("failed to create docker client: %w", err)
	}

	return nil
}

func (srv *Service) DeleteClient(mach *ssh.MachineOptions) error {
	srv.manager.Delete(mach.Name)
	err := srv.ssh.DeleteMachine(mach)
	if err != nil {
		return fmt.Errorf("unable to ssh client: %w", err)
	}
	return nil
}

func (srv *Service) ToggleClient(name string, enable bool) error {
	mach, err := srv.ssh.GetMach(name)
	if err != nil {
		return fmt.Errorf("unable to get machine %s: %w", name, err)
	}

	if !enable {
		return srv.disableClient(mach)
	}

	return srv.enableClient(mach)
}

func (srv *Service) disableClient(mach ssh.MachineOptions) error {
	srv.manager.Delete(mach.Name)
	return srv.ssh.DisableClient(&mach)
}

// enable, connect and add client
func (srv *Service) enableClient(mach ssh.MachineOptions) error {
	if err := srv.ssh.EnableClient(&mach); err != nil {
		return fmt.Errorf("error occurred while connecting to ssh: %w", err)
	}

	connectedMachine, ok := srv.ssh.Get(mach.Name)
	if !ok {
		return fmt.Errorf("ssh client not found, This should never happen")
	}

	if err := srv.manager.Load(mach.Name, connectedMachine); err != nil {
		return err
	}

	return nil
}

func (srv *Service) loadDockerService(name string, mach *ConnectedDockerClient) *docker.Service {
	// to add direct links to services
	//composeRoot := srv.composeRoot()
	//if name != container.LocalClient {
	//	composeRoot = filepath.Join(composeRoot, git.DockmanRemoteFolder, name)
	//}
	//log.Debug().Str("host", name).Str("composeRoot", composeRoot).Msg("compose root for client")

	var localAddr string
	var sshCli *ssh2.Client
	if name == container.LocalClient {
		// todo load from service
		localAddr = srv.localAddr()
	} else {
		localAddr = mach.mobyClient.DaemonHost()
		sshCli = mach.ssh.SshClient
	}

	service := docker.NewService(
		name,
		localAddr,
		mach.mobyClient,
		sshCli,
		srv.fs,
	)

	return service
}
