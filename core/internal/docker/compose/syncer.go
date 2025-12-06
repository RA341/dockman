package compose

import (
	"context"
	"fmt"
	"strings"

	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/compose-spec/compose-go/v2/types"
	"github.com/rs/zerolog/log"
)

// Syncer is responsible for ensuring project files are available on the target host.
type Syncer interface {
	Sync(ctx context.Context, project *types.Project) error
}

// SFTPSyncer syncs files to a remote host using SFTP.
type SFTPSyncer struct {
	sftpClient  *ssh.SftpClient
	composeRoot string
}

func NewSFTPSyncer(sftpClient *ssh.SftpClient, composeRoot string) *SFTPSyncer {
	return &SFTPSyncer{sftpClient: sftpClient, composeRoot: composeRoot}
}

func (s *SFTPSyncer) Sync(_ context.Context, project *types.Project) error {
	log.Debug().Msg("syncing bind mount to remote host")
	for _, service := range project.Services {
		for _, vol := range service.Volumes {
			if vol.Bind == nil {
				continue
			}

			localSourcePath := vol.Source

			if !strings.HasPrefix(localSourcePath, s.composeRoot) {
				log.Debug().
					Str("local", localSourcePath).
					Msg("Skipping bind mount outside of project root")
				continue
			}

			if !fileutil.FileExists(localSourcePath) {
				log.Debug().Str("path", localSourcePath).Msg("bind mount source path not found, skipping...")
				continue
			}

			remoteDestPath := localSourcePath
			log.Info().
				Str("name", service.Name).
				Str("src (local)", localSourcePath).
				Str("dest (remote)", remoteDestPath).
				Msg("Syncing bind mount for service")

			if err := s.sftpClient.CopyLocalToRemoteSFTP(localSourcePath, remoteDestPath); err != nil {
				return fmt.Errorf("failed to sync bind mount %s for service %s: %w", localSourcePath, service.Name, err)
			}
		}
	}
	return nil
}

// NoopSyncer is a syncer that does nothing, for local environments.
type NoopSyncer struct{}

func NewNoopSyncer() *NoopSyncer {
	return &NoopSyncer{}
}

func (n *NoopSyncer) Sync(_ context.Context, _ *types.Project) error {
	// For local docker, files are already on the host. No sync needed.
	return nil
}
