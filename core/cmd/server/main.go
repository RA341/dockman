package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"

	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/info"
)

//go:embed dist
var frontendDir embed.FS

func init() {
	app.InitMeta(info.FlavourServer)
}
func setupEmbeddedFrontend() (fs.FS, error) {
	subFS, err := fs.Sub(frontendDir, "dist")
	if err != nil {
		return nil, fmt.Errorf("error loading frontend directory: %w", err)
	}
	return subFS, nil
}
func main() {
	subFS, err := setupEmbeddedFrontend()
	if err != nil {
		log.Fatal("Failed to setup embedded frontend filesystem", err)
	}

	app.StartServer(
		config.WithUIFS(subFS),
	)
}
