package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/RA341/dockman/internal/docker"
	"github.com/docker/docker/client"
)

func main() {
	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatal(fmt.Errorf("unable to create docker client: %w", err))
	}

	srv := docker.NewSimpleContainerService(dockerClient)
	ctx := context.Background()

	contId := "8e6a715cdb9ce8e4c1718ca847dcb09a5dfe8ffea63d223b482deb6b78e85b4e"
	cmd := []string{"/bin/sh"}

	resp, err := srv.ExecContainer(ctx, contId, cmd)
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Close()

	// Writer goroutine to handle stdin
	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		writer := bufio.NewWriter(resp.Conn)

		for scanner.Scan() {
			line := scanner.Text()
			if line == "clear" {
				fmt.Print("\033[2J\033[H")
				continue
			}
			_, err := writer.WriteString(line + "\n")
			if err != nil {
				log.Println("unable to write to stdout", err)
				continue
			}
			err = writer.Flush()
			if err != nil {
				log.Println("unable to write to stdout", err)
				continue
			}

			if line == "exit" {
				break
			}
		}
	}()

	reader := bufio.NewReader(resp.Conn)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			log.Fatal(err)
		}

		fmt.Print(line)
	}
}
