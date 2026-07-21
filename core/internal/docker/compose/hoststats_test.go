package compose

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// guest column (9th value) is non-zero to prove it is excluded: the kernel
// already counts guest ticks inside user
const procSampleA = `cpu  1000 0 500 8000 500 0 0 0 100 0
cpu0 500 0 250 4000 250 0 0 0 50 0
cpu1 500 0 250 4000 250 0 0 0 50 0
intr 12345
MemTotal:       32000000 kB
MemFree:         8000000 kB
MemAvailable:   20000000 kB
Buffers:          500000 kB
`

// +2000 counted ticks, +1000 of them idle+iowait -> 50% busy; guest moved
// +800 and must not skew the result
const procSampleB = `cpu  1600 0 900 8800 700 0 0 0 900 0
cpu0 800 0 450 4400 350 0 0 0 450 0
cpu1 800 0 450 4400 350 0 0 0 450 0
intr 12345
MemTotal:       32000000 kB
MemFree:         8000000 kB
MemAvailable:   20000000 kB
Buffers:          500000 kB
`

func TestParseProcSample(t *testing.T) {
	s := parseProcSample(procSampleA)

	require.True(t, s.haveCPU)
	require.EqualValues(t, 2, s.cpus)
	require.EqualValues(t, uint64(10000), s.total) // guest excluded
	require.EqualValues(t, uint64(8500), s.idle)   // idle + iowait
	require.EqualValues(t, int64(32000000)*1024, s.memTotal)
	require.EqualValues(t, int64(20000000)*1024, s.memAvail)
}

func TestParseHostProc(t *testing.T) {
	stats := hostStatsFromSamples(parseProcSample(procSampleA), parseProcSample(procSampleB))

	require.EqualValues(t, 2, stats.CPUs)
	require.EqualValues(t, int64(32000000)*1024, stats.MemTotal)
	require.EqualValues(t, int64(12000000)*1024, stats.MemUsed) // total - available
	require.InDelta(t, 50.0, stats.CPUPercent, 0.01)
}

func TestParseHostProcCounterReset(t *testing.T) {
	// counters went backwards (host rebooted between reads): 0, not garbage
	stats := hostStatsFromSamples(parseProcSample(procSampleB), parseProcSample(procSampleA))
	require.Zero(t, stats.CPUPercent)
}

func TestParseHostProcGarbage(t *testing.T) {
	garbage := parseProcSample("not proc output at all")
	stats := hostStatsFromSamples(garbage, garbage)
	require.Zero(t, stats.CPUPercent)
	require.Zero(t, stats.MemTotal)
	require.Zero(t, stats.CPUs)
}
