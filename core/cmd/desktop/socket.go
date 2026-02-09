package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/rs/zerolog/log"
)

const socketFile = "dockman.sock"

const StartUIMsg = "StartUI"

type SocketManager struct {
	socketPath string
}

func NewSocketManager() *SocketManager {
	fullSocket := filepath.Join(os.TempDir(), socketFile)
	return &SocketManager{socketPath: fullSocket}
}

// will exit if found
func (sm *SocketManager) exitIfAlreadyRunning() {
	conn, err := net.Dial("unix", sm.socketPath)
	if err != nil {
		// no prev socket found this is the only instance
		log.Info().Err(err).Msg("Failed to connect to socket")
		return
	}

	defer func(conn net.Conn) {
		err = conn.Close()
		if err != nil {
			log.Error().Err(err).Msg("Failed to close socket")
		}
	}(conn)

	log.Info().Msg("Another instance is running. Sending instructions...")
	message := strings.Join(os.Args[1:], " ")
	if message == "" {
		// launch desktop
		message = StartUIMsg
	}
	_, err = conn.Write([]byte(message))
	if err != nil {
		log.Warn().Err(err).Msg("could not send message")
	}

	os.Exit(0)
}

func (sm *SocketManager) setupSocketHandler(ctx context.Context, startUIFn func()) error {
	_ = os.Remove(sm.socketPath)

	listener, err := net.Listen("unix", sm.socketPath)
	if err != nil {
		return err
	}
	defer listener.Close()

	go func() {
		<-ctx.Done()
		listener.Close()
	}()

	log.Info().Str("addr", listener.Addr().String()).Msg("Socket handler listening on")

	handler := func(conn net.Conn) {
		defer func(conn net.Conn) {
			err := conn.Close()
			if err != nil {
				log.Printf("Error closing socket connection: %v", err)
			}
		}(conn)

		buf, err := io.ReadAll(conn)
		if err != nil {
			log.Printf("Error reading from socket: %v", err)
			return
		}

		msg := string(buf)
		fmt.Printf("\n[Primary Instance] Received command from another instance: %s\n", msg)

		if msg == StartUIMsg {
			// send message to start desktop ui
			startUIFn()
		}
	}

	for {
		conn, err := listener.Accept()
		if err != nil {
			return fmt.Errorf("could not accept connection %w", err)
		}
		go handler(conn)
	}
}
