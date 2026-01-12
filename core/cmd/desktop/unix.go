package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
)

const socketPath = "/tmp/dockman.sock"

const StartUIMsg = "StartUI"

func setupSocketHandler(ctx context.Context) error {
	_ = os.Remove(socketPath)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return err
	}
	defer listener.Close()

	go func() {
		<-ctx.Done()
		listener.Close()
	}()

	log.Println("Socket handler listening on", listener.Addr())
	_ = os.Remove(socketPath)

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
			//processChan <- Process{state: Start, name: desktop}
		}
	}

	for {
		conn, err := listener.Accept()
		if err != nil {
			return fmt.Errorf("could not accept connection %w", err)
		}
		handler(conn)
	}
}

// will exit if found
func exitIfAlreadyRunning() {
	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		// no prev socket found this is the only instance
		log.Printf("Failed to connect to socket: %v\n", err)
		return
	}

	defer func(conn net.Conn) {
		err = conn.Close()
		if err != nil {
			log.Println(err)
		}
	}(conn)
	fmt.Println("Another instance is running. Sending instructions...")

	message := strings.Join(os.Args[1:], " ")
	if message == "" {
		// launch desktop
		message = StartUIMsg
	}
	_, err = conn.Write([]byte(message))
	if err != nil {
		log.Println("could not send message", err)
	}

	os.Exit(0)
}
