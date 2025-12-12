package docker

import (
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/RA341/dockman/internal/docker/debug"
	fu "github.com/RA341/dockman/pkg/fileutil"
	"github.com/gorilla/websocket"
	"github.com/moby/moby/api/pkg/stdcopy"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewExecWSHandler(srv ServiceProvider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		contId := r.PathValue("contID")
		log.Debug().Str("container", contId).Msg("Entering container")
		if contId == "" {
			http.Error(w, "No container ID found in path", http.StatusBadRequest)
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
			wsMustWrite(ws, "unknown cmd passed defaulting to "+execCmd)
		}

		readerCtx := r.Context()
		var resp client.HijackedResponse

		val := query.Get("debug")
		if val != "" {
			debuggerImage := query.Get("image")
			if debuggerImage == "" {
				wsErr(ws, fmt.Errorf("empty image found, check you request"))
				return
			}

			wsWriter := NewWsWriter(ws)
			var cleanup debug.CleanupFn

			resp, cleanup, err = srv().Debugger.ExecDebugContainer(
				readerCtx,
				contId,
				debuggerImage, wsWriter,
				queryCmd,
			)
			if err != nil {
				wsErr(ws, fmt.Errorf("error executing debug container: %w", err))
				return
			}
			defer cleanup()

		} else {
			resp, err = srv().Container.ContainerExec(readerCtx, contId, execCmd)
			if err != nil {
				wsErr(ws, err)
				return
			}
		}
		defer resp.Close()

		wsInf(ws, "Connected to Container")
		wsInf(ws, fmt.Sprintf("Entrypoint: %s", execCmd))

		readerCtx, cancel := context.WithCancel(readerCtx)
		defer cancel()

		go func() {
			// read from container and send to ws
			buf := make([]byte, 1024)
			for {
				n, err := resp.Reader.Read(buf)
				if err != nil {
					wsErr(ws, fmt.Errorf("error reading from container: %w", err))
					break
				}

				wsMustWrite(ws, string(buf[:n]))
			}

			cancel()
		}()

		for {
			if readerCtx.Err() != nil {
				wsErr(ws, fmt.Errorf("container stream was closed, exiting"))
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
}

func NewLogWSHandler(srv ServiceProvider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
		defer fu.Close(logsReader)

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer fu.Close(ws)

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

		log.Debug().Str("container", contId).Msg("closing container log stream")
	}
}

const (
	AnsiGreen = "\x1b[32m"
	AnsiRed   = "\x1b[31m"
	AnsiReset = "\x1b[0m"

	newLine = "\r\n"
)

func wsInf(ws *websocket.Conn, message string) {
	message = formatTermMessage(message, AnsiGreen)
	wsMustWrite(ws, message)
}

func wsErr(ws *websocket.Conn, errMessage error) {
	message := formatTermMessage(errMessage.Error(), AnsiRed)
	wsMustWrite(ws, message)
}

func formatTermMessage(message string, color string) string {
	message = color + message + AnsiReset + newLine
	return message
}

func wsMustWrite(ws *websocket.Conn, message string) {
	err := ws.WriteMessage(websocket.TextMessage, []byte(message))
	if err != nil {
		log.Warn().Err(err).Msg("Failed to write to socket")
		return
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
