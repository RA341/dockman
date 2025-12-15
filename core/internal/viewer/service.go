package viewer

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/google/uuid"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

type ClientProvider func() *client.Client
type GetFullPath func(relPath, alias string) (string, error)

type Service struct {
	getPath  GetFullPath
	cli      ClientProvider
	sessions syncmap.Map[string, string]
}

func NewService(cli ClientProvider, getPath GetFullPath) *Service {
	return &Service{
		cli:      cli,
		getPath:  getPath,
		sessions: syncmap.Map[string, string]{},
	}
}

func (s *Service) StartSession(ctx context.Context, relPath string, alias string) (string, func(), error) {
	sessionID := uuid.New().String()
	urlPrefix := "/api/viewer/view/" + sessionID + "/"

	fullpath, err := s.getPath(relPath, alias)
	if err != nil {
		return "", nil, fmt.Errorf("could not get path for %s: %w", alias, err)
	}

	var netConf *network.NetworkingConfig

	if info.IsDocker() {
		//log.Debug().Msg("docker detected inspecting container")

		filterArgs := client.Filters{}
		filterArgs.Add("label", "dockman.container=true")

		list, err := s.cli().ContainerList(ctx, client.ContainerListOptions{
			Filters: filterArgs,
		})
		if err != nil {
			return "", nil, err
		}

		done := false
		for _, cont := range list.Items {
			//log.Debug().Str("co", cont.Image).Msg("Checking container")
			if done {
				break
			}
			for _, m := range cont.Mounts {
				//log.Debug().Any("mount", m).Str("fullpath", fullpath).Msg("Checking mount")
				if strings.HasPrefix(fullpath, m.Destination) {
					fullpath = filepath.Join(m.Source, relPath)
					done = true

					var netName string
					for name := range cont.NetworkSettings.Networks {
						netName = name
						break
					}

					netConf = &network.NetworkingConfig{
						EndpointsConfig: map[string]*network.EndpointSettings{
							netName: {},
						},
					}

					log.Debug().Str("path", fullpath).
						Str("netname", netName).
						Msg("found mounted path")
					break
				}
			}
		}

		if !done {
			return "", nil, fmt.Errorf("could not find dockman container")
		}
	}

	image := "ghcr.io/coleifer/sqlite-web:latest"
	progress, err := s.cli().ImagePull(ctx, image, client.ImagePullOptions{})
	if err != nil {
		return "", nil, err
	}

	err = progress.Wait(context.Background())
	if err != nil {
		return "", nil, err
	}

	create, err := s.cli().ContainerCreate(ctx, client.ContainerCreateOptions{
		Name: fmt.Sprintf("dockman-sqlite-viewer-%s", sessionID[:12]),
		Config: &container.Config{
			Image: image,
			// Listen on all internal interfaces, set prefix
			Cmd: []string{
				fullpath,
				"--host=0.0.0.0", "--port=8080",
				"--url-prefix=" + urlPrefix, "--no-browser",
			},
		},

		HostConfig: &container.HostConfig{
			AutoRemove: true,

			Mounts: []mount.Mount{
				{
					Type:   mount.TypeBind,
					Source: fullpath,
					Target: fullpath,
				},
			},
		},
		NetworkingConfig: netConf,
		Platform:         nil,
	})
	if err != nil {
		return "", nil, err
	}

	_, err = s.cli().ContainerStart(ctx, create.ID, client.ContainerStartOptions{})
	if err != nil {
		return "", nil, err
	}

	inspect, err := s.cli().ContainerInspect(ctx, create.ID, client.ContainerInspectOptions{})
	if err != nil {
		return "", nil, err
	}

	// Handle case where container is on a custom network
	var containerIP string
	for _, ne := range inspect.Container.NetworkSettings.Networks {
		containerIP = ne.IPAddress.String()
		break
	}
	if containerIP == "" {
		return "", nil, fmt.Errorf("could not find container IP for session %s", sessionID)
	}

	targetAddr := fmt.Sprintf("%s:8080", containerIP)
	if !waitForPort(targetAddr, 5*time.Second) {
		// If it fails, maybe kill the container and return error
		return "", nil, fmt.Errorf("container started but port 8080 did not open, this is likely a networking issue")
	}

	s.sessions.Store(
		sessionID,
		targetAddr,
	)

	closer := func() {
		_, err := s.cli().ContainerStop(ctx, create.ID, client.ContainerStopOptions{
			Signal: "SIGKILL",
		})
		if err != nil {
			log.Warn().Err(err).Msg("unable to stop container")
		}
		_, err = s.cli().ContainerRemove(ctx, create.ID, client.ContainerRemoveOptions{
			RemoveVolumes: true,
			Force:         true,
		})
		if err != nil {
			log.Warn().Err(err).Msg("unable to remove container")
		}
	}

	return urlPrefix, closer, nil
}
