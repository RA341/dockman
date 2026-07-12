package docker

import (
	"bufio"
	"cmp"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"

	v1 "github.com/RA341/dockman/generated/docker/v1"
	dockerpc "github.com/RA341/dockman/generated/docker/v1/v1connect"
	contSrv "github.com/RA341/dockman/internal/docker/container"
	hm "github.com/RA341/dockman/internal/host/middleware"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/listutils"

	"connectrpc.com/connect"
	"github.com/docker/compose/v5/pkg/api"
	"github.com/moby/moby/api/types/container"
	"github.com/rs/zerolog/log"
)

// ServiceProvider use a closure instead of passing a concrete Service to change hosts on demand
type ServiceProvider func(host string) (*Service, error)

type Handler struct {
	srv ServiceProvider
}

func NewConnectHandler(srv ServiceProvider) (string, http.Handler) {
	h := &Handler{
		srv: srv,
	}
	return dockerpc.NewDockerServiceHandler(h)
}

type HostGetter interface {
	GetHost() string
}

func (h *Handler) getHost(ctx context.Context) (string, *Service, error) {
	hostname, err := hm.GetHost(ctx)
	if err != nil {
		return "", nil, err
	}

	dkSrv, err := h.srv(hostname)
	if err != nil {
		return "", nil, err
	}

	return hostname, dkSrv, nil
}

////////////////////////////////////////////
// 			Compose Actions 			  //
////////////////////////////////////////////

func (h *Handler) ComposeFileStatus(ctx context.Context, c *connect.Request[v1.ComposeFileStatusRequest]) (*connect.Response[v1.ComposeFileStatusResponse], error) {
	finalResults := make(map[string]*v1.Status, len(c.Msg.Files))

	err := h.WithClient(ctx, func(dkSrv *Service) error {
		// One container listing for the whole host, aggregated per compose file
		// via the compose config-files label. This replaces one `docker compose
		// ps` subprocess per stack, so reporting the status of every stack (even
		// collapsed ones) stays cheap no matter how many there are.
		containers, err := dkSrv.Container.ContainersList(ctx)
		if err != nil {
			return err
		}

		byFile := make(map[string]*stackStatus)
		for i := range containers {
			ct := containers[i]
			cfg := ct.Labels[api.ConfigFilesLabel]
			if cfg == "" {
				continue
			}
			// config_files may list several files (compose + overrides)
			for _, p := range strings.Split(cfg, ",") {
				if p = strings.TrimSpace(p); p == "" {
					continue
				}
				st := byFile[p]
				if st == nil {
					st = &stackStatus{}
					byFile[p] = st
				}
				st.add(ct)
			}
		}

		for _, file := range c.Msg.Files {
			absPath, resolveErr := dkSrv.Compose.ComposeAbsPath(file)
			if resolveErr != nil {
				log.Debug().Str("file", file).Err(resolveErr).Msg("could not resolve compose path for status")
				finalResults[file] = &v1.Status{}
				continue
			}
			if st, ok := byFile[absPath]; ok {
				finalResults[file] = st.toProto()
			} else {
				// no containers for this stack -> stopped
				finalResults[file] = &v1.Status{}
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.ComposeFileStatusResponse{
		Status: finalResults,
	}), nil
}

// stackStatus aggregates the container states of a single compose stack.
//
// It maps onto the v1.Status fields the UI already consumes. ServicesDown carries
// the "in error" count — a service that crashed, is dead, is stuck restarting, or
// exited non-zero — so the UI can distinguish a real problem (red) from a stack
// that is simply stopped (grey).
type stackStatus struct {
	up        int32
	failed    int32
	healthy   int32
	unhealthy int32
}

func (s *stackStatus) add(ct container.Summary) {
	switch string(ct.State) {
	case "running":
		s.up++
		switch ct.Health.Status {
		case container.Healthy:
			s.healthy++
		case container.Unhealthy:
			s.unhealthy++
		}
	case "restarting", "dead":
		s.failed++
	case "exited":
		if containerExitCode(ct) != 0 {
			s.failed++
		}
		// exited(0) / created / paused / removing -> cleanly stopped, not counted
	}
}

func (s *stackStatus) toProto() *v1.Status {
	return &v1.Status{
		ServicesUp:        s.up,
		ServicesDown:      s.failed,
		ServicesHealthy:   s.healthy,
		ServicesUnHealthy: s.unhealthy,
	}
}

// containerExitCode parses the exit code out of a container summary status line,
// e.g. "Exited (137) 2 hours ago" -> 137. Returns 0 when it can't be determined.
func containerExitCode(ct container.Summary) int {
	l := strings.IndexByte(ct.Status, '(')
	r := strings.IndexByte(ct.Status, ')')
	if l >= 0 && r > l {
		if code, err := strconv.Atoi(strings.TrimSpace(ct.Status[l+1 : r])); err == nil {
			return code
		}
	}
	return 0
}

func (h *Handler) ComposeUp(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.WithClientAndStream(ctx, responseStream, func(dkSrv *Service, writer io.Writer) error {
		return dkSrv.Compose.Up(
			ctx,
			req.Msg.Filename,
			writer,
			req.Msg.SelectedServices...,
		)
	})
}

func (h *Handler) ComposeStart(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.WithClientAndStream(ctx, responseStream, func(dkSrv *Service, writer io.Writer) error {
		return dkSrv.Compose.Start(
			ctx,
			req.Msg.Filename,
			writer,
			req.Msg.SelectedServices...,
		)
	})
}

func (h *Handler) ComposeStop(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.WithClientAndStream(ctx, responseStream, func(dkSrv *Service, writer io.Writer) error {
		return dkSrv.Compose.Stop(
			ctx,
			req.Msg.Filename,
			writer,
			req.Msg.SelectedServices...,
		)
	})
}

func (h *Handler) ComposeDown(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.WithClientAndStream(ctx, responseStream, func(dkSrv *Service, writer io.Writer) error {
		return dkSrv.Compose.Down(
			ctx,
			req.Msg.Filename,
			writer,
			req.Msg.SelectedServices...,
		)
	})
}

func (h *Handler) ComposeRestart(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.WithClientAndStream(ctx, responseStream, func(dkSrv *Service, writer io.Writer) error {
		return dkSrv.Compose.Restart(
			ctx,
			req.Msg.Filename,
			writer,
			req.Msg.SelectedServices...,
		)
	})

}

func (h *Handler) ComposeUpdate(ctx context.Context, req *connect.Request[v1.ComposeFile], responseStream *connect.ServerStream[v1.LogsMessage]) error {
	return h.WithClientAndStream(ctx, responseStream, func(dkSrv *Service, writer io.Writer) error {
		return dkSrv.Compose.Update(ctx, req.Msg.Filename, writer, req.Msg.SelectedServices...)
	})

	// todo
	//go sendReqToUpdater(h.addr, h.pass, "")
	//return nil
}

func (h *Handler) ComposeValidate(ctx context.Context, req *connect.Request[v1.ComposeFile]) (*connect.Response[v1.ComposeValidateResponse], error) {
	var validationResult []error

	err := h.WithClient(ctx, func(dkSrv *Service) error {
		errs := dkSrv.Compose.Validate(ctx, req.Msg.Filename)
		validationResult = errs
		return nil
	})
	if err != nil {
		return nil, err
	}

	if validationResult == nil {
		return connect.NewResponse(&v1.ComposeValidateResponse{
			Errs: []string{},
		}), nil
	}

	toMap := listutils.ToMap(validationResult, func(t error) string {
		return t.Error()
	})
	return connect.NewResponse(&v1.ComposeValidateResponse{
		Errs: toMap,
	}), nil
}

func (h *Handler) ComposeList(ctx context.Context, req *connect.Request[v1.ComposeFile]) (*connect.Response[v1.ListResponse], error) {
	var result []*v1.ContainerList
	err := h.WithClient(ctx, func(dkSrv *Service) error {
		res, err := dkSrv.Compose.List(
			ctx,
			req.Msg.Filename,
		)
		if err != nil {
			return err
		}

		result, _ = h.containersToRpc(res, dkSrv.Host, dkSrv)
		return nil
	})
	return connect.NewResponse(&v1.ListResponse{List: result}), err
}

func (h *Handler) WithClient(ctx context.Context, runner func(dkSrv *Service) error) error {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return err
	}

	return runner(dkSrv)
}

func (h *Handler) WithClientAndStream(
	ctx context.Context,
	responseStream *connect.ServerStream[v1.LogsMessage],
	run func(srv *Service, writer io.Writer) error,
) error {
	stream := LogStreamWriter{responseStream: responseStream}
	err := h.WithClient(ctx, func(dkSrv *Service) error {
		return run(dkSrv, &stream)
	})
	if err != nil {
		return err
	}
	return nil
}

////////////////////////////////////////////
// 				Utils 			  		  //
////////////////////////////////////////////

type LogStreamWriter struct {
	responseStream *connect.ServerStream[v1.LogsMessage]
}

func (l *LogStreamWriter) Write(p []byte) (n int, err error) {
	err = l.responseStream.Send(&v1.LogsMessage{
		Message: string(p),
	})
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

func (h *Handler) getComposeFilePath(fullPath string) string {
	// todo
	//composePath := filepath.ToSlash(
	//	strings.TrimPrefix(
	//		fullPath, h.compose().ComposeRoot,
	//	),
	//)
	return strings.TrimPrefix("", "/")
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
