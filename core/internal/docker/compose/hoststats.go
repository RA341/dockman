package compose

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// HostStats is whole-host usage read from /proc through the host's runner:
// locally /proc/stat and /proc/meminfo are not namespaced, and on ssh hosts
// the same files are read remotely — no agent needed.
type HostStats struct {
	CPUPercent float64
	MemUsed    int64
	MemTotal   int64
	CPUs       int32
}

// gap between the two /proc/stat reads a CPU percentage is computed from;
// top measures over a comparable window
const cpuSampleGap = 500 * time.Millisecond

type procSample struct {
	idle     uint64
	total    uint64
	cpus     int32
	memTotal int64
	memAvail int64
	haveCPU  bool
}

// HostStats measures usage over its own two-read window, so concurrent
// callers can't corrupt each other's baseline.
func (c *Service) HostStats(ctx context.Context) (HostStats, error) {
	before, err := c.readProc(ctx)
	if err != nil {
		return HostStats{}, err
	}
	select {
	case <-ctx.Done():
		return HostStats{}, ctx.Err()
	case <-time.After(cpuSampleGap):
	}
	after, err := c.readProc(ctx)
	if err != nil {
		return HostStats{}, err
	}
	return hostStatsFromSamples(before, after), nil
}

func (c *Service) readProc(ctx context.Context) (procSample, error) {
	out := new(bytes.Buffer)
	errW := new(bytes.Buffer)
	if err := c.runner.Run(ctx, []string{"cat", "/proc/stat", "/proc/meminfo"}, ".", out, errW); err != nil {
		if errW.Len() > 0 {
			return procSample{}, fmt.Errorf("%s", errW.String())
		}
		return procSample{}, err
	}
	return parseProcSample(out.String()), nil
}

// parseProcSample digests concatenated /proc/stat + /proc/meminfo output.
func parseProcSample(raw string) procSample {
	var s procSample

	for _, line := range strings.Split(raw, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch {
		case fields[0] == "cpu":
			// aggregate line: user nice system idle iowait irq softirq steal
			// guest guest_nice — guest time is already included in user, so
			// counting fields 8+ again would inflate the busy share
			for i, f := range fields[1:] {
				if i >= 8 {
					break
				}
				v, err := strconv.ParseUint(f, 10, 64)
				if err != nil {
					continue
				}
				s.total += v
				if i == 3 || i == 4 { // idle + iowait count as idle time
					s.idle += v
				}
			}
			s.haveCPU = true
		case strings.HasPrefix(fields[0], "cpu"):
			// cpu0, cpu1... one per core
			s.cpus++
		case fields[0] == "MemTotal:":
			if kb, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
				s.memTotal = kb * 1024
			}
		case fields[0] == "MemAvailable:":
			if kb, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
				s.memAvail = kb * 1024
			}
		}
	}

	return s
}

// hostStatsFromSamples turns two /proc reads into usage numbers; CPU is the
// busy fraction of the interval between them, top-style.
func hostStatsFromSamples(before, after procSample) HostStats {
	stats := HostStats{
		MemTotal: after.memTotal,
		CPUs:     after.cpus,
	}
	if after.memTotal > after.memAvail {
		stats.MemUsed = after.memTotal - after.memAvail
	}

	// counters can reset (host reboot between reads): report 0, not garbage
	if before.haveCPU && after.haveCPU && after.total > before.total && after.idle >= before.idle {
		dTotal := float64(after.total - before.total)
		dIdle := float64(after.idle - before.idle)
		stats.CPUPercent = min(max((1-dIdle/dTotal)*100, 0), 100)
	}
	return stats
}
