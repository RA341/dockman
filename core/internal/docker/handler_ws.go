package docker

import (
	"context"
	"net/http"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/docker/docker/api/types/container"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type HandlerWS struct {
	srv ServiceProvider
}

func NewWSExec(srv ServiceProvider) http.HandlerFunc {
	ws := &HandlerWS{srv: srv}
	return ws.wsHandler
}

// in router setup
// add/provisions/{id}
func (h *HandlerWS) wsHandler(w http.ResponseWriter, r *http.Request) {
	contId := r.PathValue("contID")
	log.Debug().Str("container", contId).Msg("Entering container")
	if contId == "" {
		http.Error(w, "No container ID found in path", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	execConfig := container.ExecOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Cmd:          []string{"/bin/sh"},
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fileutil.Close(ws)

	daemon := h.srv().Container.daemon
	execResp, err := daemon.ContainerExecCreate(ctx, contId, execConfig)
	if err != nil {
		http.Error(w, "Error creating shell into container "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp, err := daemon.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{Tty: true})
	if err != nil {
		http.Error(w, "Error creating shell into container "+err.Error(), http.StatusInternalServerError)
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
