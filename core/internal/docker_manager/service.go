package docker_manager

import (
	"context"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/docker/compose"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/updater"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/rs/zerolog/log"
)

type ComposeRootProvider func() string
type LocalAddrProvider func() string
type UpdaterConfigProvider func() *config.UpdaterConfig

type Service struct {
	composeRoot ComposeRootProvider
	localAddr   LocalAddrProvider

	manager *ClientManager
	ssh     *ssh.Service

	mu           sync.RWMutex
	activeClient *docker.Service

	userConfig config.Store
	updaterCtx chan interface{}

	imageUpdateStore updater.Store
	updater          UpdaterConfigProvider
}

func NewService(
	ssh *ssh.Service,
	store updater.Store,
	userConfig config.Store,
	composeRoot ComposeRootProvider,
	updaterUrl UpdaterConfigProvider,
	localAddr LocalAddrProvider,
) *Service {
	if !filepath.IsAbs(composeRoot()) {
		log.Fatal().Str("path", composeRoot()).Msg("composeRoot must be an absolute path")
	}

	clientManager, defaultHost := NewClientManager(ssh)
	srv := &Service{
		manager: clientManager,
		ssh:     ssh,

		userConfig:  userConfig,
		composeRoot: composeRoot,
		localAddr:   localAddr,

		imageUpdateStore: store,
		updater:          updaterUrl,
	}
	if err := srv.SwitchClient(defaultHost); err != nil {
		log.Fatal().Err(err).Str("name", defaultHost).Msg("unable to switch client")
	}

	// todo
	//go srv.StartContainerUpdater()

	log.Debug().Msg("Docker manager service loaded successfully")
	return srv
}

func (srv *Service) ResetContainerUpdater() {
	srv.StopContainerUpdater()
	go srv.StartContainerUpdater()
}

func (srv *Service) StopContainerUpdater() {
	close(srv.updaterCtx)
}

// StartContainerUpdater blocking function
// should be always called in a go routine
func (srv *Service) StartContainerUpdater() {
	srv.updaterCtx = make(chan interface{})

	userConfig, err := srv.userConfig.GetConfig()
	if err != nil {
		log.Warn().Err(err).Msg("unable to get config, container updater will not be run")
		return
	}

	if !userConfig.ContainerUpdater.Enable {
		log.Info().Any("config", userConfig.ContainerUpdater).
			Msg("Container updater is disabled in config, enable to run updater service")
		return
	}

	updateInterval := userConfig.ContainerUpdater.Interval
	log.Info().Str("interval", updateInterval.String()).
		Msg("Starting dockman container update service")
	tick := time.NewTicker(updateInterval)
	defer tick.Stop()

	var opts []updater.UpdateOption
	if userConfig.ContainerUpdater.NotifyOnly {
		log.Info().Msg("notify only mode enabled, only image update notifications will be sent")
		opts = append(opts, updater.WithNotifyOnly())
	}

	for {
		select {
		case _, ok := <-srv.updaterCtx:
			if !ok {
				log.Debug().Msg("container updater service stopped")
				return
			}
		case <-tick.C:
			srv.UpdateContainers(opts...)
		}
	}
}

// todo move to docker/updater

func (srv *Service) UpdateContainers(opts ...updater.UpdateOption) {
	updateHost := func(name string, dock *ConnectedDockerClient) error {
		cli := srv.loadDockerService(name, dock)
		err := cli.Updater.ContainersUpdateAll(context.Background(), opts...)
		if err != nil {
			return fmt.Errorf("error occured while updating containers for host: %s\n%w", name, err)
		}

		log.Info().Str("host", name).Msg("updated containers for host")
		return nil
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	var errors []error

	for name, dock := range srv.manager.ListHosts() {
		wg.Go(func() {
			if err := updateHost(name, dock); err != nil {
				mu.Lock()
				errors = append(errors, err)
				mu.Unlock()
			}
		})
	}
	wg.Wait()

	for _, err := range errors {
		// todo send notif
		log.Error().Err(err).Msg("host update failed")
	}
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

	err := srv.manager.Switch(name)
	if err != nil {
		// back to old client
		_ = srv.manager.Switch(oldClient)
		return fmt.Errorf("unable to switch docker client :%w", err)
	}

	srv.mu.Lock()
	defer srv.mu.Unlock()

	if srv.activeClient != nil {
		// todo maybe dispose
		//fileutil.CloseCloser(srv.activeClient)
	}

	mach := srv.manager.GetMachine()
	srv.activeClient = srv.loadDockerService(name, mach)
	return nil
}

func (srv *Service) loadDockerService(name string, mach *ConnectedDockerClient) *docker.Service {
	// to add direct links to services
	composeRoot := srv.composeRoot()
	if name != container.LocalClient {
		composeRoot = filepath.Join(composeRoot, git.DockmanRemoteFolder, name)
	}
	log.Debug().Str("host", name).Str("composeRoot", composeRoot).Msg("compose root for client")

	var localAddr string
	var syncer compose.Syncer
	if name == container.LocalClient {
		// todo load from service
		localAddr = srv.localAddr()
		syncer = &compose.NoopSyncer{}
	} else {
		localAddr = mach.mobyClient.DaemonHost()
		syncer = compose.NewSFTPSyncer(mach.ssh.SftpClient, composeRoot)
	}

	service := docker.NewService(
		localAddr,
		mach.mobyClient,
		mach.dockerClient,
		syncer,
		srv.imageUpdateStore,
		name,
		srv.updater().Addr,
		composeRoot,
	)

	return service
}

func (srv *Service) GetActiveClient() string {
	return srv.manager.Active()
}
