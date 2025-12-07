package container

import (
	"context"
	"errors"
	"fmt"
	"io"

	lu "github.com/RA341/dockman/pkg/listutils"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
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

func (s *Service) ContainerExec(ctx context.Context, containerID string, cmd string) (client.HijackedResponse, error) {
	execConfig := client.ExecCreateOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		TTY:          true,
		Cmd:          []string{cmd},
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
	})
	if err != nil {
		return nil, false, fmt.Errorf("unable to get container logs: %w", err)
	}

	return logStream, inspect.Container.Config.Tty, nil
}

func (s *Service) ContainerStats(ctx context.Context, filter client.ContainerListOptions) ([]Stats, error) {
	contRes, err := s.Client.ContainerList(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}
	containers := contRes.Items

	if len(containers) == 0 {
		return []Stats{}, nil
	}

	statsList := s.ContainerGetStatsFromList(ctx, containers)
	return statsList, nil
}

func (s *Service) ContainerGetStatsFromList(ctx context.Context, containers []container.Summary) []Stats {
	return lu.ParallelLoop(containers, func(r container.Summary) (Stats, bool) {
		stats, err := s.getAndFormatStats(ctx, r)
		if err != nil && !errors.Is(err, context.Canceled) {
			log.Warn().Err(err).Str("container", r.ID[:12]).Msg("could not convert stats, skipping...")
			return Stats{}, false
		}
		return stats, true
	})
}
