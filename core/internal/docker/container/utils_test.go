package container

import (
	"testing"

	mobycontainer "github.com/moby/moby/api/types/container"
)

func TestFormatCPUFromCachedCounters(t *testing.T) {
	stats := mobycontainer.StatsResponse{}
	stats.CPUStats.CPUUsage.TotalUsage = 200
	stats.CPUStats.SystemUsage = 2000
	stats.CPUStats.OnlineCPUs = 4

	if got := formatCPU(stats, 100, 1000); got != 40 {
		t.Fatalf("formatCPU() = %v, want 40", got)
	}
}

func TestFormatCPURejectsResetCounters(t *testing.T) {
	stats := mobycontainer.StatsResponse{}
	stats.CPUStats.CPUUsage.TotalUsage = 100
	stats.CPUStats.SystemUsage = 1000
	stats.CPUStats.OnlineCPUs = 2

	if got := formatCPU(stats, 200, 2000); got != 0 {
		t.Fatalf("formatCPU() after counter reset = %v, want 0", got)
	}
}

func TestFormatCPUClampsImpossibleFirstDelta(t *testing.T) {
	stats := mobycontainer.StatsResponse{}
	stats.CPUStats.CPUUsage.TotalUsage = 10_000
	stats.CPUStats.SystemUsage = 100
	stats.CPUStats.OnlineCPUs = 2

	if got := formatCPU(stats, 0, 0); got != 200 {
		t.Fatalf("formatCPU() = %v, want two-core ceiling 200", got)
	}
}
