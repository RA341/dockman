package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var containerID string

func wsHandler(w http.ResponseWriter, r *http.Request) {
	ws, _ := upgrader.Upgrade(w, r, nil)
	defer ws.Close()

	execConfig := container.ExecOptions{
		AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
		Cmd: []string{"/bin/sh"},
	}

	ctx := context.Background()
	execResp, err := clu.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		log.Fatal(err)
	}

	resp, err := clu.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{Tty: true})
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Close()

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

	// 6. Stream WebSocket Input -> Docker
	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}
		resp.Conn.Write(msg)
	}
}

var clu *client.Client

func main() {
	var err error
	clu, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatal(fmt.Errorf("unable to create docker client: %w", err))
	}

	ctx := context.Background()
	resp, err := clu.ContainerCreate(ctx, &container.Config{
		Image: "postgres:alpine",
		Env:   []string{"POSTGRES_PASSWORD=mysecretpassword"},
	}, nil, nil, nil, "")
	if err != nil {
		log.Fatal(fmt.Errorf("unable to create docker container: %w", err))
	}
	defer clu.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})

	containerID = resp.ID

	err = clu.ContainerStart(ctx, resp.ID, container.StartOptions{})
	if err != nil {
		log.Fatal(fmt.Errorf("unable to start docker container: %w", err))
	}

	http.HandleFunc("/exec", wsHandler)
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to start http server: %w", err))
	}
}
