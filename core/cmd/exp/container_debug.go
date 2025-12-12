package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	cont2 "github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/debug"
	"github.com/gorilla/websocket"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	cli, err := client.New()
	if err != nil {
		log.Fatal(err)
		return
	}
	cont := cont2.New(cli)
	debugSrv := debug.New(cont)

	ctx := context.Background()
	resp, err := cli.ContainerCreate(ctx,
		client.ContainerCreateOptions{
			Config: &container.Config{
				Image: "postgres:alpine",
				Env:   []string{"POSTGRES_PASSWORD=mysecretpassword"},
			},
			HostConfig:       nil,
			NetworkingConfig: nil,
			Platform:         nil,
		},
	)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to create docker container: %w", err))
	}
	defer cli.ContainerRemove(ctx, resp.ID, client.ContainerRemoveOptions{Force: true})

	_, err = cli.ContainerStart(ctx, resp.ID, client.ContainerStartOptions{})
	if err != nil {
		log.Fatal(fmt.Errorf("unable to start docker container: %w", err))
	}

	http.HandleFunc("/exec", func(w http.ResponseWriter, r *http.Request) {
		wsHandler(w, r, debugSrv, resp.ID)
	})
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to start http server: %w", err))
	}
}

type WsWriter struct {
	ws *websocket.Conn
}

func (w WsWriter) Write(p []byte) (n int, err error) {
	err = w.ws.WriteMessage(websocket.TextMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func wsHandler(w http.ResponseWriter, r *http.Request, dbg *debug.Service, containerID string) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("unable to upgrade to websocket: %s", err), http.StatusInternalServerError)
		return
	}

	defer ws.Close()

	image := "nixery.dev/shell/fish"
	resp, _, err := dbg.ExecDebugContainer(
		r.Context(), containerID,
		image, WsWriter{ws: ws},
		"fish",
	)
	// todo exit container once connection closed
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	defer func() {
		log.Println("exiting fun")
		resp.Close()
		if err != nil {
			log.Fatal(fmt.Errorf("unable to remove container: %w", err))
		}
	}()

	go func() {
		// Simple buffer to copy data
		buf := make([]byte, 1024)
		for {
			n, err := resp.Reader.Read(buf)
			if err != nil {
				break
			}
			ws.WriteMessage(websocket.TextMessage, buf[:n])
		}
	}()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}
		resp.Conn.Write(msg)
	}

	_, err = dbg.Cli().ContainerRemove(context.Background(), containerID, client.ContainerRemoveOptions{Force: true})
	if err != nil {
		log.Printf("unable to remove docker container: %v", err)
		return
	}

	log.Println("exiting wsHandler")
}
