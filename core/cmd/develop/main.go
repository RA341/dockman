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

func init() {
	app.InitMeta(info.FlavourDevelop)
}

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
		//"LOG_HTTP":      "true",
		"CONFIG":       "./config",
		"COMPOSE_ROOT": "./compose",
		"UPDATER_HOST": "http://localhost:8869",

		//"PUB_CERT_PATH": "./cert.pem",
		//"PRIV_KEY_PATH": "./key.pem",

		"AUTH_OIDC_ENABLE": "true",
		//"AUTH_OIDC_AUTO_REDIRECT": "false",
		"AUTH_OIDC_ISSUER":        "https://localhost",
		"AUTH_OIDC_CLIENT_ID":     "74347a8e-718d-4bb1-b0f6-e264b0c45bad",
		"AUTH_OIDC_CLIENT_SECRET": "DIvLgg09ibXJhmVTtFYQXPjSrzBTJd2D",
		"AUTH_OIDC_REDIRECT_URL":  "http://localhost:8866/api/auth/login/oidc/callback",
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
