package cmd

import (
	connectcors "connectrpc.com/cors"
	"fmt"
	dockerpc "github.com/RA341/dockman/generated/docker/v1/v1connect"
	filesrpc "github.com/RA341/dockman/generated/files/v1/v1connect"
	"github.com/RA341/dockman/generated/git/v1/gitrpc"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/files"
	"github.com/RA341/dockman/internal/git"
	"github.com/rs/cors"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"io"
	"net/http"
	"path/filepath"
	"strings"
)

type ServerConfig struct {
	Port        int
	ComposeRoot string
	uiHandler   http.Handler
}

type ServerOpt func(o *ServerConfig)

func WithPort(port int) ServerOpt {
	return func(o *ServerConfig) {
		o.Port = port
	}
}

func WithUI(handler http.Handler) ServerOpt {
	return func(o *ServerConfig) {
		o.uiHandler = handler
	}
}

func WithComposeRoot(compose string) ServerOpt {
	return func(o *ServerConfig) {
		o.ComposeRoot = compose
	}
}

func StartServer(opt ...ServerOpt) {
	config := &ServerConfig{}
	for _, o := range opt {
		o(config)
	}
	log.Info().Any("config", config).Msg("loaded config")

	router := http.NewServeMux()

	// todo
	//authInterceptor := connect.WithInterceptors(newAuthInterceptor())

	closers := registerHandlers(router, config)
	defer func() {
		if err := closers.Close(); err != nil {
			log.Warn().Err(err).Msg("error occurred while closing services")
		}
	}()

	router.Handle("/", config.uiHandler)

	middleware := cors.New(cors.Options{
		AllowedOrigins:      []string{"*"}, // todo load from env
		AllowPrivateNetwork: true,
		AllowedMethods:      connectcors.AllowedMethods(),
		AllowedHeaders:      append(connectcors.AllowedHeaders(), "Authorization"),
		ExposedHeaders:      connectcors.ExposedHeaders(),
	})

	log.Info().Int("port", config.Port).Msg("Starting server...")

	err := http.ListenAndServe(
		fmt.Sprintf(":%d", config.Port),
		middleware.Handler(h2c.NewHandler(router, &http2.Server{})),
	)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}
}

func registerHandlers(mux *http.ServeMux, config *ServerConfig) io.Closer {
	services := initServices(config)

	endpoints := []func() (string, http.Handler){
		func() (string, http.Handler) {
			return filesrpc.NewFileServiceHandler(files.NewHandler(services.file))
		},
		func() (string, http.Handler) {
			return files.NewFileHandler(services.file).RegisterHandler()
		},
		func() (string, http.Handler) {
			return dockerpc.NewDockerServiceHandler(docker.NewHandler(services.docker))
		},
		func() (string, http.Handler) {
			return gitrpc.NewGitServiceHandler(git.NewHandler(services.git))
		},
	}

	for _, svc := range endpoints {
		path, handler := svc()
		mux.Handle(path, handler)
	}

	return services
}

type AllServices struct {
	file   *files.Service
	git    *git.Service
	docker *docker.Service
}

func (a *AllServices) Close() error {
	if err := a.file.Close(); err != nil {
		return err
	}
	if err := a.docker.Close(); err != nil {
		return err
	}

	return nil
}

func initServices(conf *ServerConfig) *AllServices {
	composeRoot := strings.TrimSpace(conf.ComposeRoot)
	abs, err := filepath.Abs(composeRoot)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to get absolute path for compose root")
	}
	composeRoot = abs

	fMan := files.NewService(composeRoot)
	gitMan := git.NewService(composeRoot, fMan.Fdb)
	dock := docker.NewService(composeRoot)

	return &AllServices{
		file:   fMan,
		git:    gitMan,
		docker: dock,
	}
}
