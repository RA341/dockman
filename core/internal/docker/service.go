package docker

import (
	"github.com/docker/docker/client"
)

// LocalClient is the name given to the local docker daemon instance
const LocalClient = "local"

type Service struct {
	Compose   *ComposeService
	Container *ContainerService
}

// dependencies common info used by container and compose service
// normally this would be in the service struct
// but since the services are seperated we use this
type dependencies struct {
	// hostname of the machine used to identify which client is running on
	hostname string
	Daemon   *client.Client
	// address used to prefix container ports for direct links
	daemonAddr string
	// syncs local files to remote host
	syncer Syncer

	// only used by compose service not needed by container
	composeRoot string

	// to store updates about new images
	imageUpdateStore Store
	// external sidecar url to update a dockman container
	updaterUrl string
}

func NewService(
	daemonAddr string,
	dockerClient *client.Client,
	syncer Syncer,
	imageUpdateStore Store,
	name string,
	updaterUrl string,
	composeRoot string,
) *Service {
	uts := &dependencies{
		hostname:         name,
		Daemon:           dockerClient,
		syncer:           syncer,
		daemonAddr:       daemonAddr,
		composeRoot:      composeRoot,
		imageUpdateStore: imageUpdateStore,
		updaterUrl:       updaterUrl,
	}

	containerClient := NewContainerService(uts)
	composeClient := NewComposeService(uts, containerClient)

	return &Service{
		Container: containerClient,
		Compose:   composeClient,
	}
}

func (s *Service) Close() error {
	//return s.ContainerService.daemon().Close()
	// todo look into close
	return nil
}
