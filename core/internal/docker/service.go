package docker

import (
	docker "github.com/docker/docker/client"
	"github.com/moby/moby/client"
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
	hostname   string
	MobyClient *client.Client
	// tmp workaround since moby isn't compatible with docker yet
	DockClient *docker.Client
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
	mobyClient *client.Client,
	dockClient *docker.Client,
	syncer Syncer,
	imageUpdateStore Store,
	name string,
	updaterUrl string,
	composeRoot string,
) *Service {
	uts := &dependencies{
		hostname:         name,
		MobyClient:       mobyClient,
		DockClient:       dockClient,
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
