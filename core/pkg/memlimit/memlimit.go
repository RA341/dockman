// Package memlimit derives the Go runtime soft memory limit (GOMEMLIMIT) from
// the container's cgroup memory limit.
//
// As of Go 1.26 the runtime is cgroup-aware for GOMAXPROCS but still does NOT
// derive GOMEMLIMIT from cgroups. Left unset, the garbage collector sizes the
// heap goal at roughly 2x the live heap (GOGC=100) and returns freed pages to
// the OS only lazily. Any transient spike — exporting/diving an image, replaying
// a container's log backlog, decoding stats — inflates RSS and then stays
// resident. In a memory-capped container that reads as steadily high memory and,
// at worst, an OOM kill.
//
// Configure reads the cgroup (v2 first, then v1) memory limit and hands the GC a
// soft limit at a fraction of it, leaving headroom for memory the Go GC cannot
// manage (goroutine stacks, the CGO/SQLite allocator, OS overhead). An explicit
// GOMEMLIMIT in the environment always wins and disables this logic.
package memlimit

import (
	"os"
	"runtime/debug"
	"strconv"
	"strings"

	"github.com/dustin/go-humanize"
	"github.com/rs/zerolog/log"
)

// defaultRatio is the fraction of the detected cgroup limit handed to the GC as
// its soft limit; the remainder is headroom for off-heap / CGO / stack memory.
const defaultRatio = 0.9

const (
	// cgroup v2 memory limit; the file holds "max" when unlimited.
	cgroupV2Max = "/sys/fs/cgroup/memory.max"
	// cgroup v1 memory limit.
	cgroupV1Max = "/sys/fs/cgroup/memory/memory.limit_in_bytes"
)

// unlimitedThreshold guards against cgroup v1's "no limit" sentinel, which is a
// page-aligned near-max int64 (PAGE_COUNTER_MAX). Any value at or above this is
// treated as unlimited rather than as a real limit.
const unlimitedThreshold = int64(1) << 62

// Configure sets the Go runtime soft memory limit from the cgroup memory limit
// and returns the applied limit in bytes. It returns 0 (a no-op) when GOMEMLIMIT
// is already set, when no cgroup limit is found, or when the cgroup is unlimited.
func Configure() int64 {
	return configure(defaultRatio, readCgroupLimit)
}

// configure is the testable core of Configure with an injectable cgroup reader.
func configure(ratio float64, read func() (int64, bool)) int64 {
	if v := strings.TrimSpace(os.Getenv("GOMEMLIMIT")); v != "" {
		// The runtime already parsed and applied GOMEMLIMIT at startup; never
		// second-guess an explicit operator choice.
		log.Info().Str("GOMEMLIMIT", v).Msg("respecting GOMEMLIMIT from environment")
		return 0
	}

	limit, ok := read()
	if !ok {
		log.Debug().Msg("no cgroup memory limit detected; leaving Go soft memory limit unset")
		return 0
	}

	soft := int64(float64(limit) * ratio)
	if soft <= 0 {
		return 0
	}

	debug.SetMemoryLimit(soft)
	log.Info().
		Str("cgroup_limit", humanize.IBytes(uint64(limit))).
		Str("go_mem_limit", humanize.IBytes(uint64(soft))).
		Msg("configured Go soft memory limit from cgroup")
	return soft
}

// readCgroupLimit returns the cgroup memory limit in bytes, preferring cgroup v2
// and falling back to v1. ok is false when no finite limit is configured.
func readCgroupLimit() (int64, bool) {
	if v, ok := parseLimitFile(cgroupV2Max); ok {
		return v, true
	}
	return parseLimitFile(cgroupV1Max)
}

// parseLimitFile reads a single-value cgroup limit file and returns the byte
// limit. ok is false when the file is missing, empty, "max", or an unlimited
// sentinel.
func parseLimitFile(path string) (int64, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0, false
	}

	s := strings.TrimSpace(string(raw))
	if s == "" || s == "max" { // cgroup v2 unlimited
		return 0, false
	}

	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil || v <= 0 || v >= unlimitedThreshold { // cgroup v1 unlimited sentinel
		return 0, false
	}
	return v, true
}
