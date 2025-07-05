package docker

import (
	"github.com/RA341/dockman/internal/config"
	dm "github.com/RA341/dockman/internal/docker_manager"
	"github.com/rs/zerolog/log"
	"path/filepath"
)

type ComposeManager interface {
}

type Service struct {
	*ComposeService
	*ContainerService
	localAddress string
}

func NewService(composeRoot string, cliFn dm.GetDocker, sftpFn dm.GetSftp) *Service {
	if !filepath.IsAbs(composeRoot) {
		log.Fatal().Str("path", composeRoot).Msg("composeRoot must be an absolute path")
	}

	containerClient := &ContainerService{
		daemon: cliFn,
		sftp:   sftpFn,
	}
	composeClient := newComposeService(composeRoot, containerClient)

	return &Service{
		ContainerService: containerClient,
		ComposeService:   composeClient,
		localAddress:     config.C.LocalAddr,
	}
}

func (s *Service) Close() error {
	//return s.ContainerService.daemon().Close()
	// todo look into close
	return nil
}
