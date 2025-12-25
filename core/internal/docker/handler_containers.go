package docker

import (
	"cmp"
	"context"
	"fmt"
	"io"
	"net/netip"
	"slices"
	"strings"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/docker/v1"
	contSrv "github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/updater"
	"github.com/RA341/dockman/pkg/fileutil"
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

	mounts := make([]*v1.ContainerMount, 0, len(inspect.Mounts))
	for _, mr := range inspect.Mounts {
		mounts = append(mounts, &v1.ContainerMount{
			Type:        string(mr.Type),
			Name:        mr.Name,
			Source:      mr.Source,
			Destination: mr.Destination,
			Driver:      mr.Driver,
			Mode:        mr.Mode,
			RW:          mr.RW,
		})
	}

	return connect.NewResponse(&v1.ContainerInspectMessage{
		Name:      inspect.Name,
		Created:   inspect.Created,
		ID:        inspect.ID,
		Path:      inspect.Path,
		Image:     inspect.Image,
		HostsPath: inspect.HostsPath,

		Mounts: mounts,
	}), nil
}

func (h *Handler) ContainerUpdate(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.Empty], error) {
	_, _, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	// todo
	//err = h.updater(host).ContainersUpdateByContainerID(ctx, req.Msg.ContainerIds...)
	//if err != nil {
	//	return nil, err
	//}
	return connect.NewResponse(&v1.Empty{}), nil
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
		))
	}
	return dockerResult, statusCount
}

func (h *Handler) ToProto(stack container.Summary, portSlice []*v1.Port, update updater.ImageUpdate) *v1.ContainerList {
	var ipAddr string
	for _, netConf := range stack.NetworkSettings.Networks {
		ipAddr = netConf.IPAddress.String()
	}

	return &v1.ContainerList{
		Name:            strings.TrimPrefix(stack.Names[0], "/"),
		Id:              stack.ID,
		ImageID:         stack.ImageID,
		ImageName:       stack.Image,
		Status:          stack.Status,
		IPAddress:       ipAddr,
		UpdateAvailable: update.UpdateRef,
		Ports:           portSlice,
		ServiceName:     stack.Labels[api.ServiceLabel],
		StackName:       stack.Labels[api.ProjectLabel],
		ServicePath:     h.getComposeFilePath(stack.Labels[api.ConfigFilesLabel]),
		Created:         time.Unix(stack.Created, 0).UTC().Format(time.RFC3339),
	}
}
