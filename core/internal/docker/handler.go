package docker

import (
	"bufio"
	"cmp"
	"connectrpc.com/connect"
	"context"
	"fmt"
	v1 "github.com/RA341/dockman/generated/docker/v1"
	"github.com/RA341/dockman/pkg"
	"github.com/compose-spec/compose-go/v2/types"
	"github.com/docker/compose/v2/pkg/api"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/pkg/stdcopy"
	"github.com/rs/zerolog/log"
	"io"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"
)

type GetService func() *Service

type Handler struct {
	srv  GetService
	addr string
	pass string
}

func NewConnectHandler(srv GetService, host, pass string) *Handler {
	return &Handler{
		srv:  srv,
		addr: host,
		pass: pass,
	}
}

func (h *Handler) Start(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.srv().Up,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) Stop(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.srv().Stop,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) Remove(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.srv().Down,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) Restart(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.srv().Restart,
		req.Msg.GetSelectedServices()...,
	)
}

func (h *Handler) Update(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	err := h.executeComposeStreamCommand(
		ctx,
		req.Msg.GetFilename(),
		responseStream,
		h.srv().Update,
		req.Msg.GetSelectedServices()...,
	)
	if err != nil {
		return err
	}

	go sendReqToUpdater(h.addr, h.pass, "")

	return nil
}

func (h *Handler) Logs(ctx context.Context, req *connect.Request[v1.ContainerLogsRequest], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	if req.Msg.GetContainerID() == "" {
		return fmt.Errorf("container id is required")
	}

	logsReader, err := h.srv().ContainerLogs(ctx, req.Msg.GetContainerID())
	if err != nil {
		return err
	}
	defer pkg.CloseCloser(logsReader)

	writer := &ContainerLogWriter{responseStream: responseStream}
	if _, err = stdcopy.StdCopy(writer, writer, logsReader); err != nil {
		return err
	}

	return nil
}

func (h *Handler) List(ctx context.Context, req *connect.Request[v1.ComposeFile]) (*connect.Response[v1.ListResponse], error) {
	project, err := h.srv().LoadProject(ctx, req.Msg.GetFilename())
	if err != nil {
		return nil, err
	}

	result, err := h.srv().ListStack(ctx, project, true)
	if err != nil {
		return nil, err
	}

	var dockerResult []*v1.ContainerList
	for _, stack := range result {
		var portSlice []*v1.Port
		for _, p := range stack.Ports {
			if isIPV4(p.IP) {
				p.IP = h.srv().localAddr
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

		dockerResult = append(dockerResult, toRPContainer(stack, portSlice))
	}

	return connect.NewResponse(&v1.ListResponse{List: dockerResult}), err
}

func (h *Handler) Stats(ctx context.Context, req *connect.Request[v1.StatsRequest]) (*connect.Response[v1.StatsResponse], error) {
	file := req.Msg.GetFile()

	var containers []ContainerStats
	var err error
	if file != nil {
		// file was passed load it from context
		project, err := h.srv().LoadProject(ctx, file.Filename)
		if err != nil {
			return nil, err
		}
		containers, err = h.srv().StatStack(ctx, project)
	} else {
		containers, err = h.srv().GetStats(ctx, container.ListOptions{})
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
	slices.SortFunc(containers, func(a, b ContainerStats) int {
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

// executeComposeStreamCommand handles the boilerplate for running a Docker Compose command that streams logs.
func (h *Handler) executeComposeStreamCommand(
	ctx context.Context,
	composeFile string,
	responseStream *connect.ServerStream[v1.LogsMessage],
	action func(context.Context, *types.Project, api.Service, ...string) error,
	services ...string,
) error {
	project, err := h.srv().LoadProject(ctx, composeFile)
	if err != nil {
		return err
	}

	services, _ = h.srv().withoutDockman(project, services...)
	log.Debug().Strs("ssdd", services).Msg("compose stream")

	pipeWriter, wg := streamManager(func(val string) error {
		if err = responseStream.Send(&v1.LogsMessage{Message: val}); err != nil {
			return err
		}
		return nil
	})

	composeClient, err := h.srv().LoadComposeClient(pipeWriter, nil)
	if err != nil {
		return err
	}

	// incase the stream connection is lost context.Background
	// will allow the service to continue executing, instead of stopping mid-operation
	if err = action(context.Background(), project, composeClient, services...); err != nil {
		pkg.CloseCloser(pipeWriter)
		return err
	}

	pkg.CloseCloser(pipeWriter)
	wg.Wait()

	return nil
}

func ToRPCStat(cont ContainerStats) *v1.ContainerStats {
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

func isIPV4(ip string) bool {
	parsedIP := net.ParseIP(ip)
	return parsedIP != nil && parsedIP.To4() != nil
}

func getSortFn(field v1.SORT_FIELD) func(a, b ContainerStats) int {
	switch field {
	case v1.SORT_FIELD_CPU:
		return func(a, b ContainerStats) int {
			return cmp.Compare(b.CPUUsage, a.CPUUsage)
		}
	case v1.SORT_FIELD_MEM:
		return func(a, b ContainerStats) int {
			return cmp.Compare(b.MemoryUsage, a.MemoryUsage)
		}
	case v1.SORT_FIELD_NETWORK_RX:
		return func(a, b ContainerStats) int {
			return cmp.Compare(b.NetworkRx, a.NetworkRx)
		}
	case v1.SORT_FIELD_NETWORK_TX:
		return func(a, b ContainerStats) int {
			return cmp.Compare(b.NetworkTx, a.NetworkTx)
		}
	case v1.SORT_FIELD_DISK_W:
		return func(a, b ContainerStats) int {
			return cmp.Compare(b.BlockWrite, a.BlockWrite)
		}
	case v1.SORT_FIELD_DISK_R:
		return func(a, b ContainerStats) int {
			return cmp.Compare(b.BlockRead, a.BlockRead)
		}
	case v1.SORT_FIELD_NAME:
		fallthrough
	default:
		return func(a, b ContainerStats) int {
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
		defer pkg.CloseCloser(pipeReader)

		scanner := bufio.NewScanner(pipeReader)
		for scanner.Scan() {
			err := streamFn(fmt.Sprintf("%s\n", scanner.Text()))
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

func toRPCPort(p container.Port) *v1.Port {
	return &v1.Port{
		Public:  int32(p.PublicPort),
		Private: int32(p.PrivatePort),
		Host:    p.IP,
		Type:    p.Type,
	}
}

func toRPContainer(stack container.Summary, portSlice []*v1.Port) *v1.ContainerList {
	return &v1.ContainerList{
		Name:        strings.TrimPrefix(stack.Names[0], "/"),
		Id:          stack.ID,
		ImageID:     stack.ImageID,
		ImageName:   stack.Image,
		Status:      stack.Status,
		Ports:       portSlice,
		ServiceName: stack.Labels[api.ServiceLabel],
		Created:     time.Unix(stack.Created, 0).UTC().Format(time.RFC3339),
	}
}

type ContainerLogWriter struct {
	responseStream *connect.ServerStream[v1.LogsMessage]
}

func (l *ContainerLogWriter) Write(p []byte) (n int, err error) {
	if err := l.responseStream.Send(&v1.LogsMessage{Message: string(p)}); err != nil {
		return 0, err
	}
	return len(p), nil
}
