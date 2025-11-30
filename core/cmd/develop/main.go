package main

import (
	"embed"
	"io/fs"
	"log"
	"os"

	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg/argos"
)

//go:embed dist
var frontendDir embed.FS

// useful for developing sets some default options
func main() {
	prefixer := argos.Prefixer(config.EnvPrefix)

	info.Version = info.VersionDev

	envMap := map[string]string{
		"AUTH_ENABLE":   "true",
		"AUTH_USERNAME": "test",
		"AUTH_PASSWORD": "test",
		"LOG_LEVEL":     "debug",
		"LOG_VERBOSE":   "true",
		"CONFIG":        "./config",
		"COMPOSE_ROOT":  "./compose",
		"UPDATER_HOST":  "http://localhost:8869",
	}

	for k, v := range envMap {
		_ = os.Setenv(prefixer(k), v)
	}
	subFS, err := fs.Sub(frontendDir, "dist")
	if err != nil {
		log.Fatal("Error loading frontend directory", err)
	}

	app.StartServer(config.WithUIFS(subFS))
}
