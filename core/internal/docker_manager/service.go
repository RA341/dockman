package docker_manager

import (
	"fmt"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
	"path/filepath"
	"sync"
)

type Service struct {
	// config
	composeRoot   *string
	baseUpdateImg *string
	localAddr     *string
	// services
	manager *ClientManager
	git     *git.Service
	ssh     *ssh.Service
	// internal
	mu           sync.RWMutex
	activeClient *docker.Service
}

func NewService(git *git.Service, ssh *ssh.Service, localAddr, updateBaseImage, composeRoot *string) *Service {
	if !filepath.IsAbs(*composeRoot) {
		log.Fatal().Str("path", *composeRoot).Msg("composeRoot must be an absolute path")
	}

	clientManager, defaultHost := NewClientManager(ssh)
	srv := &Service{
		composeRoot:   composeRoot,
		baseUpdateImg: updateBaseImage,
		localAddr:     localAddr,

		git:     git,
		manager: clientManager,
		ssh:     ssh,

		mu: sync.RWMutex{},
	}
	if err := srv.SwitchClient(defaultHost); err != nil {
		log.Fatal().Err(err).Str("name", defaultHost).Msg("unable to switch client")
	}
	return srv
}

func (srv *Service) GetService() *docker.Service {
	srv.mu.RLock()
	defer srv.mu.RUnlock()
	return srv.activeClient
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
	err := srv.manager.Delete(mach.Name)
	if err != nil {
		return fmt.Errorf("unable to delete docker client: %w", err)
	}

	err = srv.ssh.DeleteMachine(mach)
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
	if err := srv.manager.Delete(mach.Name); err != nil {
		return fmt.Errorf("unable to remove docker client: %w", err)
	}

	if err := srv.ssh.DisableClient(&mach); err != nil {
		return err
	}

	return nil
}

// enable, connect and add client
func (srv *Service) enableClient(mach ssh.MachineOptions) error {
	if err := srv.ssh.EnableClient(&mach); err != nil {
		return fmt.Errorf("error occured while connecting to ssh: %w", err)
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

func (srv *Service) SwitchClient(name string) error {
	oldClient := srv.manager.Active()

	wg := errgroup.Group{}
	wg.Go(func() error {
		if err := srv.git.SwitchBranch(name); err != nil {
			return fmt.Errorf("unable to switch branch :%w", err)
		}
		return nil
	})

	wg.Go(func() error {
		if err := srv.manager.Switch(name); err != nil {
			return fmt.Errorf("unable to switch docker client :%w", err)
		}
		return nil
	})

	if err := wg.Wait(); err != nil {
		// back to old client
		_ = srv.git.SwitchBranch(oldClient)
		_ = srv.manager.Switch(oldClient)
		return err
	}

	srv.mu.Lock()
	defer srv.mu.Unlock()

	if srv.activeClient != nil {
		// todo maybe dispose
		//pkg.CloseCloser(srv.activeClient)
	}

	mach := srv.manager.GetMachine()

	// to add direct links to services
	var localAddr string
	var syncer docker.Syncer
	if name == LocalClient {
		// todo load from service
		localAddr = *srv.localAddr
		syncer = docker.NewNoopSyncer()
	} else {
		localAddr = mach.dockerClient.DaemonHost()
		syncer = docker.NewSFTPSyncer(mach.ssh.SftpClient, srv.composeRoot)
	}

	srv.activeClient = docker.NewService(
		localAddr,
		srv.composeRoot,
		srv.baseUpdateImg,
		mach.dockerClient,
		syncer,
	)

	return nil
}
