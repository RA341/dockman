package container

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/docker/compose/v5/pkg/api"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
)

// LocalClient is the name given to the local docker daemon instance
const LocalClient = "local"

type Service struct {
	Client *client.Client
}

func New(client *client.Client) *Service {
	return &Service{
		Client: client,
	}
}

// Cli helper method to get access to raw docker client
func (s *Service) Cli() *client.Client {
	return s.Client
}

func (s *Service) ContainersList(ctx context.Context) ([]container.Summary, error) {
	list, err := s.Client.ContainerList(ctx, client.ContainerListOptions{
		All:    true,
		Size:   false,
		Latest: false,
	})
	if err != nil {
		return nil, err
	}
	return list.Items, nil
}

func (s *Service) ContainerListByIDs(ctx context.Context, containerID ...string) ([]container.Summary, error) {
	filterArgs := client.Filters{}
	for _, id := range containerID {
		filterArgs.Add("id", id)
	}

	options := client.ContainerListOptions{
		All:     true, // Include stopped containers
		Filters: filterArgs,
	}

	list, err := s.Client.ContainerList(ctx, options)
	if err != nil {
		return nil, fmt.Errorf("unable to fetch container info: %w", err)
	}

	return list.Items, nil
}

func (s *Service) ContainersStart(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		_, err := s.Client.ContainerStart(ctx, cont, client.ContainerStartOptions{})
		if err != nil {
			return fmt.Errorf("unable to start Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *Service) ContainersStop(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		_, err := s.Client.ContainerStop(ctx, cont, client.ContainerStopOptions{})
		if err != nil {
			return fmt.Errorf("unable to stop Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *Service) ContainersPause(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		_, err := s.Client.ContainerPause(ctx, cont, client.ContainerPauseOptions{})
		if err != nil {
			return fmt.Errorf("unable to pause Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *Service) ContainersUnpause(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		_, err := s.Client.ContainerUnpause(ctx, cont, client.ContainerUnpauseOptions{})
		if err != nil {
			return fmt.Errorf("unable to unpause Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *Service) ContainersRestart(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		_, err := s.Client.ContainerRestart(ctx, cont, client.ContainerRestartOptions{})
		if err != nil {
			return fmt.Errorf("unable to restart Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *Service) ContainersRemove(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		_, err := s.Client.ContainerRemove(ctx, cont, client.ContainerRemoveOptions{
			Force: true,
		})
		if err != nil {
			return fmt.Errorf("unable to remove Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *Service) ContainerExec(ctx context.Context, containerID string, cmd string, user string) (client.HijackedResponse, error) {
	execConfig := client.ExecCreateOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		TTY:          true,
		Cmd:          []string{cmd},
		User:         user,
	}

	execResp, err := s.Client.ExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return client.HijackedResponse{}, fmt.Errorf("error creating exec into container: %w", err)
	}

	resp, err := s.Client.ExecAttach(
		ctx,
		execResp.ID,
		client.ExecAttachOptions{TTY: true},
	)
	if err != nil {
		return client.HijackedResponse{}, fmt.Errorf("error creating shell into container: %w", err)
	}

	return resp.HijackedResponse, nil
}

// defaultLogTail bounds how much history is replayed when a log stream opens.
// Without a Tail the daemon streams the container's entire json-file backlog
// before following, a large transient memory spike on every open for a
// long-lived container.
const defaultLogTail = "1000"

func (s *Service) ContainerLogs(ctx context.Context, containerID string) (io.ReadCloser, bool, error) {
	inspect, err := s.Client.ContainerInspect(ctx, containerID, client.ContainerInspectOptions{})
	if err != nil {
		return nil, false, fmt.Errorf("unable to inspect container: %w", err)
	}

	logStream, err := s.Client.ContainerLogs(ctx, containerID, client.ContainerLogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Details:    true,
		Tail:       defaultLogTail,
	})
	if err != nil {
		return nil, false, fmt.Errorf("unable to get container logs: %w", err)
	}

	return logStream, inspect.Container.Config.Tty, nil
}

// ContainersListRunning lists ALL containers (any state) and prunes cached
// sampling state for containers that no longer exist (this is the host-wide
// listing the stats views poll). Non-running containers flow through the
// stats stream as identity-only rows — statsFor skips their metric read —
// so state counts (stopped/paused/...) stay truthful without extra cost.
func (s *Service) ContainersListRunning(ctx context.Context) ([]container.Summary, error) {
	list, err := s.Client.ContainerList(ctx, client.ContainerListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}

	live := make(map[string]struct{}, len(list.Items))
	for _, c := range list.Items {
		live[c.ID] = struct{}{}
	}
	cacheFor(s.Client).prune(live)

	return list.Items, nil
}

func (s *Service) Stats(ctx context.Context, filter client.ContainerListOptions) ([]Stats, error) {
	contRes, err := s.Client.ContainerList(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}
	containers := contRes.Items

	// this is the host-wide listing: drop cached sampling state for
	// containers that no longer exist
	live := make(map[string]struct{}, len(containers))
	for _, c := range containers {
		live[c.ID] = struct{}{}
	}
	cacheFor(s.Client).prune(live)

	if len(containers) == 0 {
		return []Stats{}, nil
	}

	statsList := s.ContainerGetStatsFromList(ctx, containers)
	return statsList, nil
}

func (s *Service) ContainerGetStatsFromList(ctx context.Context, containers []container.Summary) []Stats {
	return s.collectStats(ctx, containers)
}

// ContainerListByComposeFile returns every container whose compose
// config-files label references the given absolute compose file path. One
// host-wide listing matched in memory: a label equality filter can't be used
// because config_files may hold several comma-separated paths (overrides).
func (s *Service) ContainerListByComposeFile(ctx context.Context, absPath string) ([]container.Summary, error) {
	list, err := s.Client.ContainerList(ctx, client.ContainerListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}

	var out []container.Summary
	for _, ct := range list.Items {
		cfg := ct.Labels[api.ConfigFilesLabel]
		if cfg == "" {
			continue
		}
		for _, p := range strings.Split(cfg, ",") {
			if strings.TrimSpace(p) == absPath {
				out = append(out, ct)
				break
			}
		}
	}
	return out, nil
}

func (s *Service) Inspect(ctx context.Context, containerId string) (container.InspectResponse, error) {
	inspect, err := s.Cli().ContainerInspect(
		ctx,
		containerId,
		client.ContainerInspectOptions{
			Size: true,
		},
	)
	if err != nil {
		return container.InspectResponse{}, err
	}
	return inspect.Container, nil
}

func (s *Service) Top(ctx context.Context, containerId string) (client.ContainerTopResult, error) {
	return s.Cli().ContainerTop(ctx, containerId, client.ContainerTopOptions{
		Arguments: nil,
	})
}
