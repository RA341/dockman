package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/RA341/dockman/pkg"
	"github.com/docker/compose/v2/pkg/api"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
	"github.com/rs/zerolog/log"
	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/mem"
	"io"
	"sync"
	"time"
)

// SystemInfo holds all the collected system metrics.
type SystemInfo struct {
	CPU    float64 // Total CPU usage percentage
	Memory *mem.VirtualMemoryStat
}

// ContainerInfo holds metrics for a single Docker container.
type ContainerInfo struct {
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

type ContainerService struct {
	daemon *client.Client
}

func filterByLabels(projectname string) {
	containerFilters := filters.NewArgs()
	projectLabel := fmt.Sprintf("%s=%s", api.ProjectLabel, projectname)
	containerFilters.Add("label", projectLabel)
}

func (s *ContainerService) ListContainers(ctx context.Context, filter container.ListOptions) ([]container.Summary, error) {
	containers, err := s.daemon.ContainerList(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}

	return containers, nil
}

func (s *ContainerService) StatContainers(ctx context.Context, filter container.ListOptions) ([]*ContainerInfo, error) {
	containers, err := s.ListContainers(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}

	var statsList []*ContainerInfo
	if len(containers) == 0 {
		return statsList, nil
	}

	contChan := make(chan *ContainerInfo, len(containers))
	var wg sync.WaitGroup

	for _, cont := range containers {
		wg.Add(1)
		go func(cont container.Summary) {
			defer wg.Done()
			stats, err := s.ConvertStats(ctx, cont)
			if err != nil {
				log.Warn().Err(err).Str("container", cont.ID[:12]).Msg("could not convert stats, skipping...")
				return
			}
			contChan <- stats
		}(cont)
	}

	go func() {
		wg.Wait()
		close(contChan)
	}()

	for c := range contChan {
		statsList = append(statsList, c)
	}

	return statsList, nil
}

func (s *ContainerService) ConvertStats(ctx context.Context, info container.Summary) (*ContainerInfo, error) {
	contId := info.ID[:12]
	// Get the resource usage statistics for the cont.
	// The `stream` argument is set to `false` to get a single snapshot and not a continuous stream.
	stats, err := s.daemon.ContainerStats(ctx, info.ID, false)
	if err != nil {
		return nil, fmt.Errorf("failed to get stats for cont %s: %w", contId, err)
	}
	defer pkg.CloseFile(stats.Body)

	body, err := io.ReadAll(stats.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read body for cont %s: %w", contId, err)
	}
	var statsJSON container.StatsResponse
	if err := json.Unmarshal(body, &statsJSON); err != nil {
		return nil, fmt.Errorf("failed to unmarshal body for cont %s: %w", contId, err)
	}

	cpuPercent := formatCPU(statsJSON)
	rx, tx := formatNetwork(statsJSON)
	blkRead, blkWrite := formatDiskIO(statsJSON)

	return &ContainerInfo{
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

func (s *ContainerService) GetStats(ctx context.Context, filter container.ListOptions) (*SystemInfo, []*ContainerInfo, error) {
	systemInfo, err := getSystemInfo()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get system info: %w", err)
	}

	containerInfo, err := s.StatContainers(ctx, filter)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get container stats: %w", err)
	}

	return systemInfo, containerInfo, nil
}

// getSystemInfo collects and returns the current system-wide metrics.
func getSystemInfo() (*SystemInfo, error) {
	// --- Memory ---
	vmStat, err := mem.VirtualMemory()
	if err != nil {
		return nil, fmt.Errorf("error getting memory info: %w", err)
	}

	// --- CPU ---
	// Get CPU usage percentage over a 1-second interval.
	cpuPercentages, err := cpu.Percent(time.Second, false)
	if err != nil {
		return nil, fmt.Errorf("error getting CPU usage: %w", err)
	}

	return &SystemInfo{
		CPU:    cpuPercentages[0],
		Memory: vmStat,
	}, nil
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

// Calculate Container CPU Usage
// This formula is the standard way to calculate CPU percentage from Docker's stats.
func formatCPU(statsJSON container.StatsResponse) float64 {
	cpuDelta := float64(statsJSON.CPUStats.CPUUsage.TotalUsage - statsJSON.PreCPUStats.CPUUsage.TotalUsage)
	systemCpuDelta := float64(statsJSON.CPUStats.SystemUsage - statsJSON.PreCPUStats.SystemUsage)
	numberCPUs := float64(statsJSON.CPUStats.OnlineCPUs)
	if numberCPUs == 0.0 {
		numberCPUs = float64(len(statsJSON.CPUStats.CPUUsage.PercpuUsage))
	}
	cpuPercent := (cpuDelta / systemCpuDelta) * numberCPUs * 100.0
	return cpuPercent
}
