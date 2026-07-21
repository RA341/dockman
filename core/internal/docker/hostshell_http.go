package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	hostMid "github.com/RA341/dockman/internal/host/middleware"
	fu "github.com/RA341/dockman/pkg/fileutil"
	wsu "github.com/RA341/dockman/pkg/ws"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

// clients send keystrokes as text frames; binary frames carry control JSON
type shellResize struct {
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// hostShell attaches a websocket to an interactive shell in the same context
// compose and docker commands run in: the dockman container for the local
// host, an ssh session for remote hosts. Optional query params: file (start
// in that compose file's directory), cols/rows (initial terminal size).
func (h *HandlerHttp) hostShell(w http.ResponseWriter, r *http.Request) {
	host, err := hostMid.GetHost(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	dkSrv, err := h.srv(host)
	if err != nil {
		http.Error(w, fmt.Sprintf("error getting docker service: %v", err), http.StatusBadRequest)
		return
	}

	query := r.URL.Query()
	file := query.Get("file")
	cols := parseShellDim(query.Get("cols"), 80)
	rows := parseShellDim(query.Get("rows"), 24)

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Error upgrading to websocket "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer fu.Close(ws)
	wsu.LimitClientMessages(ws)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	shell, err := dkSrv.Compose.StartShell(ctx, file, cols, rows)
	if err != nil {
		wsu.WErr(ws, fmt.Errorf("unable to start host shell: %w", err))
		return
	}
	defer fu.Close(shell)

	wsu.WInf(ws, fmt.Sprintf("Connected to %s", host))

	go func() {
		// shell output goes out as binary frames: a text frame split inside
		// a multi-byte character would be rejected by the browser
		buf := make([]byte, 4096)
		for {
			n, err := shell.Read(buf)
			if n > 0 {
				if werr := ws.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
					break
				}
			}
			if err != nil {
				break
			}
		}
		cancel()
		// unblock the ReadMessage loop below
		_ = ws.SetReadDeadline(time.Now())
	}()

	for {
		if ctx.Err() != nil {
			break
		}

		mt, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}

		if mt == websocket.BinaryMessage {
			var rs shellResize
			if json.Unmarshal(msg, &rs) == nil && rs.Cols > 0 && rs.Rows > 0 {
				_ = shell.Resize(rs.Cols, rs.Rows)
			}
			continue
		}

		if _, err = shell.Write(msg); err != nil {
			break
		}
	}

	log.Debug().Str("host", host).Msg("host shell closed")
}

func parseShellDim(raw string, def uint16) uint16 {
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 || v > 1000 {
		return def
	}
	return uint16(v)
}
