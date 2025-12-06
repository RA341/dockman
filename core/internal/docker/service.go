package docker

import (
	"github.com/RA341/dockman/internal/docker/compose"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/updater"
	docker "github.com/docker/docker/client"
	"github.com/moby/moby/client"
)

type Service struct {
	Compose    *compose.Service
	Container  *container.Service
	Updater    *updater.Service
	DaemonAddr string
}

// dependencies common info used by container and compose service
// normally this would be in the service struct
// but since the services are seperated we use this
//type dependencies struct {
//	// hostname of the machine used to identify which client is running on
//	hostname   string
//	MobyClient *client.Client
//	// tmp workaround since moby isn't compatible with docker compose yet
//	DockClient *docker.Client
//	// address used to prefix container ports for direct links
//	daemonAddr string
//	// syncs local files to remote host
//	syncer Syncer
//
//	// only used by compose service not needed by container
//	composeRoot string
//
//	// to store updates about new images
//	imageUpdateStore Store
//	// external sidecar url to update a dockman container
//	updaterUrl string
//}

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

	return &Service{
		Container:  containerClient,
		Compose:    composeClient,
		Updater:    upClient,
		DaemonAddr: daemonAddr,
	}
}

func (s *Service) Close() error {
	//return s.ContainerService.daemon().Close()
	// todo look into close
	return nil
}
