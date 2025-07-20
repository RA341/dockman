package cmd

import (
	"connectrpc.com/connect"
	"fmt"
	authrpc "github.com/RA341/dockman/generated/auth/v1/v1connect"
	dockerpc "github.com/RA341/dockman/generated/docker/v1/v1connect"
	dockermanagerrpc "github.com/RA341/dockman/generated/docker_manager/v1/v1connect"
	filesrpc "github.com/RA341/dockman/generated/files/v1/v1connect"
	gitrpc "github.com/RA341/dockman/generated/git/v1/v1connect"
	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/database"
	"github.com/RA341/dockman/internal/docker"
	dm "github.com/RA341/dockman/internal/docker_manager"
	"github.com/RA341/dockman/internal/files"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/internal/lsp"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/rs/zerolog/log"
	"net/http"
	"strings"
)

type App struct {
	Auth          *auth.Service
	Config        *config.AppConfig
	DockerManager *dm.Service
	Git           *git.Service
	File          *files.Service
	DB            *database.Service
	SSH           *ssh.Service
}

func NewApp(conf *config.AppConfig) (*App, error) {
	cr := conf.ComposeRoot

	// initialize services
	dbSrv := database.NewService(config.C.ConfigDir)
	authSrv := auth.NewService(config.C.Auth.Username, config.C.Auth.Password)
	sshSrv := ssh.NewService(dbSrv.SshKeyDB, dbSrv.MachineDB)
	fileSrv := files.NewService(cr)
	gitSrv := git.NewService(cr)
	dockerManagerSrv := dm.NewService(
		gitSrv,
		sshSrv,
		&config.C.LocalAddr,
		&config.C.Updater.DockmanImageBase,
		&cr,
	)

	log.Info().Msg("Dockman initialized successfully")
	return &App{
		Config:        conf,
		Auth:          authSrv,
		File:          fileSrv,
		Git:           gitSrv,
		DockerManager: dockerManagerSrv,
		DB:            dbSrv,
		SSH:           sshSrv,
	}, nil
}

func (a *App) Close() error {
	if err := a.File.Close(); err != nil {
		return fmt.Errorf("failed to close file service: %w", err)
	}

	if err := a.DB.Close(); err != nil {
		return fmt.Errorf("failed to close database service: %w", err)
	}

	return nil
}

func (a *App) registerRoutes(mux *http.ServeMux) {
	authInterceptor := connect.WithInterceptors()
	if a.Config.Auth.Enable {
		authInterceptor = connect.WithInterceptors(auth.NewInterceptor(a.Auth))
	}

	handlers := []func() (string, http.Handler){
		// auth
		func() (string, http.Handler) {
			return authrpc.NewAuthServiceHandler(auth.NewConnectHandler(a.Auth))
		},
		// files
		func() (string, http.Handler) {
			return filesrpc.NewFileServiceHandler(files.NewConnectHandler(a.File), authInterceptor)
		},
		func() (string, http.Handler) {
			return a.registerHttpHandler("/api/file", files.NewFileHandler(a.File))
		},
		// docker
		func() (string, http.Handler) {
			return dockerpc.NewDockerServiceHandler(docker.NewConnectHandler(
				a.DockerManager.GetService,
				config.C.Updater.Addr,
				config.C.Updater.PassKey,
			), authInterceptor)
		},
		// git
		func() (string, http.Handler) {
			return gitrpc.NewGitServiceHandler(git.NewConnectHandler(a.Git), authInterceptor)
		},
		func() (string, http.Handler) {
			return a.registerHttpHandler("/api/git", git.NewFileHandler(a.Git))
		},
		func() (string, http.Handler) {
			return a.registerHttpHandler("/auth/ping", http.HandlerFunc(
				func(w http.ResponseWriter, r *http.Request) {
					if _, err := w.Write([]byte("pong")); err != nil {
						return
					}
				}),
			)
		},
		// host_manager
		func() (string, http.Handler) {
			return dockermanagerrpc.NewDockerManagerServiceHandler(dm.NewConnectHandler(a.DockerManager), authInterceptor)
		},
		// lsp
		func() (string, http.Handler) {
			wsFunc := lsp.WebSocketHandler(lsp.DefaultUpgrader)
			return a.registerHttpHandler("/api/lsp", wsFunc)
		},
	}

	for _, hand := range handlers {
		path, handler := hand()
		mux.Handle(path, handler)
	}
}

func (a *App) registerHttpHandler(basePath string, subMux http.Handler) (string, http.Handler) {
	if !strings.HasSuffix(basePath, "/") {
		basePath = basePath + "/"
	}

	baseHandler := http.StripPrefix(strings.TrimSuffix(basePath, "/"), subMux)
	if a.Config.Auth.Enable {
		httpAuth := auth.NewHttpAuthMiddleware(a.Auth)
		baseHandler = httpAuth(baseHandler)
	}

	return basePath, baseHandler
}
