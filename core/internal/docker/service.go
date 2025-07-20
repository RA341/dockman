package docker

import (
	"github.com/docker/docker/client"
)

type Service struct {
	// used to prefix container ports for a full addr
	localAddr string
	*ComposeService
	*ContainerService
}

func NewService(localAddr string, composeRoot, baseImage *string, dockerClient *client.Client, syncer Syncer) *Service {
	containerClient := NewContainerService(dockerClient)
	composeClient := NewComposeService(composeRoot, baseImage, containerClient, syncer)

	return &Service{
		ContainerService: containerClient,
		ComposeService:   composeClient,
		localAddr:        localAddr,
	}
}

func (s *Service) Close() error {
	//return s.ContainerService.daemon().Close()
	// todo look into close
	return nil
}
