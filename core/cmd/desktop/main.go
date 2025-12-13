package main

import (
	"embed"
	"io/fs"
	"log"
	"os"

	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/config"
)

//go:embed dist
var frontendDir embed.FS

func main() {
	log.Printf("Loading frontend from embedded FS")
	subFS, err := fs.Sub(frontendDir, "dist")
	if err != nil {
		log.Fatal("Error loading frontend directory", err)
	}

	_ = os.Setenv("DOCKMAN_PORT", "8868")

	app.StartServer(
		config.WithUIFS(subFS),
	)
}
