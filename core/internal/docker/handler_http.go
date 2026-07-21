package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	contSrv "github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/debug"
	hostMid "github.com/RA341/dockman/internal/host/middleware"
	fu "github.com/RA341/dockman/pkg/fileutil"
	wsu "github.com/RA341/dockman/pkg/ws"
	"github.com/gorilla/websocket"
	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type HandlerHttp struct {
	srv           ServiceProvider
	allowSelfExec bool
}

func NewHandlerHttp(srv ServiceProvider, allowSelfExec bool) http.Handler {
	hand := &HandlerHttp{srv: srv, allowSelfExec: allowSelfExec}
	return hand.register()
}

func (h *HandlerHttp) register() http.Handler {
	subMux := http.NewServeMux()
	subMux.HandleFunc("GET /exec/{contId}/options", h.containerExecOptions)
	subMux.HandleFunc("GET /exec/{contId}", h.containerExec)
	subMux.HandleFunc("GET /logs/{contId}", h.containerLogs)
	subMux.HandleFunc("GET /shell", h.hostShell)
	subMux.HandleFunc("POST /update/dockman", h.updateDockman)
	subMux.HandleFunc("POST /restart/dockman", h.restartDockman)

	return subMux
}

var execShellCandidates = []string{
	"/bin/sh", "/bin/bash", "/bin/ash", "/bin/zsh", "/bin/fish",
	"/usr/bin/bash", "/usr/bin/zsh", "/usr/bin/fish", "/usr/local/bin/bash",
}

func (h *HandlerHttp) containerExecOptions(w http.ResponseWriter, r *http.Request) {
	dkSrv, contID, err := getContainerIdAndService(r, h)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err = h.checkExecAllowed(r.Context(), dkSrv, contID); err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}

	available := make([]bool, len(execShellCandidates))
	var wg sync.WaitGroup
	for index, shell := range execShellCandidates {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, statErr := dkSrv.Container.Cli().ContainerStatPath(r.Context(), contID, client.ContainerStatPathOptions{Path: shell})
			available[index] = statErr == nil
		}()
	}
	wg.Wait()
	shells := make([]string, 0, len(execShellCandidates))
	for index, shell := range execShellCandidates {
		if available[index] {
			shells = append(shells, shell)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(struct {
		Shells []string `json:"shells"`
	}{Shells: shells}); err != nil {
		log.Debug().Err(err).Msg("could not encode container exec options")
	}
}

// restartDockman asks the local daemon to restart this container. The daemon
// performs the full stop/start operation, so it keeps going after Dockman's
// process exits. A short delay lets the accepted response reach the browser
// before the connection is interrupted.
func (h *HandlerHttp) restartDockman(w http.ResponseWriter, r *http.Request) {
	host, err := hostMid.GetHost(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if host != contSrv.LocalClient {
		http.Error(w, "restart is only supported on the local host", http.StatusBadRequest)
		return
	}

	dkSrv, err := h.srv(host)
	if err != nil {
		http.Error(w, fmt.Sprintf("error getting docker service: %v", err), http.StatusBadRequest)
		return
	}
	cli := dkSrv.Container.Cli()
	self, err := findSelfContainer(r.Context(), cli)
	if err != nil {
		log.Error().Err(err).Msg("dockman self-restart failed to locate its container")
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write([]byte("Dockman restart scheduled."))

	go func(containerID string) {
		time.Sleep(time.Second)
		if _, restartErr := cli.ContainerRestart(context.Background(), containerID, client.ContainerRestartOptions{}); restartErr != nil {
			log.Error().Err(restartErr).Str("container", containerID).Msg("dockman self-restart failed")
		}
	}(self.ID)
}

// updateDockman triggers a manual self-update of the Dockman container on the
// local host. It launches a detached helper that recreates Dockman with the
// latest image; see SelfUpdate.
func (h *HandlerHttp) updateDockman(w http.ResponseWriter, r *http.Request) {
	host, err := hostMid.GetHost(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if host != contSrv.LocalClient {
		http.Error(w, "self-update is only supported on the local host", http.StatusBadRequest)
		return
	}

	dkSrv, err := h.srv(host)
	if err != nil {
		http.Error(w, fmt.Sprintf("error getting docker service: %v", err), http.StatusBadRequest)
		return
	}

	// Detached context: the update must finish even if the client disconnects
	// (Dockman is about to restart anyway).
	if err = SelfUpdate(context.Background(), dkSrv); err != nil {
		log.Error().Err(err).Msg("dockman self-update failed")
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write([]byte("Dockman update started; it will restart shortly."))
}

func (h *HandlerHttp) containerExec(w http.ResponseWriter, r *http.Request) {
	dkSrv, contId, err := getContainerIdAndService(r, h)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err = h.checkExecAllowed(r.Context(), dkSrv, contId); err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}

	log.Debug().Str("id", contId).Msg("getting container logs")

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)
	wsu.LimitClientMessages(ws)

	query := r.URL.Query()
	execCmd := getExecCmd(query, ws)
	execUser := strings.TrimSpace(query.Get("user"))

	ctx := r.Context()
	var resp client.HijackedResponse

	debuggerImage := getDebuggerInfo(query, ws)
	if debuggerImage != "" {
		wsWriter := wsu.NewWsWriter(ws)
		var cleanup debug.CleanupFn
		wsu.WInf(ws, "setting up debug container standby...")

		resp, cleanup, err = dkSrv.Debugger.ContainerExecDebug(
			ctx,
			contId, execCmd, debuggerImage,
			wsWriter,
		)
		if err != nil {
			wsu.WErr(ws, fmt.Errorf("error executing debug container: %w", err))
			return
		}
		defer cleanup()
	} else {
		resp, err = dkSrv.Container.ContainerExec(ctx, contId, execCmd, execUser)
		if err != nil {
			wsu.WErr(ws, err)
			return
		}
		log.Debug().Msg("Attached to exec process")
	}
	defer func(resp *client.HijackedResponse) {
		// CloseWrite sends EOF to the process stdin so a well-behaved program
		// exits on its own. Close then tears down the hijacked connection so the
		// reader goroutine below always unblocks: a process that ignores stdin
		// EOF would otherwise leave resp.Reader.Read blocked forever, leaking the
		// goroutine and the hijacked connection.
		log.Debug().Err(err).Msg("closing con")
		if cerr := resp.CloseWrite(); cerr != nil {
			log.Warn().Err(cerr).Msg("error occurred while closing connection")
		}
		resp.Close()
	}(&resp)

	wsu.WInf(ws, "Connected to Container")
	if debuggerImage != "" {
		wsu.WInf(ws, fmt.Sprintf("Debug Image: %s", debuggerImage))
	}
	wsu.WInf(ws, fmt.Sprintf("Entrypoint: %s", execCmd))
	if execUser != "" {
		wsu.WInf(ws, fmt.Sprintf("User: %s", execUser))
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	go func() {
		// read from container and send to ws
		buf := make([]byte, 1024)
		for {
			n, err := resp.Reader.Read(buf)
			if err != nil {
				wsu.WErr(ws, fmt.Errorf("error reading from container: %w", err))
				break
			}
			wsu.WsMustWrite(ws, string(buf[:n]))
		}
		cancel()
	}()

	const EOT = "\u0004"
	for {
		if ctx.Err() != nil {
			wsu.WErr(ws, fmt.Errorf("container stream was closed, exiting"))
			break
		}

		// read from ws to container
		_, msg, err := ws.ReadMessage()
		if err != nil {
			log.Debug().Str("cont", contId).Err(err).Msg("Unable to read from socket " + err.Error())
			_, _ = resp.Conn.Write([]byte(EOT)) // sned exit signal
			break
		}

		_, err = resp.Conn.Write(msg)
		if err != nil {
			log.Warn().Err(err).Msg("Unable to write to container " + err.Error())
			break
		}
	}

	log.Debug().Str("container", contId).Msg("exec done")
}

// checkExecAllowed enforces the policy before both shell discovery and the
// WebSocket upgrade. Keeping the authoritative check here means hiding or
// re-enabling a UI control can never bypass the server-side boundary.
func (h *HandlerHttp) checkExecAllowed(ctx context.Context, dkSrv *Service, containerID string) error {
	if h.allowSelfExec {
		return nil
	}

	inspect, err := dkSrv.Container.Cli().ContainerInspect(ctx, containerID, client.ContainerInspectOptions{})
	if err != nil {
		return fmt.Errorf("unable to verify exec target: %w", err)
	}
	if inspect.Container.Config != nil && inspect.Container.Config.Labels[dockmanContainerLabel] == "true" {
		return fmt.Errorf("exec into Dockman is disabled by policy; set DOCKMAN_ALLOW_SELF_EXEC=true and recreate Dockman to enable it temporarily")
	}
	return nil
}

func (h *HandlerHttp) containerLogs(w http.ResponseWriter, r *http.Request) {
	dkSrv, contId, err := getContainerIdAndService(r, h)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Debug().Str("id", contId).Msg("getting container logs")

	ctx := r.Context()

	logsReader, tty, err := dkSrv.Container.ContainerLogs(ctx, contId)
	if err != nil {
		http.Error(w, "unable to stream container logs: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(logsReader)

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)
	wsu.LimitClientMessages(ws)

	writer := wsu.NewWsWriter(ws)
	go func() {
		var copyErr error
		if tty {
			// tty streams dont need docker demultiplexing
			_, copyErr = io.Copy(writer, logsReader)
		} else {
			// docker multiplexed stream
			_, copyErr = stdcopy.StdCopy(writer, writer, logsReader)
		}
		log.Debug().Err(copyErr).Str("cont", contId).Msg("closing logs writer")
		// The log stream can end before the client disconnects (e.g. the
		// container stops). Close the socket so the ws.ReadMessage loop below
		// unblocks; otherwise this handler goroutine leaks, pinning the socket
		// buffers and the moby follow connection until the browser tab closes.
		_ = ws.Close()
	}()

	for {
		if ctx.Err() != nil {
			log.Debug().Str("cont", contId).Err(err).Msg("container stream was closed, exiting")
			break
		}

		// listen to socket state, so the reader is canceled as the ws is closed
		_, _, err := ws.ReadMessage()
		if err != nil {
			log.Debug().Str("cont", contId).Err(err).Msg("closing container log stream")
			break
		}
	}
}

func getContainerIdAndService(r *http.Request, h *HandlerHttp) (*Service, string, error) {
	host, err := hostMid.GetHost(r.Context())
	if err != nil {
		return nil, "", err
	}

	contId := r.PathValue("contId")
	if contId == "" {
		return nil, "", fmt.Errorf("no containerId found in path param")
	}

	dkSrv, err := h.srv(host)
	if err != nil {
		return nil, "", fmt.Errorf("error getting docker service: %w", err)
	}

	return dkSrv, contId, err
}

func getDebuggerInfo(query url.Values, ws *websocket.Conn) string {
	debugMode := query.Get("debug")
	if debugMode == "" {
		return ""
	}

	debuggerImage := query.Get("image")
	if debuggerImage == "" {
		wsu.WErr(ws, fmt.Errorf("empty query param 'image', check you request"))
		return ""
	}

	return debuggerImage
}

func getExecCmd(query url.Values, ws *websocket.Conn) string {
	queryCmd := query.Get("cmd")
	if queryCmd == "" {
		const defaultCmd = "/bin/sh"
		wsu.WsMustWrite(ws, "unknown cmd passed defaulting to "+defaultCmd)
		return defaultCmd
	}

	return queryCmd
}
