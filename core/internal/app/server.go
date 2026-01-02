package app

import (
	"fmt"
	"net/http"

	connectcors "connectrpc.com/cors"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg/logger"
	"github.com/rs/cors"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func init() {
	info.PrintInfo()
	logger.InitDefault()
}

func StartServer(opt ...config.ServerOpt) {
	conf, err := config.Load(opt...)
	if err != nil {
		log.Fatal().Err(err).Msg("Error parsing config")
	}
	logger.InitConsole(conf.Log.Level, conf.Log.Verbose)

	app := NewApp(conf)

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
	err = http.ListenAndServe(
		port,
		h2c.NewHandler(
			finalMux,
			&http2.Server{},
		),
	)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}
}
