package docker

import (
	"bufio"
	"cmp"
	"context"
	"fmt"
	"io"
	"maps"
	"net/http"
	"net/netip"
	"net/url"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/docker/v1"
	"github.com/RA341/dockman/internal/docker/compose"
	contSrv "github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/updater"
	"github.com/dustin/go-humanize"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/listutils"
	"github.com/compose-spec/compose-go/v2/types"
	"github.com/docker/compose/v5/pkg/api"
	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/image"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

// ServiceProvider use a closure instead of passing a concrete Service to change hosts on demand
type ServiceProvider func() *Service

type Handler struct {
	srv ServiceProvider
}

func NewConnectHandler(srv ServiceProvider, host string) *Handler {
	return &Handler{
		srv: srv,
	}
}

func (h *Handler) compose() *compose.Service {
	return h.srv().Compose
}

func (h *Handler) container() *contSrv.Service {
	return h.srv().Container
}

func (h *Handler) updater() *updater.Service {
	return h.srv().Updater
}

////////////////////////////////////////////
// 			Compose Actions 			  //
////////////////////////////////////////////

func (h *Handler) ComposeUp(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.compose().ComposeUp,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) ComposeStart(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.compose().ComposeStart,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) ComposeStop(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.compose().ComposeStop,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) ComposeDown(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.compose().ComposeDown,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) ComposeRestart(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.compose().ComposeRestart,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) ComposeUpdate(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	err := h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.compose().ComposeUpdate,
		req.Msg.GetSelectedServices()...,
	)
	if err != nil {
		return err
	}

	//go sendReqToUpdater(h.addr, h.pass, "")

	return nil
}

func (h *Handler) ComposeValidate(ctx context.Context, req *connect.Request[v1.ComposeFile]) (*connect.Response[v1.ComposeValidateResponse], error) {
	errs := h.compose().ComposeValidate(ctx, req.Msg.Filename)
	toMap := listutils.ToMap(errs, func(t error) string {
		return t.Error()
	})
	return connect.NewResponse(&v1.ComposeValidateResponse{
		Errs: toMap,
	}), nil
}

func (h *Handler) ComposeList(ctx context.Context, req *connect.Request[v1.ComposeFile]) (*connect.Response[v1.ListResponse], error) {
	project, err := h.compose().LoadProject(ctx, req.Msg.GetFilename())
	if err != nil {
		return nil, err
	}

	result, err := h.compose().ComposeList(ctx, project, true)
	if err != nil {
		return nil, err
	}

	rpcResult := h.containersToRpc(result)
	return connect.NewResponse(&v1.ListResponse{List: rpcResult}), err
}

func (h *Handler) containersToRpc(result []container.Summary) []*v1.ContainerList {
	var dockerResult []*v1.ContainerList
	for _, stack := range result {
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
				addr, err := netip.ParseAddr(h.srv().DaemonAddr)
				if err == nil {
					p.IP = addr
				}

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

		dockerResult = append(dockerResult, h.toRPContainer(
			stack,
			portSlice,
			updater.ImageUpdate{},
		))
	}
	return dockerResult
}

////////////////////////////////////////////
// 			Container Actions 			  //
////////////////////////////////////////////

func (h *Handler) ContainerStart(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	err := h.container().ContainersStart(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerStop(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	err := h.container().ContainersStop(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerRemove(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	err := h.container().ContainersRemove(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerRestart(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.LogsMessage], error) {
	err := h.container().ContainersRestart(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.LogsMessage{}), nil
}

func (h *Handler) ContainerUpdate(ctx context.Context, req *connect.Request[v1.ContainerRequest]) (*connect.Response[v1.Empty], error) {
	err := h.updater().ContainersUpdateByContainerID(ctx, req.Msg.ContainerIds...)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1.Empty{}), nil
}

func (h *Handler) ContainerList(ctx context.Context, _ *connect.Request[v1.Empty]) (*connect.Response[v1.ListResponse], error) {
	result, err := h.container().ContainersList(ctx)
	if err != nil {
		return nil, err
	}

	rpcResult := h.containersToRpc(result)
	return connect.NewResponse(&v1.ListResponse{List: rpcResult}), err
}

func (h *Handler) ContainerStats(ctx context.Context, req *connect.Request[v1.StatsRequest]) (*connect.Response[v1.StatsResponse], error) {
	file := req.Msg.GetFile()

	var containers []contSrv.Stats
	var err error
	if file != nil {
		// file was passed load it from context
		project, err := h.compose().LoadProject(ctx, file.Filename)
		if err != nil {
			return nil, err
		}
		containers, err = h.compose().ComposeStats(ctx, project)
	} else {
		containers, err = h.container().ContainerStats(ctx, client.ContainerListOptions{})
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

	logsReader, tty, err := h.container().ContainerLogs(ctx, req.Msg.GetContainerID())
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

////////////////////////////////////////////
// 				Image Actions 			  //
////////////////////////////////////////////

func (h *Handler) ImageList(ctx context.Context, _ *connect.Request[v1.ListImagesRequest]) (*connect.Response[v1.ListImagesResponse], error) {
	images, err := h.container().ImageList(ctx)

	imageUpdates, err := h.updater().Store.GetUpdateAvailable(
		"",
		listutils.ToMap(images, func(t image.Summary) string {
			return t.ID
		})...,
	)
	if err != nil {
		return nil, err
	}

	var unusedContainers int64
	var totalDisk int64
	var untagged int64
	var rpcImages []*v1.Image

	for _, img := range images {
		totalDisk += img.Size

		if len(img.RepoTags) == 0 {
			untagged++
		}

		if img.Containers == 0 {
			unusedContainers++
		}

		rpcImages = append(rpcImages, &v1.Image{
			Containers:  img.Containers,
			Created:     img.Created,
			Id:          img.ID,
			Labels:      img.Labels,
			ParentId:    img.ParentID,
			RepoDigests: img.RepoDigests,
			RepoTags:    img.RepoTags,
			SharedSize:  img.SharedSize,
			Size:        img.Size,
			UpdateRef:   imageUpdates[img.ID].UpdateRef,
			Manifests:   []*v1.ManifestSummary{}, // todo
		})
	}

	return connect.NewResponse(&v1.ListImagesResponse{
		TotalDiskUsage:   totalDisk,
		Images:           rpcImages,
		UnusedImageCount: unusedContainers,
	}), err
}

func (h *Handler) ImageRemove(ctx context.Context, req *connect.Request[v1.RemoveImageRequest]) (*connect.Response[v1.RemoveImageResponse], error) {
	for _, img := range req.Msg.ImageIds {
		_, err := h.container().ImageDelete(ctx, img)
		if err != nil {
			return nil, fmt.Errorf("unable to remove image %s: %w", img, err)
		}
	}

	return connect.NewResponse(&v1.RemoveImageResponse{}), nil
}

func (h *Handler) ImagePruneUnused(ctx context.Context, req *connect.Request[v1.ImagePruneRequest]) (*connect.Response[v1.ImagePruneResponse], error) {
	var result image.PruneReport
	var err error
	if req.Msg.GetPruneAll() {
		result, err = h.container().ImagePruneUnused(ctx)
	} else {
		result, err = h.container().ImagePruneUntagged(ctx)
	}
	if err != nil {
		return nil, err
	}

	response := v1.ImagePruneResponse{
		SpaceReclaimed: result.SpaceReclaimed,
	}

	var deleted []*v1.ImagesDeleted
	for _, res := range result.ImagesDeleted {
		deleted = append(deleted, &v1.ImagesDeleted{
			Deleted:  res.Deleted,
			Untagged: res.Untagged,
		})
	}
	response.Deleted = deleted

	return connect.NewResponse(&response), nil
}

func (h *Handler) ImageInspect(ctx context.Context, c *connect.Request[v1.ImageInspectRequest]) (*connect.Response[v1.ImageInspectResponse], error) {
	inspect, history, err := h.srv().Container.ImageInspect(
		ctx,
		c.Msg.ImageId,
	)
	if err != nil {
		return nil, err
	}

	var layers = make([]*v1.ImageLayer, 0, len(history.Items))
	for _, sd := range history.Items {
		layers = append(layers, &v1.ImageLayer{
			Cmd:  sd.CreatedBy,
			Size: humanize.Bytes(uint64(sd.Size)),
		})
	}

	var name string
	for _, sd := range inspect.RepoDigests {
		name = sd
	}

	var insp = &v1.ImageInspect{
		Name:       name,
		Id:         inspect.ID,
		Arch:       inspect.Architecture,
		Size:       humanize.Bytes(uint64(inspect.Size)),
		CreatedIso: inspect.Created,
		Layers:     layers,
	}

	return connect.NewResponse(&v1.ImageInspectResponse{
		Inspect: insp,
	}), nil
}

////////////////////////////////////////////
// 				Volume Actions 			  //
////////////////////////////////////////////

func (h *Handler) VolumeList(ctx context.Context, _ *connect.Request[v1.ListVolumesRequest]) (*connect.Response[v1.ListVolumesResponse], error) {
	volumes, err := h.container().VolumesList(ctx)
	if err != nil {
		return nil, err
	}

	var rpcVolumes []*v1.Volume
	for _, vol := range volumes {
		rpcVolumes = append(rpcVolumes, &v1.Volume{
			Name:               vol.Name,
			ContainerID:        vol.ContainerID,
			Size:               safeGetSize(vol),
			CreatedAt:          vol.CreatedAt,
			Labels:             getVolumeProjectNameFromLabel(vol.Labels),
			MountPoint:         vol.Mountpoint,
			ComposePath:        h.getComposeFilePath(vol.ComposePath),
			ComposeProjectName: vol.ComposeProjectName,
		})
	}

	return connect.NewResponse(&v1.ListVolumesResponse{Volumes: rpcVolumes}), nil
}

func safeGetSize(vol contSrv.VolumeInfo) int64 {
	if vol.UsageData == nil {
		return 0
	}
	return vol.UsageData.Size
}

func getVolumeProjectNameFromLabel(labels map[string]string) string {
	if labels == nil {
		return ""
	}
	const LabelVolumeAnonymous = "com.docker.volume.anonymous"
	if _, ok := labels[LabelVolumeAnonymous]; ok {
		return "anonymous"
	}

	if val, ok := labels[api.ProjectLabel]; ok {
		return val
	}

	return ""
}

func (h *Handler) VolumeCreate(_ context.Context, _ *connect.Request[v1.CreateVolumeRequest]) (*connect.Response[v1.CreateVolumeResponse], error) {
	//TODO implement me
	return nil, fmt.Errorf(" implement me VolumeCreate")
}

func (h *Handler) VolumeDelete(ctx context.Context, req *connect.Request[v1.DeleteVolumeRequest]) (*connect.Response[v1.DeleteVolumeResponse], error) {
	var err error
	if req.Msg.Anon {
		err = h.container().VolumesPrune(ctx)
	} else if req.Msg.Unused {
		err = h.container().VolumesPruneUnunsed(ctx)
	} else {
		for _, vols := range req.Msg.VolumeIds {
			err = h.container().VolumesDelete(ctx, vols, false)
		}
	}

	return connect.NewResponse(&v1.DeleteVolumeResponse{}), err
}

////////////////////////////////////////////
// 				Network Actions 		  //
////////////////////////////////////////////

func (h *Handler) NetworkList(ctx context.Context, _ *connect.Request[v1.ListNetworksRequest]) (*connect.Response[v1.ListNetworksResponse], error) {
	networks, err := h.container().NetworksList(ctx)
	if err != nil {
		return nil, err
	}

	var rpcNetworks []*v1.Network
	for _, netI := range networks {
		rpcNetworks = append(rpcNetworks, ToRpcNetwork(netI))
	}

	return connect.NewResponse(&v1.ListNetworksResponse{Networks: rpcNetworks}), nil
}

func ToRpcNetwork(netI network.Inspect) *v1.Network {
	return &v1.Network{
		Id:             netI.ID,
		Name:           netI.Name,
		CreatedAt:      netI.Created.Format(time.RFC3339),
		Subnet:         getSubnet(netI),
		Scope:          netI.Scope,
		Driver:         netI.Driver,
		EnableIpv4:     netI.EnableIPv4,
		EnableIpv6:     netI.EnableIPv6,
		Internal:       netI.Internal,
		Attachable:     netI.Attachable,
		ComposeProject: netI.Labels[api.ProjectLabel],
		ContainerIds:   slices.Collect(maps.Keys(netI.Containers)),
	}
}

func (h *Handler) NetworkInspect(ctx context.Context, c *connect.Request[v1.NetworkInspectRequest]) (*connect.Response[v1.NetworkInspectResponse], error) {
	inspect, err := h.srv().Container.NetworksInspect(ctx, c.Msg.NetworkId)
	if err != nil {
		return nil, err
	}

	rpcNetworks := make([]*v1.NetworkContainerInspect, 0, len(inspect.Containers))
	for _, d := range inspect.Containers {
		rpcNetworks = append(rpcNetworks, &v1.NetworkContainerInspect{
			Name:     d.Name,
			Endpoint: d.EndpointID,
			IPv4:     d.IPv4Address.String(),
			IPv6:     d.IPv6Address.String(),
			Mac:      d.MacAddress.String(),
		})
	}

	info := v1.NetworkInspectInfo{
		Net:       ToRpcNetwork(inspect),
		Container: rpcNetworks,
	}

	return connect.NewResponse(&v1.NetworkInspectResponse{
		Inspect: &info,
	}), nil
}

func getSubnet(netI network.Inspect) string {
	if len(netI.IPAM.Config) == 0 {
		return "-----"
	}
	return netI.IPAM.Config[0].Subnet.String()
}

func (h *Handler) NetworkCreate(_ context.Context, _ *connect.Request[v1.CreateNetworkRequest]) (*connect.Response[v1.CreateNetworkResponse], error) {
	//TODO implement me
	return nil, fmt.Errorf(" implement me NetworkCreate")
}

func (h *Handler) NetworkDelete(ctx context.Context, req *connect.Request[v1.DeleteNetworkRequest]) (*connect.Response[v1.DeleteNetworkResponse], error) {
	var err error
	if req.Msg.Prune {
		err = h.container().NetworksPrune(ctx)
	} else {
		for _, nid := range req.Msg.NetworkIds {
			err = h.container().NetworksDelete(ctx, nid)
		}
	}
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.DeleteNetworkResponse{}), nil
}

////////////////////////////////////////////
// 				Utils 			  		  //
////////////////////////////////////////////

// executeComposeStreamCommand handles the boilerplate for running a Docker Compose command that streams logs.
func (h *Handler) executeComposeStreamCommand(
	ctx context.Context,
	composeFile string,
	responseStream *connect.ServerStream[v1.LogsMessage],
	action func(context.Context, *types.Project, api.Compose, ...string) error,
	services ...string,
) error {
	project, err := h.compose().LoadProject(ctx, composeFile)
	if err != nil {
		return err
	}

	// todo dockman updater
	//services = h.srv().withoutDockman(project, services...)
	//log.Debug().Strs("ssdd", services).Msg("compose stream")

	pipeWriter, wg := streamManager(func(val string) error {
		return responseStream.Send(
			&v1.LogsMessage{Message: val},
		)
	})
	defer fileutil.Close(pipeWriter)

	composeClient, err := h.compose().LoadComposeClient(pipeWriter)
	if err != nil {
		return err
	}

	// incase the stream connection is lost context.Background
	// will allow the service to continue executing, instead of stopping mid-operation
	err = action(context.Background(), project, composeClient, services...)
	if err != nil {
		fileutil.Close(pipeWriter)
		return err
	}

	fileutil.Close(pipeWriter)
	wg.Wait()

	return nil
}

type LogStreamWriter struct {
	responseStream *connect.ServerStream[v1.LogsMessage]
}

func (l *LogStreamWriter) Write(p []byte) (n int, err error) {
	err = l.responseStream.Send(&v1.LogsMessage{})
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func ToRPCStat(cont contSrv.Stats) *v1.ContainerStats {
	return &v1.ContainerStats{
		Id:          cont.ID,
		Name:        strings.TrimPrefix(cont.Name, "/"),
		CpuUsage:    cont.CPUUsage,
		MemoryUsage: cont.MemoryUsage,
		MemoryLimit: cont.MemoryLimit,
		NetworkRx:   cont.NetworkRx,
		NetworkTx:   cont.NetworkTx,
		BlockRead:   cont.BlockRead,
		BlockWrite:  cont.BlockWrite,
	}
}

func getSortFn(field v1.SORT_FIELD) func(a, b contSrv.Stats) int {
	switch field {
	case v1.SORT_FIELD_CPU:
		return func(a, b contSrv.Stats) int {
			return cmp.Compare(b.CPUUsage, a.CPUUsage)
		}
	case v1.SORT_FIELD_MEM:
		return func(a, b contSrv.Stats) int {
			return cmp.Compare(b.MemoryUsage, a.MemoryUsage)
		}
	case v1.SORT_FIELD_NETWORK_RX:
		return func(a, b contSrv.Stats) int {
			return cmp.Compare(b.NetworkRx, a.NetworkRx)
		}
	case v1.SORT_FIELD_NETWORK_TX:
		return func(a, b contSrv.Stats) int {
			return cmp.Compare(b.NetworkTx, a.NetworkTx)
		}
	case v1.SORT_FIELD_DISK_W:
		return func(a, b contSrv.Stats) int {
			return cmp.Compare(b.BlockWrite, a.BlockWrite)
		}
	case v1.SORT_FIELD_DISK_R:
		return func(a, b contSrv.Stats) int {
			return cmp.Compare(b.BlockRead, a.BlockRead)
		}
	case v1.SORT_FIELD_NAME:
		fallthrough
	default:
		return func(a, b contSrv.Stats) int {
			return cmp.Compare(b.Name, a.Name)
		}
	}
}

func sendReqToUpdater(addr, key, path string) {
	log.Debug().Str("addr", addr).Msg("sending request to updating dockman")
	if key != "" && addr != "" {
		addr = strings.TrimSuffix(addr, "/")
		addr = fmt.Sprintf("%s/update", addr) // Remove key from URL path

		formData := url.Values{}
		formData.Set("composeFile", path)

		req, err := http.NewRequest("POST", addr, strings.NewReader(formData.Encode()))
		if err != nil {
			log.Warn().Err(err).Str("addr", addr).Msg("unable to create request")
			return
		}

		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Authorization", key) // Add key as header

		httpclient := &http.Client{}
		if _, err = httpclient.Do(req); err != nil {
			log.Warn().Err(err).Str("addr", addr).Msg("unable to send request to updater")
			return
		}
	}
}

func streamManager(streamFn func(val string) error) (*io.PipeWriter, *sync.WaitGroup) {
	pipeReader, pipeWriter := io.Pipe()
	wg := sync.WaitGroup{}
	// Start a goroutine that reads from the pipe, splits the data into lines,
	// and sends each line as a message on the response stream.
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer fileutil.Close(pipeReader)

		scanner := bufio.NewScanner(pipeReader)
		for scanner.Scan() {
			err := streamFn(fmt.Sprintf("%s\r\n", scanner.Text()))
			if err != nil {
				log.Warn().Err(err).Msg("Failed to send message to stream")
			}
		}
		// If the scanner stops because of an error, log it.
		if err := scanner.Err(); err != nil {
			log.Error().Err(err).Msg("Error reading from pipe for streaming")
		}
	}()

	return pipeWriter, &wg
}

func toRPCPort(p container.PortSummary) *v1.Port {
	return &v1.Port{
		Public:  int32(p.PublicPort),
		Private: int32(p.PrivatePort),
		Host:    p.IP.String(),
		Type:    p.Type,
	}
}

func (h *Handler) toRPContainer(stack container.Summary, portSlice []*v1.Port, update updater.ImageUpdate) *v1.ContainerList {
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

func (h *Handler) getComposeFilePath(fullPath string) string {
	composePath := filepath.ToSlash(
		strings.TrimPrefix(
			fullPath, h.compose().ComposeRoot,
		),
	)
	return strings.TrimPrefix(composePath, "/")
}

type ContainerLogWriter struct {
	responseStream *connect.ServerStream[v1.LogsMessage]
}

func (l *ContainerLogWriter) Write(p []byte) (n int, err error) {
	msg := &v1.LogsMessage{Message: string(p)}
	if err = l.responseStream.Send(msg); err != nil {
		return 0, err
	}
	return len(p), nil
}
