package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/compose-spec/compose-go/v2/types"
	"github.com/docker/cli/cli/command"
	"github.com/docker/cli/cli/flags"
	"github.com/docker/cli/cli/streams" // <--- Import this
	"github.com/docker/compose/v2/pkg/api"
	"github.com/docker/compose/v2/pkg/compose"
	"github.com/gorilla/websocket"
)

// WSReadWriter with Mutex (Thread Safe)
type WSReadWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func NewWsWriter(conn *websocket.Conn) *WSReadWriter {
	return &WSReadWriter{conn: conn}
}

func (w *WSReadWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	err = w.conn.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func WsStream(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	wsWriter := NewWsWriter(ws)

	// --- KEY CHANGE STARTS HERE ---

	// 1. Create a generic Docker Output Stream wrapping our WebSocket writer
	dockerOut := streams.NewOut(wsWriter)

	// 2. Force Docker to believe this stream is a TTY (Terminal)
	// This enables the "interactive" UI mode (progress bars, clearing lines, colors)
	dockerOut.SetIsTerminal(true)

	dockerCli, err := command.NewDockerCli(
		command.WithStandardStreams(),
	)

	if err != nil {
		log.Println("Failed to create docker cli:", err)
		return
	}

	opts := flags.NewClientOptions()
	if err := dockerCli.Initialize(opts); err != nil {
		wsWriter.Write([]byte(fmt.Sprintf("Error init: %v", err)))
		return
	}

	composeClient := compose.NewComposeService(dockerCli)

	project := &types.Project{
		Name:       "test-compose-tty",
		WorkingDir: filepath.Join(os.TempDir(), "compose-tty-test"),
		Services: types.Services{
			"db": {
				Name:  "db",
				Image: "redis:alpine", // Using a real image to show the Pull progress bars
			},
			"web": {
				Name:  "web",
				Image: "alpine:latest",
				Command: []string{
					"sh", "-c", "echo 'Starting app...'; sleep 2; echo 'App Running'; sleep 2;",
				},
			},
		},
	}

	// Start Compose
	ctx := context.Background()

	// Because we enabled TTY, Docker will emit ANSI codes (colors, cursor moves).
	// Ensure your Frontend (xterm.js) is ready to parse them.
	err = composeClient.Up(ctx, project, api.UpOptions{
		Create: api.CreateOptions{
			RemoveOrphans: true,
			Inherit:       true,
		},
	})

	if err != nil {
		wsWriter.Write([]byte(fmt.Sprintf("\r\nError: %v", err)))
		return
	}

	wsWriter.Write([]byte("\r\n--- Done ---\r\n"))
	time.Sleep(2 * time.Second)
}

//func main() {
//	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
//		http.ServeFile(w, r, "index.html")
//	})
//	http.HandleFunc("/ws", WsStream)
//
//	log.Println("Server started on :8080")
//	log.Fatal(http.ListenAndServe(":8080", nil))
//}
