package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/docker/cli/cli/command"
	"github.com/docker/cli/cli/flags"

	"github.com/docker/compose/v5/cmd/display" // event processors (Plain, JSON, TTY, Quiet)
	"github.com/docker/compose/v5/pkg/api"
	"github.com/docker/compose/v5/pkg/compose"
)

func main() {
	ctx := context.Background()

	// create + initialize docker CLI (required)
	dockerCLI, err := command.NewDockerCli()
	if err != nil {
		log.Fatalf("NewDockerCli: %v", err)
	}
	if err := dockerCLI.Initialize(&flags.ClientOptions{}); err != nil {
		log.Fatalf("Initialize docker cli: %v", err)
	}

	// Create compose service and supply an EventProcessor that writes to stdout.
	// Use display.Plain(os.Stdout) for plain text, display.JSON(os.Stdout) for JSON,
	// or a TTY writer for an interactive progress UI if you have a terminal.
	service, err := compose.NewComposeService(dockerCLI,
		compose.WithOutputStream(os.Stdout),                           // optional: where other CLI output goes
		compose.WithErrorStream(os.Stderr),                            // optional: where errors go
		compose.WithEventProcessor(display.Full(os.Stdout, os.Stdin)), // <-- important
	)
	if err != nil {
		log.Fatalf("NewComposeService: %v", err)
	}

	// load project
	project, err := service.LoadProject(ctx, api.ProjectLoadOptions{
		ConfigPaths: []string{"./docker-compose.yml"},
	})
	if err != nil {
		log.Fatalf("LoadProject: %v", err)
	}

	// Run Up: events (pull/build/create/start) will be printed to stdout by the EventProcessor
	if err := service.Up(ctx, project, api.UpOptions{
		Create: api.CreateOptions{},
		Start:  api.StartOptions{Project: project},
	}); err != nil {
		log.Fatalf("Up: %v", err)
	}

	// Wait a little so you can see the output in this example
	time.Sleep(2 * time.Second)

	// Run Down: events (stopping/removing) will also be printed
	if err := service.Down(ctx, project.Name, api.DownOptions{}); err != nil {
		log.Fatalf("Down: %v", err)
	}
}
