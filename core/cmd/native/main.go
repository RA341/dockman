package main

import (
	"embed"
	"io/fs"
	"log"

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

	app.StartServer(
		config.WithUIFS(subFS),
	)
}
