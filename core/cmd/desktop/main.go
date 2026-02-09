package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"

	"os"

	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/desktop"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg/argos"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog/log"
)

//go:embed dist
var frontendDir embed.FS

func init() {
	app.InitMeta(info.FlavourDesktop)
}

func main() {
	sm := NewSocketManager()

	sm.exitIfAlreadyRunning()

	loadEnvFile()
	frontend, err := setupEmbeddedFrontend()
	if err != nil {
		log.Fatal().Err(err).Msg("error loading embedded frontend")
	}

	// don't need to pass in ctx here tray handles it internally
	desk := desktop.NewDesktop(
		frontend,
		config.WithUIFS(frontend),
	)

	ctx := context.Background()
	go func() {
		err := sm.setupSocketHandler(ctx, desk.StartUI)
		if err != nil {
			log.Fatal().Err(err).Msg("error setting up socket handler")
		}
	}()

	desk.Start()
}

func setupEmbeddedFrontend() (fs.FS, error) {
	subFS, err := fs.Sub(frontendDir, "dist")
	if err != nil {
		return nil, fmt.Errorf("error loading frontend directory: %w", err)
	}
	return subFS, nil
}

func loadEnvFile() {
	err := godotenv.Load()
	if err != nil {
		log.Warn().Err(err).Msg("error loading .env file")
	}
}

func setupEnvs() {
	prefixer := argos.Prefixer(config.EnvPrefix)
	envMap := map[string]string{
		"LOG_LEVEL":   "debug",
		"LOG_VERBOSE": "true",
		"CONFIG":      "./config",
		//"COMPOSE_ROOT": "./compose",
	}
	for k, v := range envMap {
		_ = os.Setenv(prefixer(k), v)
	}
}
