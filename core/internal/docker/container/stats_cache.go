package container

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sync"
	"time"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

// statsConcurrency bounds the instantaneous fan-out against the daemon.
// Samples are one-shot and complete quickly; a modest bound smooths CPU and
// socket-proxy load on large hosts without affecting the five-second cadence.
const statsConcurrency = 8

// inspectData caches the inspect-only fields served with stats. An entry is
// valid while the summary's Status text ("Up 3 minutes", "Exited (0)...") is
// unchanged: the daemon rewrites it whenever the underlying state moves —
// including restarts ("Up 1 second") — so the cache refreshes itself exactly
// when it could be stale instead of paying one ContainerInspect per container
// on every poll.
type inspectData struct {
	status       string
	startedAt    string
	restartCount int32
}

// hostStatsCache carries per-host inspect data between stats requests. It is
// keyed package-wide by the moby client — one per connected host — because
// container.Service is rebuilt on every RPC and cannot hold state itself.
type hostStatsCache struct {
	mu       sync.Mutex
	inspects map[string]inspectData
	cpu      map[string]cpuSample
}

type cpuSample struct {
	startedAt string
	total     uint64
	system    uint64
	sampledAt time.Time
	percent   float64
}

var hostCaches syncmap.Map[*client.Client, *hostStatsCache]

func cacheFor(cli *client.Client) *hostStatsCache {
	cache, _ := hostCaches.LoadOrStore(cli, &hostStatsCache{
		inspects: make(map[string]inspectData),
		cpu:      make(map[string]cpuSample),
	})
	return cache
}

// prune drops cached state for containers that no longer exist, so the map
// doesn't grow forever as containers are recreated. Call it only with a full
// host listing: a filtered subset would evict live neighbors.
func (c *hostStatsCache) prune(live map[string]struct{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for id := range c.inspects {
		if _, ok := live[id]; !ok {
			delete(c.inspects, id)
		}
	}
	for id := range c.cpu {
		if _, ok := live[id]; !ok {
			delete(c.cpu, id)
		}
	}
}

// statsReadTimeout caps a single container's stats collection so one wedged
// container can never stall a whole streaming cycle.
const statsReadTimeout = 8 * time.Second

// StatsStream reads every container's stats concurrently — one goroutine per
// container, each with its own timeout — and hands each result to emit as
// soon as it is ready. emit is called from a single goroutine, so it may
// write to a network stream without further locking. Failed containers are
// skipped, not fatal.
func (s *Service) StatsStream(ctx context.Context, containers []container.Summary, emit func(Stats)) {
	cache := cacheFor(s.Client)

	ch := make(chan Stats)
	sem := make(chan struct{}, statsConcurrency)
	var wg sync.WaitGroup
	for _, cont := range containers {
		wg.Add(1)
		go func(cont container.Summary) {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
				defer func() { <-sem }()
			case <-ctx.Done():
				return
			}

			cctx, cancel := context.WithTimeout(ctx, statsReadTimeout)
			defer cancel()

			stat, err := s.statsFor(cctx, cache, cont)
			if err != nil {
				if !errors.Is(err, context.Canceled) {
					log.Warn().Err(err).Str("container", cont.ID[:12]).Msg("could not collect stats, skipping...")
				}
				return
			}
			select {
			case ch <- stat:
			case <-ctx.Done():
			}
		}(cont)
	}
	go func() {
		wg.Wait()
		close(ch)
	}()

	for stat := range ch {
		emit(stat)
	}
}

// collectStats gathers stats for the given containers with bounded concurrency,
// preserving input order. Containers that fail are skipped, not fatal.
func (s *Service) collectStats(ctx context.Context, containers []container.Summary) []Stats {
	cache := cacheFor(s.Client)

	results := make([]*Stats, len(containers))
	sem := make(chan struct{}, statsConcurrency)
	var wg sync.WaitGroup
	for i, cont := range containers {
		wg.Add(1)
		go func(i int, cont container.Summary) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			stat, err := s.statsFor(ctx, cache, cont)
			if err != nil {
				if !errors.Is(err, context.Canceled) {
					log.Warn().Err(err).Str("container", cont.ID[:12]).Msg("could not collect stats, skipping...")
				}
				return
			}
			results[i] = &stat
		}(i, cont)
	}
	wg.Wait()

	out := make([]Stats, 0, len(containers))
	for _, r := range results {
		if r != nil {
			out = append(out, *r)
		}
	}
	return out
}

// MetricsPending marks a Stats carrying only identity fields, streamed ahead
// of the real reading so the UI paints rows instantly while the daemon
// samples (~1s per container). The UI renders metric cells as pending until
// the real stats replace the row.
const MetricsPending = -1

// IdentityStats returns the summary's identity fields only, metrics pending.
func IdentityStats(info container.Summary) Stats {
	return Stats{
		ID:        info.ID[:12],
		Name:      info.Names[0],
		Image:     info.Image,
		State:     string(info.State),
		Health:    summaryHealth(info),
		IPAddress: summaryIPs(info),
		CPUUsage:  MetricsPending,
	}
}

func (s *Service) statsFor(ctx context.Context, cache *hostStatsCache, info container.Summary) (Stats, error) {
	stat := IdentityStats(info)
	stat.CPUUsage = 0

	// inspect-only fields, served from cache while the container's status text
	// is unchanged; non-fatal so a race with a disappearing container can't
	// take the whole table down
	var startedAt string
	if insp, err := s.inspectDataFor(ctx, cache, info); err == nil {
		stat.StartedAt = insp.startedAt
		startedAt = insp.startedAt
		stat.RestartCount = insp.restartCount
	} else if !errors.Is(err, context.Canceled) {
		log.Debug().Err(err).Str("container", stat.ID).Msg("could not inspect container for stats")
	}

	// a container that isn't running has no live metrics to read
	if stat.State != "running" {
		cache.mu.Lock()
		delete(cache.cpu, info.ID)
		cache.mu.Unlock()
		return stat, nil
	}

	statsJSON, err := s.readStats(ctx, info.ID)
	if err != nil {
		return Stats{}, err
	}

	stat.CPUUsage = cache.cpuPercent(info.ID, startedAt, statsJSON)
	stat.MemoryUsage = formatMemory(statsJSON)
	stat.MemoryLimit = statsJSON.MemoryStats.Limit
	stat.NetworkRx, stat.NetworkTx = formatNetwork(statsJSON)
	stat.BlockRead, stat.BlockWrite = formatDiskIO(statsJSON)

	return stat, nil
}

func (c *hostStatsCache) cpuPercent(id, startedAt string, current container.StatsResponse) float64 {
	now := time.Now()
	next := cpuSample{
		startedAt: startedAt,
		total:     current.CPUStats.CPUUsage.TotalUsage,
		system:    current.CPUStats.SystemUsage,
		sampledAt: now,
	}
	c.mu.Lock()
	previous, ok := c.cpu[id]
	if !ok || previous.startedAt != startedAt {
		c.cpu[id] = next
		c.mu.Unlock()
		return 0
	}
	// Two open clients commonly poll on the same five-second boundary. Reuse
	// the just-computed value instead of replacing the baseline with an almost
	// identical sample (which creates noisy near-zero deltas for one client).
	if now.Sub(previous.sampledAt) < time.Second {
		c.mu.Unlock()
		return previous.percent
	}
	next.percent = formatCPU(current, previous.total, previous.system)
	c.cpu[id] = next
	c.mu.Unlock()
	return next.percent
}

func (s *Service) readStats(ctx context.Context, id string) (container.StatsResponse, error) {
	// A one-shot sample returns immediately. The previous counters are kept in
	// hostStatsCache, so CPU is calculated over the normal refresh interval
	// instead of asking the daemon to spend an extra second sampling every
	// container during every cycle.
	resp, err := s.Client.ContainerStats(ctx, id, client.ContainerStatsOptions{
		IncludePreviousSample: false,
	})
	if err != nil {
		return container.StatsResponse{}, fmt.Errorf("failed to get stats for cont %s: %w", id[:12], err)
	}
	defer fileutil.Close(resp.Body)

	var statsJSON container.StatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&statsJSON); err != nil {
		return container.StatsResponse{}, fmt.Errorf("failed to unmarshal body for cont %s: %w", id[:12], err)
	}
	return statsJSON, nil
}

func (s *Service) inspectDataFor(ctx context.Context, cache *hostStatsCache, info container.Summary) (inspectData, error) {
	cache.mu.Lock()
	cached, ok := cache.inspects[info.ID]
	cache.mu.Unlock()
	if ok && cached.status == info.Status {
		return cached, nil
	}

	inspect, err := s.Client.ContainerInspect(ctx, info.ID, client.ContainerInspectOptions{})
	if err != nil {
		return inspectData{}, err
	}

	data := inspectData{
		status:       info.Status,
		restartCount: int32(inspect.Container.RestartCount),
	}
	if state := inspect.Container.State; state != nil {
		data.startedAt = state.StartedAt
	}

	cache.mu.Lock()
	cache.inspects[info.ID] = data
	cache.mu.Unlock()
	return data, nil
}

func summaryHealth(info container.Summary) string {
	// Health is nil when the daemon reports no healthcheck data at all
	// (depends on daemon/API version) — dereferencing blindly panics
	if info.Health == nil || info.Health.Status == container.NoHealthcheck {
		return ""
	}
	return string(info.Health.Status)
}

func summaryIPs(info container.Summary) []string {
	ips := TraefikHosts(info.Labels)
	for _, netConf := range info.NetworkSettings.Networks {
		ip := netConf.IPAddress.String()
		if ip != "invalid IP" && ip != "" {
			ips = append(ips, ip)
		}
	}
	// map iteration order is random; keep the column stable between polls
	slices.Sort(ips)
	return slices.Compact(ips)
}
