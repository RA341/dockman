package docker

import (
	"cmp"
	"context"
	"fmt"
	"io"
	"maps"
	"net/netip"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/docker/v1"
	contSrv "github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/updater"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/listutils"
	"github.com/docker/compose/v5/pkg/api"
	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
)

////////////////////////////////////////////
// 			Container Actions 			  //
////////////////////////////////////////////

func (h *Handler) ContainerList(ctx context.Context, req *connect.Request[v1.ContainerListRequest]) (*connect.Response[v1.ListResponse], error) {
	host, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	result, err := dkSrv.Container.ContainersList(ctx)
	if err != nil {
		return nil, err
	}

	rpcResult, count := h.containersToRpc(result, host, dkSrv)

	return connect.NewResponse(&v1.ListResponse{
		List:        rpcResult,
		StatusCount: count,
	}), err
}

func (h *Handler) ContainerStart(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	err = dkSrv.Container.ContainersStart(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerStop(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	err = dkSrv.Container.ContainersStop(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerPause(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	err = dkSrv.Container.ContainersPause(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerUnpause(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	err = dkSrv.Container.ContainersUnpause(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerRemove(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	err = dkSrv.Container.ContainersRemove(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerRestart(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	err = dkSrv.Container.ContainersRestart(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerInspect(ctx context.Context, req *connect.Request[v1.ContainerLogsRequest]) (*connect.Response[v1.ContainerInspectMessage], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	inspect, err := dkSrv.Container.Inspect(ctx, req.Msg.ContainerID)
	if err != nil {
		return nil, err
	}

	mounts := listutils.ToMap(inspect.Mounts, func(mt container.MountPoint) *v1.ContainerMount {
		return &v1.ContainerMount{
			Type:        string(mt.Type),
			Name:        mt.Name,
			Source:      mt.Source,
			Destination: mt.Destination,
			Driver:      mt.Driver,
			Mode:        mt.Mode,
			RW:          mt.RW,
		}
	})

	contConf := inspect.Config
	exposedPorts := slices.Collect(func(yield func(string) bool) {
		for k := range maps.Keys(contConf.ExposedPorts) {
			if !yield(k.String()) {
				return
			}
		}
	})

	config := &v1.ContainerConfig{
		Hostname:     contConf.Hostname,
		Domainname:   contConf.Domainname,
		User:         contConf.User,
		AttachStdin:  contConf.AttachStdin,
		AttachStdout: contConf.AttachStdout,
		AttachStderr: contConf.AttachStderr,
		Tty:          contConf.Tty,
		OpenStdin:    contConf.OpenStdin,
		StdinOnce:    contConf.StdinOnce,

		ArgsEscaped:  contConf.ArgsEscaped,
		Image:        contConf.Image,
		Env:          contConf.Env,
		Cmd:          contConf.Cmd,
		WorkingDir:   contConf.WorkingDir,
		Entrypoint:   contConf.Entrypoint,
		Labels:       contConf.Labels,
		Volumes:      slices.Collect(maps.Keys(contConf.Volumes)),
		ExposedPorts: exposedPorts,
	}

	return connect.NewResponse(&v1.ContainerInspectMessage{
		ID:        inspect.ID,
		Name:      inspect.Name,
		Created:   inspect.Created,
		Config:    config,
		Path:      inspect.Path,
		Image:     inspect.Image,
		HostsPath: inspect.HostsPath,
		Mounts:    mounts,
	}), nil
}

func (h *Handler) ContainerTop(ctx context.Context, req *connect.Request[v1.ContainerTopRequest]) (*connect.Response[v1.ContainerTopResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	top, err := dkSrv.Container.Top(ctx, req.Msg.ContainerId)
	if err != nil {
		return nil, err
	}

	tt := &v1.Top{
		Proc: listutils.ToMap(top.Processes, func(t []string) *v1.Process {
			return &v1.Process{Processes: t}
		}),
		Titles: top.Titles,
	}

	return connect.NewResponse(&v1.ContainerTopResponse{
		Top: tt,
	}), nil
}

// ContainerUpdate force-updates the given containers' images and streams
// per-step progress: pull the tag through the compose CLI runner (so the
// host's registry credentials apply), and when a newer image came down,
// recreate the container on it with rollback on failure.
func (h *Handler) ContainerUpdate(ctx context.Context, req *connect.Request[v1.ContainerRequest], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.WithClientAndStream(ctx, responseStream, func(dkSrv *Service, writer io.Writer) error {
		return dkSrv.Updater.ContainersForceUpdate(
			ctx,
			func(pullCtx context.Context, imageTag string) error {
				return dkSrv.Compose.PullImage(pullCtx, imageTag, writer)
			},
			writer,
			req.Msg.ContainerIds...,
		)
	})
}

func (h *Handler) ContainerStats(ctx context.Context, req *connect.Request[v1.StatsRequest]) (*connect.Response[v1.StatsResponse], error) {
	file := req.Msg.GetFile()
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	var containers []contSrv.Stats
	if file != nil {
		// file was passed load it from context
		containers, err = dkSrv.Compose.Stats(ctx, file.Filename)
	} else {
		// list all containers
		containers, err = dkSrv.Container.Stats(ctx, client.ContainerListOptions{})
	}
	if err != nil {
		return nil, err
	}

	field := req.Msg.GetSortBy().Enum()
	if field == nil {
		field = v1.SORT_FIELD_NAME.Enum()
	}
	sortFn := getSortFn(*field)
	orderby := *req.Msg.Order.Enum()

	// returns in desc order
	slices.SortFunc(containers, func(a, b contSrv.Stats) int {
		res := sortFn(a, b)
		if orderby == v1.ORDER_ASC {
			return -res // Reverse the comparison for descending order
		}
		return res
	})

	stats := make([]*v1.ContainerStats, len(containers))
	for i, cont := range containers {
		stats[i] = ToRPCStat(cont)
	}

	return connect.NewResponse(&v1.StatsResponse{
		Containers: stats,
	}), nil
}

func (h *Handler) HostStats(ctx context.Context, _ *connect.Request[v1.Empty]) (*connect.Response[v1.HostStatsResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	stats, err := dkSrv.Compose.HostStats(ctx)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.HostStatsResponse{
		CpuPercent: stats.CPUPercent,
		MemUsed:    stats.MemUsed,
		MemTotal:   stats.MemTotal,
		Cpus:       stats.CPUs,
	}), nil
}

// ContainerStatsStream emits each container's stats as soon as its read
// completes (the daemon needs ~1s per container to build a sample), so the
// client paints progressively instead of waiting for the slowest container.
// No server-side sort: order is arrival order, the client sorts.
func (h *Handler) ContainerStatsStream(ctx context.Context, req *connect.Request[v1.StatsRequest], stream *connect.ServerStream[v1.ContainerStats]) error {
	file := req.Msg.GetFile()
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return err
	}

	var containers []container.Summary
	if file != nil && file.Filename != "" {
		absPath, err := dkSrv.Compose.ComposeAbsPath(file.Filename)
		if err != nil {
			return err
		}
		containers, err = dkSrv.Container.ContainerListByComposeFile(ctx, absPath)
		if err != nil {
			return err
		}
	} else {
		containers, err = dkSrv.Container.ContainersListRunning(ctx)
		if err != nil {
			return err
		}
	}

	// paint-first: emit each container's identity immediately (metrics
	// pending) so every view fills in the time of a container listing; the
	// real stats replace the rows as each ~1s read completes
	for _, ct := range containers {
		if err := stream.Send(ToRPCStat(contSrv.IdentityStats(ct))); err != nil {
			return err
		}
	}

	var sendErr error
	dkSrv.Container.StatsStream(ctx, containers, func(st contSrv.Stats) {
		if sendErr != nil {
			return
		}
		sendErr = stream.Send(ToRPCStat(st))
	})
	return sendErr
}

// ContainerEvents streams this host's filtered container lifecycle events to
// the client. A keepalive frame goes out every 30s so an otherwise silent
// stream survives reverse-proxy idle timeouts. One daemon subscription is
// shared by every connected client (see container.SubscribeEvents).
func (h *Handler) ContainerEvents(ctx context.Context, req *connect.Request[v1.EventsRequest], stream *connect.ServerStream[v1.ContainerEvent]) error {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return err
	}

	eventsCh, unsubscribe := dkSrv.Container.SubscribeEvents()
	defer unsubscribe()

	keepalive := time.NewTicker(30 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case ev := <-eventsCh:
			if err := stream.Send(&v1.ContainerEvent{
				Action:        ev.Action,
				Status:        ev.Status,
				ContainerId:   ev.ID,
				ContainerName: ev.Name,
				Image:         ev.Image,
				TimeNano:      ev.TimeNano,
			}); err != nil {
				return err
			}
		case <-keepalive.C:
			if err := stream.Send(&v1.ContainerEvent{}); err != nil {
				return err
			}
		}
	}
}

func (h *Handler) ContainerLogs(ctx context.Context, req *connect.Request[v1.ContainerLogsRequest], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	if req.Msg.GetContainerID() == "" {
		return fmt.Errorf("container id is required")
	}
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return err
	}

	logsReader, tty, err := dkSrv.Container.ContainerLogs(ctx, req.Msg.GetContainerID())
	if err != nil {
		return err
	}
	defer fileutil.Close(logsReader)

	writer := &ContainerLogWriter{responseStream: responseStream}

	if tty {
		// tty streams dont need docker demultiplexing
		if _, err = io.Copy(writer, logsReader); err != nil {
			return err
		}
		return nil
	}

	// docker multiplexed stream
	_, err = stdcopy.StdCopy(writer, writer, logsReader)
	if err != nil {
		return err
	}

	return nil
}

// logsKeepAliveInterval paces empty LogLine frames so proxies do not cut the
// stream during quiet periods. 5s survives even aggressive idle timeouts
// (Traefik defaults to 10s); DOCKMAN_LOGS_KEEPALIVE overrides it in seconds.
var logsKeepAliveInterval = func() time.Duration {
	if raw := os.Getenv("DOCKMAN_LOGS_KEEPALIVE"); raw != "" {
		if secs, err := strconv.Atoi(raw); err == nil && secs > 0 {
			return time.Duration(secs) * time.Second
		}
	}
	return 5 * time.Second
}()

func (h *Handler) ContainerLogsStream(ctx context.Context, req *connect.Request[v1.LogsStreamRequest], responseStream *connect.ServerStream[v1.LogLine]) error {
	ids := req.Msg.GetContainerIds()
	if len(ids) == 0 {
		return fmt.Errorf("at least one container id is required")
	}
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return err
	}

	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	lines := make(chan contSrv.LogLine, 256)
	streamErr := make(chan error, 1)
	go func() {
		streamErr <- dkSrv.Container.LogsStream(streamCtx, ids, contSrv.LogsStreamOptions{
			Tail:   req.Msg.GetTail(),
			Since:  req.Msg.GetSince(),
			Until:  req.Msg.GetUntil(),
			Follow: req.Msg.GetFollow(),
		}, func(l contSrv.LogLine) {
			select {
			case lines <- l:
			case <-streamCtx.Done():
			}
		})
		// all reader goroutines are done: closing drains the buffered lines
		// through the single receive loop below, then ends the stream
		close(lines)
	}()

	keepalive := time.NewTicker(logsKeepAliveInterval)
	defer keepalive.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case line, ok := <-lines:
			if !ok {
				return <-streamErr
			}
			if err := responseStream.Send(logLineToProto(line)); err != nil {
				return err
			}
		case <-keepalive.C:
			if err := responseStream.Send(&v1.LogLine{}); err != nil {
				return err
			}
		}
	}
}

func logLineToProto(l contSrv.LogLine) *v1.LogLine {
	return &v1.LogLine{
		ContainerId:   l.ContainerID,
		ContainerName: l.ContainerName,
		Text:          l.Text,
		TimeNano:      l.TimeNano,
		Stream:        l.Stream,
	}
}

func (h *Handler) containersToRpc(result []container.Summary, host string, srv *Service) ([]*v1.ContainerList, map[string]int32) {
	var dockerResult []*v1.ContainerList
	statusCount := map[string]int32{}

	machineAddr := ""
	if host == contSrv.LocalClient {
		machineAddr = srv.DaemonAddr
	} else {
		// remote hosts
		machineAddr = srv.Container.Client.DaemonHost()
	}

	addr, err := netip.ParseAddr(machineAddr)
	if err != nil {
		addr, _ = netip.ParseAddr("0.0.0.0")
	}

	for _, stack := range result {
		statusCount[string(stack.State)]++

		//available, err := h.container().imageUpdateStore.GetUpdateAvailable(
		//	h.container().hostname,
		//	stack.ImageID,
		//)
		//if err != nil {
		//	log.Warn().Msg("Failed to get image update info")
		//}

		var portSlice []*v1.Port
		for _, p := range stack.Ports {
			if p.IP.Is4() {
				// override with custom IP
				p.IP = addr
				// ignore ipv6 ports no one uses it anyway
				portSlice = append(portSlice, toRPCPort(p))
			}
		}

		slices.SortFunc(portSlice, func(port1 *v1.Port, port2 *v1.Port) int {
			if cmpResult := cmp.Compare(port1.Public, port2.Public); cmpResult != 0 {
				return cmpResult
			}
			// ports are equal, compare by type 'tcp or udp'
			return cmp.Compare(port1.Type, port2.Type)
		})

		dockerResult = append(dockerResult, h.ToProto(
			stack,
			portSlice,
			updater.ImageUpdate{},
			srv.Compose.DockmanPath(stack.Labels[api.ConfigFilesLabel]),
		))
	}
	return dockerResult, statusCount
}

func (h *Handler) ToProto(stack container.Summary, portSlice []*v1.Port, update updater.ImageUpdate, servicePath string) *v1.ContainerList {
	ipAddr := extractIPAddr(stack)

	var he string
	if stack.Health != nil && stack.Health.Status != container.NoHealthcheck {
		he = string(stack.Health.Status)
	}

	return &v1.ContainerList{
		Name:            strings.TrimPrefix(stack.Names[0], "/"),
		Id:              stack.ID,
		ImageID:         stack.ImageID,
		ImageName:       stack.Image,
		State:           string(stack.State),
		Health:          he,
		Created:         time.Unix(stack.Created, 0).UTC().Format(time.RFC3339),
		IPAddress:       ipAddr,
		UpdateAvailable: update.UpdateRef,
		Ports:           portSlice,
		ServiceName:     stack.Labels[api.ServiceLabel],
		StackName:       stack.Labels[api.ProjectLabel],
		ServicePath:     servicePath,
	}
}

func extractIPAddr(stack container.Summary) (hosts []string) {
	hosts = extractTraefikLabel(stack.Labels)
	if hosts != nil {
		return hosts
	}

	var ipAddr string
	for _, netConf := range stack.NetworkSettings.Networks {
		ipAddr = netConf.IPAddress.String()
		if ipAddr != "invalid IP" {
			hosts = append(hosts, ipAddr)
		}
	}

	return hosts
}

func extractTraefikLabel(labels map[string]string) (hosts []string) {
	val, ok := labels["traefik.enable"]
	if !(ok && val == "true") {
		return hosts
	}

	// looks for the Host() or HostRegexp() functions
	// It captures everything inside the parenthesis
	hostRegex := regexp.MustCompile(`Host(?:Regexp)?\((.*?)\)`)
	// This regex identifies the actual domain names inside the quotes/backticks
	domainRegex := regexp.MustCompile(`[` + "`" + `"]([^` + "`" + `",\s]+)[` + "`" + `"]`)
	for key, value := range labels {
		if strings.HasPrefix(key, "traefik.http.routers.") && strings.HasSuffix(key, ".rule") {
			// Find all Host(...) or HostRegexp(...) occurrences in the rule
			matches := hostRegex.FindAllStringSubmatch(value, -1)
			for _, match := range matches {
				if len(match) > 1 {
					// (Handles comma separated: Host(`a.com`, `b.com`))
					domains := domainRegex.FindAllStringSubmatch(match[1], -1)
					for _, d := range domains {
						if len(d) > 1 {
							hosts = append(hosts, d[1])
						}
					}
				}
			}
		}
	}

	return hosts
}
