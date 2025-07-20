package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/RA341/dockman/pkg"
	"github.com/docker/compose/v2/pkg/api"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/rs/zerolog/log"
	"io"
	"os"
	"strings"
	"sync"
)

type ContainerService struct {
	daemon *client.Client
}

func NewContainerService(cli *client.Client) *ContainerService {
	return &ContainerService{daemon: cli}
}

func (s *ContainerService) ListContainers(ctx context.Context, filter container.ListOptions) ([]container.Summary, error) {
	containers, err := s.daemon.ContainerList(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}

	return containers, nil
}

func (s *ContainerService) GetStats(ctx context.Context, filter container.ListOptions) ([]ContainerStats, error) {
	containerInfo, err := s.StatContainers(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to get container stats: %w", err)
	}

	return containerInfo, nil
}

func (s *ContainerService) ContainerLogs(ctx context.Context, containerID string) (io.ReadCloser, error) {
	return s.daemon.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Details:    true,
	})
}

func (s *ContainerService) StatContainers(ctx context.Context, filter container.ListOptions) ([]ContainerStats, error) {
	containers, err := s.ListContainers(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}

	if len(containers) == 0 {
		return []ContainerStats{}, nil
	}

	statsList := s.GetStatsFromContainerList(ctx, containers)

	return statsList, nil
}

func (s *ContainerService) GetStatsFromContainerList(ctx context.Context, containers []container.Summary) []ContainerStats {
	return parallelLoop(containers, func(r container.Summary) (ContainerStats, bool) {
		stats, err := s.getStats(ctx, r)
		if err != nil && !errors.Is(err, context.Canceled) {
			log.Warn().Err(err).Str("container", r.ID[:12]).Msg("could not convert stats, skipping...")
			return ContainerStats{}, false
		}
		return stats, true
	})
}

func (s *ContainerService) getStats(ctx context.Context, info container.Summary) (ContainerStats, error) {
	contId := info.ID[:12]
	stats, err := s.daemon.ContainerStats(ctx, info.ID, false)
	if err != nil {
		return ContainerStats{}, fmt.Errorf("failed to get stats for cont %s: %w", contId, err)
	}
	defer pkg.CloseCloser(stats.Body)

	body, err := io.ReadAll(stats.Body)
	if err != nil {
		return ContainerStats{}, fmt.Errorf("failed to read body for cont %s: %w", contId, err)
	}
	var statsJSON container.StatsResponse
	if err := json.Unmarshal(body, &statsJSON); err != nil {
		return ContainerStats{}, fmt.Errorf("failed to unmarshal body for cont %s: %w", contId, err)
	}

	cpuPercent := formatCPU(statsJSON)
	rx, tx := formatNetwork(statsJSON)
	blkRead, blkWrite := formatDiskIO(statsJSON)

	return ContainerStats{
		ID:          contId,
		Name:        info.Names[0],
		CPUUsage:    cpuPercent,
		MemoryUsage: statsJSON.MemoryStats.Usage,
		MemoryLimit: statsJSON.MemoryStats.Limit,
		NetworkRx:   rx,
		NetworkTx:   tx,
		BlockRead:   blkRead,
		BlockWrite:  blkWrite,
	}, nil
}

// UpdateContainersForImage finds all containers using the specified image,
// pulls the latest version of the image, and recreates the containers
// with the new image while preserving their configuration.
// todo cleanup
func (s *ContainerService) UpdateContainersForImage(ctx context.Context, cli *client.Client, imageName string) error {
	log.Info().Str("image", imageName).Msg("Starting update for image")

	log.Info().Msg("Pulling latest image to ensure we have the newest version...")
	reader, err := cli.ImagePull(ctx, imageName, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("failed to pull image %s: %w", imageName, err)
	}
	defer pkg.CloseCloser(reader)

	// Copy the pull output to stdout to show progress
	if _, err := io.Copy(os.Stdout, reader); err != nil {
		return fmt.Errorf("failed to read image pull response: %w", err)
	}
	log.Info().Msg("Image pull complete.")

	// Find all containers using this image
	containerFilters := filters.NewArgs()
	containerFilters.Add("ancestor", imageName)

	containers, err := cli.ContainerList(ctx, container.ListOptions{
		All:     true, // Consider both running and stopped containers
		Filters: containerFilters,
	})
	if err != nil {
		return fmt.Errorf("failed to list containers for image %s: %w", imageName, err)
	}

	if len(containers) == 0 {
		log.Info().Msgf("No containers found using image %s. Nothing to do.", imageName)
		return nil
	}

	log.Info().Msgf("Found %d container(s) to update.", len(containers))

	// Recreate each container
	for _, oldContainer := range containers {
		containerName := "N/A"
		if len(oldContainer.Names) > 0 {
			// Names have a leading '/' which we should trim
			containerName = strings.TrimPrefix(oldContainer.Names[0], "/")
		}
		log.Info().Msgf("Processing container: %s (ID: %s)", containerName, oldContainer.ID[:12])

		// Inspect the old container to get its configuration
		log.Info().Msgf("Inspecting old container %s...", containerName)
		inspectedData, err := cli.ContainerInspect(ctx, oldContainer.ID)
		if err != nil {
			return fmt.Errorf("failed to inspect container %s: %w", oldContainer.ID, err)
		}

		// Stop and remove the old container
		log.Info().Msgf("Stopping old container %s...", containerName)
		if err := cli.ContainerStop(ctx, oldContainer.ID, container.StopOptions{}); err != nil {
			return fmt.Errorf("failed to stop container %s: %w", oldContainer.ID, err)
		}
		log.Info().Msgf("Removing old container %s...", containerName)
		if err := cli.ContainerRemove(ctx, oldContainer.ID, container.RemoveOptions{}); err != nil {
			return fmt.Errorf("failed to remove container %s: %w", oldContainer.ID, err)
		}

		// Create a new container with the same configuration but the new image
		log.Info().Msgf("Creating new container %s with updated image...", containerName)

		// The inspected config has the old image name, so we update it.
		inspectedData.Config.Image = imageName

		// Prepare the networking configuration
		networkingConfig := &network.NetworkingConfig{
			EndpointsConfig: inspectedData.NetworkSettings.Networks,
		}

		newContainer, err := cli.ContainerCreate(ctx,
			inspectedData.Config,     // Container configuration
			inspectedData.HostConfig, // Host configuration (ports, volumes, etc.)
			networkingConfig,         // Networking configuration
			nil,                      // Platform (can be nil)
			containerName,            // The original container name
		)
		if err != nil {
			return fmt.Errorf("failed to create new container for %s: %w", containerName, err)
		}

		// Start the new container
		log.Info().Msgf("Starting new container %s (ID: %s)...", containerName, newContainer.ID[:12])
		if err := cli.ContainerStart(ctx, newContainer.ID, container.StartOptions{}); err != nil {
			return fmt.Errorf("failed to start new container %s: %w", newContainer.ID, err)
		}

		log.Info().Msgf("Successfully updated container %s.", containerName)
	}

	// Prune old, dangling images
	log.Info().Msg("Cleaning up old, dangling images...")
	pruneReport, err := cli.ImagesPrune(ctx, filters.Args{})
	if err != nil {
		log.Warn().Err(err).Msg("failed to prune images") // Non-fatal
	}
	if len(pruneReport.ImagesDeleted) > 0 {
		log.Info().Msgf("Pruned %d images, reclaimed %d bytes.", len(pruneReport.ImagesDeleted), pruneReport.SpaceReclaimed)
	} else {
		log.Info().Msg("No old images to prune.")
	}

	log.Info().Str("image", imageName).Msg("Update process for image %s completed successfully.")
	return nil
}

func formatDiskIO(statsJSON container.StatsResponse) (uint64, uint64) {
	var blkRead, blkWrite uint64
	for _, bioEntry := range statsJSON.BlkioStats.IoServiceBytesRecursive {
		switch bioEntry.Op {
		case "read":
			blkRead += bioEntry.Value
		case "write":
			blkWrite += bioEntry.Value
		}
	}
	return blkRead, blkWrite
}

// Collect Network and Disk I/O
func formatNetwork(statsJSON container.StatsResponse) (uint64, uint64) {
	var rx, tx uint64
	for _, v := range statsJSON.Networks {
		rx += v.RxBytes
		tx += v.TxBytes
	}
	return rx, tx
}

func formatCPU(statsJSON container.StatsResponse) float64 {
	cpuDelta := float64(statsJSON.CPUStats.CPUUsage.TotalUsage - statsJSON.PreCPUStats.CPUUsage.TotalUsage)
	systemCpuDelta := float64(statsJSON.CPUStats.SystemUsage - statsJSON.PreCPUStats.SystemUsage)
	numberCPUs := float64(statsJSON.CPUStats.OnlineCPUs)
	if numberCPUs == 0.0 {
		numberCPUs = float64(len(statsJSON.CPUStats.CPUUsage.PercpuUsage))
	}

	var cpuPercent = 0.0
	// Avoid division by zero
	if systemCpuDelta > 0.0 && cpuDelta > 0.0 {
		cpuPercent = (cpuDelta / systemCpuDelta) * numberCPUs * 100.0
	}

	return cpuPercent
}

func filterByLabels(projectname string) {
	containerFilters := filters.NewArgs()
	projectLabel := fmt.Sprintf("%s=%s", api.ProjectLabel, projectname)
	containerFilters.Add("label", projectLabel)
}

func parallelLoop[T any, R any](input []R, mapper func(R) (T, bool)) []T {
	contChan := make(chan T, len(input))

	var wg sync.WaitGroup
	for _, cont := range input {
		wg.Add(1)
		go func(i R) {
			defer wg.Done()
			res, ok := mapper(i)
			if ok {
				contChan <- res
			}
		}(cont)
	}

	go func() {
		wg.Wait()
		close(contChan)
	}()

	var result []T
	for c := range contChan {
		result = append(result, c)
	}

	return result
}

// ContainerStats holds metrics for a single Docker container.
type ContainerStats struct {
	ID          string
	Name        string
	CPUUsage    float64
	MemoryUsage uint64 // in bytes
	MemoryLimit uint64 // in bytes
	NetworkRx   uint64 // bytes received
	NetworkTx   uint64 // bytes sent
	BlockRead   uint64 // bytes read from block devices
	BlockWrite  uint64 // bytes written to block devices
}
