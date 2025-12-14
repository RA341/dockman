package docker

import (
	"github.com/RA341/dockman/internal/docker/compose"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/debug"
	"github.com/RA341/dockman/internal/docker/updater"
	docker "github.com/docker/docker/client"
	"github.com/moby/moby/client"
)

type Service struct {
	Compose    *compose.Service
	Container  *container.Service
	Updater    *updater.Service
	Debugger   *debug.Service
	DaemonAddr string
}

func NewService(
	daemonAddr string,
	mobyClient *client.Client,
	dockClient *docker.Client,
	syncer compose.Syncer,
	imageUpdateStore updater.Store,
	hostname string,
	updaterUrl string,
	composeRoot string,
) *Service {
	containerClient := container.New(mobyClient)

	composeClient := compose.New(
		dockClient,
		syncer,
		composeRoot,
		containerClient,
	)

	upClient := updater.New(containerClient, hostname, updaterUrl, imageUpdateStore)
	dbgClient := debug.New(containerClient)

	return &Service{
		Container:  containerClient,
		Compose:    composeClient,
		Updater:    upClient,
		Debugger:   dbgClient,
		DaemonAddr: daemonAddr,
	}
}

func (s *Service) Close() error {
	//return s.ContainerService.daemon().Close()
	// todo look into close
	return nil
}
