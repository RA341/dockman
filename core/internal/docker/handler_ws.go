package docker

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/gorilla/websocket"
	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewExecWSHandler(srv ServiceProvider) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ExecWSHandler(srv, writer, request)
	}
}

// ExecWSHandler in router setup
func ExecWSHandler(srv ServiceProvider, w http.ResponseWriter, r *http.Request) {
	contId := r.PathValue("contID")
	log.Debug().Str("container", contId).Msg("Entering container")
	if contId == "" {
		http.Error(w, "No container ID found in path", http.StatusBadRequest)
		return
	}

	execCmd := "/bin/sh"
	queryCmd := r.URL.Query().Get("cmd")
	if queryCmd != "" {
		execCmd = queryCmd
	}

	ctx := context.Background()
	execConfig := client.ExecCreateOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		TTY:          true,
		Cmd:          []string{execCmd},
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fileutil.Close(ws)

	daemon := srv().Container.MobyClient
	execResp, err := daemon.ExecCreate(ctx, contId, execConfig)
	if err != nil {
		wsErr(ws, fmt.Errorf("error creating shell into container: %w", err))
		return
	}

	resp, err := daemon.ExecAttach(ctx, execResp.ID, client.ExecAttachOptions{TTY: true})
	if err != nil {
		wsErr(ws, fmt.Errorf("error creating shell into container: %w", err))
		return
	}
	defer resp.Close()

	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := resp.Reader.Read(buf)
			if err != nil {
				log.Debug().Err(err).Msg("Unable to read from container " + err.Error())
				break
			}
			err = ws.WriteMessage(websocket.TextMessage, buf[:n])
			if err != nil {
				log.Warn().Str("cont", contId).Err(err).Msg("Unable to write to container " + err.Error())
				return
			}
		}
	}()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			log.Debug().Str("cont", contId).Err(err).Msg("Unable to read from socket " + err.Error())
			break
		}

		_, err = resp.Conn.Write(msg)
		if err != nil {
			log.Warn().Err(err).Msg("Unable to write to container " + err.Error())
			return
		}
	}
}

func NewLogWSHandler(srv ServiceProvider) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		LogWSHandler(srv, writer, request)
	}
}

// LogWSHandler in router setup
func LogWSHandler(srv ServiceProvider, w http.ResponseWriter, r *http.Request) {
	contId := r.PathValue("contID")
	if contId == "" {
		http.Error(w, "No container ID found in path", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	logsReader, tty, err := srv().Container.ContainerLogs(ctx, contId)
	if err != nil {
		http.Error(w, "unable to stream container logs: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fileutil.Close(logsReader)

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fileutil.Close(ws)

	writer := NewWsWriter(ws)
	if tty {
		// tty streams dont need docker demultiplexing
		_, err = io.Copy(writer, logsReader)
	} else {
		// docker multiplexed stream
		_, err = stdcopy.StdCopy(writer, writer, logsReader)
	}
	if err != nil {
		wsErr(ws, fmt.Errorf("error: copying container stream: %w", err))
		return
	}
}

func wsErr(ws *websocket.Conn, err error) {
	err2 := ws.WriteMessage(websocket.TextMessage, []byte(err.Error()))
	if err2 != nil {
		log.Warn().Err(err2).Msg("Unable to write to stream")
	}
}

type WsWriter struct {
	ws *websocket.Conn
}

func NewWsWriter(ws *websocket.Conn) *WsWriter {
	return &WsWriter{
		ws: ws,
	}
}

func (w *WsWriter) Write(p []byte) (n int, err error) {
	err = w.ws.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		log.Warn().Err(err).Msg("Unable to write to websocket")
		return len(p), err
	}

	return len(p), nil
}
