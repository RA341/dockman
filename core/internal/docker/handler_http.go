package docker

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/RA341/dockman/internal/docker/debug"
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
	subMux.HandleFunc("GET /exec/{contID}/{host}", h.containerExec)
	subMux.HandleFunc("GET /logs/{contID}/{host}", h.containerLogs)

	return subMux
}

func (h *HandlerHttp) containerExec(w http.ResponseWriter, r *http.Request) {
	contId, host, err := getIdAndHost(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	dkSrv, err := h.srv(host)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)

	execCmd := "/bin/sh"
	query := r.URL.Query()

	queryCmd := query.Get("cmd")
	if queryCmd != "" {
		execCmd = queryCmd
	} else {
		wsu.WsMustWrite(ws, "unknown cmd passed defaulting to "+execCmd)
	}

	readerCtx := r.Context()
	var resp client.HijackedResponse

	val := query.Get("debug")
	if val != "" {
		debuggerImage := query.Get("image")
		if debuggerImage == "" {
			wsu.WsErr(ws, fmt.Errorf("empty image found, check you request"))
			return
		}

		wsWriter := wsu.NewWsWriter(ws)
		var cleanup debug.CleanupFn
		wsu.WsInf(ws, "setting up debug container standby...")

		resp, cleanup, err = dkSrv.Debugger.ExecDebugContainer(
			readerCtx,
			contId,
			debuggerImage, wsWriter,
			queryCmd,
		)
		if err != nil {
			wsu.WsErr(ws, fmt.Errorf("error executing debug container: %w", err))
			return
		}
		defer cleanup()

	} else {
		resp, err = dkSrv.Container.ContainerExec(readerCtx, contId, execCmd)
		if err != nil {
			wsu.WsErr(ws, err)
			return
		}
	}
	defer resp.Close()

	wsu.WsInf(ws, "Connected to Container")
	wsu.WsInf(ws, fmt.Sprintf("Entrypoint: %s", execCmd))

	readerCtx, cancel := context.WithCancel(readerCtx)
	defer cancel()

	go func() {
		// read from container and send to ws
		buf := make([]byte, 1024)
		for {
			n, err := resp.Reader.Read(buf)
			if err != nil {
				wsu.WsErr(ws, fmt.Errorf("error reading from container: %w", err))
				break
			}

			wsu.WsMustWrite(ws, string(buf[:n]))
		}

		cancel()
	}()

	for {
		if readerCtx.Err() != nil {
			wsu.WsErr(ws, fmt.Errorf("container stream was closed, exiting"))
			break
		}

		// read from ws to container
		_, msg, err := ws.ReadMessage()
		if err != nil {
			log.Debug().Str("cont", contId).Err(err).Msg("Unable to read from socket " + err.Error())
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

func getIdAndHost(r *http.Request) (containerId, host string, err error) {
	contId := r.PathValue("contID")
	log.Debug().Str("container", contId).Msg("Entering container")
	if contId == "" {
		return "", host, fmt.Errorf("no container ID found in path")
	}

	host = r.PathValue("host")
	if host == "" {
		return "", "", fmt.Errorf("no host found in path")
	}
	log.Debug().
		Str("container", contId).Str("host", host).
		Msg("Entering container")

	return contId, host, nil
}

func (h *HandlerHttp) containerLogs(w http.ResponseWriter, r *http.Request) {
	contId, host, err := getIdAndHost(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	dkSrv, err := h.srv(host)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

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
	if tty {
		// tty streams dont need docker demultiplexing
		_, err = io.Copy(writer, logsReader)
	} else {
		// docker multiplexed stream
		_, err = stdcopy.StdCopy(writer, writer, logsReader)
	}
	if err != nil {
		wsu.WsErr(ws, fmt.Errorf("error: copying container stream: %w", err))
		return
	}

	log.Debug().Str("container", contId).Msg("closing container log stream")
}
