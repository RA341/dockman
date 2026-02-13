package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	connectcors "connectrpc.com/cors"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg/logger"

	"github.com/rs/cors"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func InitMeta(flavour info.FlavourType) {
	logger.InitDefault()
	info.SetFlavour(flavour)
	info.PrintInfo()
}

func StartServerAndApp(opt ...config.AppOpt) {
	app := NewApp(opt...)
	NewServer(app)
}

// NewServer takes in an initialized app and starts the server
func NewServer(app *App) {
	conf := app.Config

	router := http.NewServeMux()
	app.registerRoutes(router)

	corsConfig := cors.New(cors.Options{
		AllowedOrigins:      conf.GetAllowedOrigins(),
		AllowPrivateNetwork: true,
		AllowedMethods:      connectcors.AllowedMethods(),
		AllowedHeaders:      connectcors.AllowedHeaders(),
		ExposedHeaders:      connectcors.ExposedHeaders(),
	})
	finalMux := corsConfig.Handler(router)

	port := fmt.Sprintf(":%d", conf.Port)
	log.Info().Str("port", port).
		Str("url", conf.GetDockmanWithMachineUrl()).
		Msg("Starting server...")

	ht2Srv := &http2.Server{}

	srv := &http.Server{
		Addr:    port,
		Handler: h2c.NewHandler(finalMux, ht2Srv),
	}

	go func() {
		var err error

		if conf.Certs.IsSet() {
			log.Info().Msg("Certs found using https...")
			err = srv.ListenAndServeTLS(
				conf.Certs.PublicCertPath,
				conf.Certs.PrivateKeyPath,
			)
		} else {
			err = srv.ListenAndServe()
		}

		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal().Err(err).Msg("Error starting server")
		}
	}()

	<-conf.ServerContext.Done()

	log.Info().Msg("Context cancelled. Shutting down server...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("Error occurred while shutting down server")
		return
	}

	log.Info().Msg("Server gracefully stopped.")
}
