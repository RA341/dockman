package main

import (
	"context"
	"fmt"
	"github.com/RA341/dockman/internal/docker"
	dm "github.com/RA341/dockman/internal/docker_manager"
	"github.com/RA341/dockman/pkg/logger"
	"github.com/rs/zerolog/log"
	"net/http"
	"os"
)

func init() {
	err := LoadConfig()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load config")
	}

	logger.InitConsole(conf.logger.Level, conf.logger.Verbose)
}

func main() {
	cli, err := dm.NewLocalClient()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to local docker client, updater requires " +
			"\n`- /var/run/docker.sock:/var/run/docker.sock`\n\n mount")
		return
	}

	composeClient := docker.NewComposeService(
		&conf.composeRoot,
		&conf.updater.DockmanImageBase,
		docker.NewContainerService(cli),
		docker.NewNoopSyncer(),
	)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /update", updateHandler(composeClient))

	port := "8869"
	log.Info().Str("port", port).Msg("Dockman updater starting...")

	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), mux); err != nil {
		log.Fatal().Err(err).Msg("Failed to start Dockman updater")
	}
}

// updateHandler is our handler function.
func updateHandler(client *docker.ComposeService) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pathAuthKey := r.Header.Get("Authorization")
		if pathAuthKey == "" || conf.updater.PassKey != pathAuthKey {
			http.Error(w, "invalid Authorization", http.StatusForbidden)
			return
		}

		filepath := r.FormValue("composeFile")
		if filepath == "" {
			http.Error(w, "composeFile is required", http.StatusBadRequest)
			return
		}

		log.Info().Str("path", filepath).Msg("Received a valid update request")
		w.WriteHeader(http.StatusOK)

		// update in background
		go update(client, filepath)
	}

}

func update(srv *docker.ComposeService, path string) {
	log.Info().Msg("Updating dockman container")
	ctx := context.Background()

	project, err := srv.LoadProject(ctx, path)
	if err != nil {
		log.Error().Err(err).Msg("Failed to load project")
		return
	}

	cli, err := srv.LoadComposeClient(os.Stdout, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to load compose client")
		return
	}

	if err = srv.Update(ctx, project, cli); err != nil {
		log.Error().Err(err).Msg("Failed to update project")
		return
	}
}
