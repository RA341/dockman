package viewer

import (
	"context"
	"fmt"

	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/google/uuid"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/ssh"
)

type AliasResolver func(relPath, alias string) (root string, relpath string, err error)
type DockerProvider func(host string) (*docker.Service, error)
type SSHProvider func(host string) (*ssh.Client, error)

type Service struct {
	pathResolver AliasResolver
	dockerCli    DockerProvider
	sshCli       SSHProvider
	config       *Config
	sessions     syncmap.Map[string, Session]
}

func New(
	cli DockerProvider,
	getPath AliasResolver,
	sshCli SSHProvider,
	config *Config,
) *Service {
	return &Service{
		dockerCli:    cli,
		sshCli:       sshCli,
		pathResolver: getPath,
		config:       config,
		sessions:     syncmap.Map[string, Session]{},
	}
}

func createViewerUrl(sessionId string) string {
	return "/api/protected/viewer/view/" + sessionId + `/`
}

// expects /view/{someId}
func recreateViewerUrl(strippedUrl string) string {
	return fmt.Sprintf("/api/protected/viewer%s/", strippedUrl)
}

func (s *Service) StartSession(ctx context.Context, relPath string, alias string, hostname string) (string, func(), error) {
	cli, err := s.dockerCli(hostname)
	if err != nil {
		return "", nil, err
	}
	cont := cli.Container.Client

	sessionID := uuid.New().String()
	urlPrefix := createViewerUrl(sessionID)

	fullpath, _, err := s.pathResolver(relPath, hostname)
	if err != nil {
		return "", nil, fmt.Errorf("could not get path for %s: %w", alias, err)
	}

	var netConf *network.NetworkingConfig
	if info.IsDocker() {
		//log.Debug().Msg("docker detected inspecting container")

		filterArgs := client.Filters{}
		filterArgs.Add("label", "dockman.container=true")

		list, err := cont.ContainerList(ctx, client.ContainerListOptions{
			Filters: filterArgs,
		})
		if err != nil {
			return "", nil, err
		}

		done := false
		for _, cont := range list.Items {
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
			done = true
			log.Debug().Str("path", fullpath).
				Str("netname", netName).
				Msg("using network")
			// we only care about the first dockman container multiple instances are not supported
			break
		}

		if !done {
			return "", nil, fmt.Errorf("could not find dockman container")
		}
	}

	image := "ghcr.io/coleifer/sqlite-web:latest"
	progress, err := cont.ImagePull(ctx, image, client.ImagePullOptions{})
	if err != nil {
		return "", nil, err
	}

	err = progress.Wait(context.Background())
	if err != nil {
		return "", nil, err
	}

	create, err := cont.ContainerCreate(ctx, client.ContainerCreateOptions{
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

	_, err = cont.ContainerStart(ctx, create.ID, client.ContainerStartOptions{})
	if err != nil {
		return "", nil, err
	}

	inspect, err := cont.ContainerInspect(ctx, create.ID, client.ContainerInspectOptions{})
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
	if !waitForPort(targetAddr, defaultContainerWait) {
		// If it fails, maybe kill the container and return error
		return "", nil, fmt.Errorf("container started but port 8080 did not open, this is likely a networking issue")
	}

	s.sessions.Store(
		sessionID,
		Session{
			host: hostname,
			addr: targetAddr,
		},
	)

	closer := func() {
		s.sessions.Delete(sessionID)

		_, err := cont.ContainerStop(ctx, create.ID, client.ContainerStopOptions{
			Signal: "SIGKILL",
		})
		if err != nil {
			log.Warn().Err(err).Msg("unable to stop container")
		}
		_, err = cont.ContainerRemove(ctx, create.ID, client.ContainerRemoveOptions{
			RemoveVolumes: true,
			Force:         true,
		})
		if err != nil {
			log.Warn().Err(err).Msg("unable to remove container")
		}
	}

	return urlPrefix, closer, nil
}
