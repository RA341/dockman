package docker

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"

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
	srv ServiceProvider
}

func NewHandlerHttp(srv ServiceProvider) http.Handler {
	hand := &HandlerHttp{srv: srv}
	return hand.register()
}

func (h *HandlerHttp) register() http.Handler {
	subMux := http.NewServeMux()
	subMux.HandleFunc("GET /exec/{contId}", h.containerExec)
	subMux.HandleFunc("GET /logs/{contId}", h.containerLogs)

	return subMux
}

func (h *HandlerHttp) containerExec(w http.ResponseWriter, r *http.Request) {
	dkSrv, contId, err := getContainerIdAndService(r, h)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log.Debug().Str("id", contId).Msg("getting container logs")

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)

	query := r.URL.Query()
	execCmd := getExecCmd(query, ws)

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
		resp, err = dkSrv.Container.ContainerExec(ctx, contId, execCmd)
		if err != nil {
			wsu.WErr(ws, err)
			return
		}
		log.Debug().Msg("Attached to exec process")
	}
	defer func(resp *client.HijackedResponse) {
		// IMPORTANT: use CloseWrite since it stops the internal process
		// instead of Close which keeps it open
		log.Debug().Err(err).Msg("closing con")
		err = resp.CloseWrite()
		if err != nil {
			log.Warn().Err(err).Msg("error occurred while closing connection")
		}
	}(&resp)

	wsu.WInf(ws, "Connected to Container")
	if debuggerImage != "" {
		wsu.WInf(ws, fmt.Sprintf("Debug Image: %s", debuggerImage))
	}
	wsu.WInf(ws, fmt.Sprintf("Entrypoint: %s", execCmd))

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

	writer := wsu.NewWsWriter(ws)
	go func() {
		if tty {
			// tty streams dont need docker demultiplexing
			_, err = io.Copy(writer, logsReader)
		} else {
			// docker multiplexed stream
			_, err = stdcopy.StdCopy(writer, writer, logsReader)
		}
		log.Debug().Err(err).Str("cont", contId).Msg("closing logs writer")
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
