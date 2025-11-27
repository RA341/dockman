package app

import (
	"fmt"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	authrpc "github.com/RA341/dockman/generated/auth/v1/v1connect"
	"github.com/RA341/dockman/generated/cleaner/v1/v1connect"
	configrpc "github.com/RA341/dockman/generated/config/v1/v1connect"
	dockerpc "github.com/RA341/dockman/generated/docker/v1/v1connect"
	dockermanagerrpc "github.com/RA341/dockman/generated/docker_manager/v1/v1connect"
	filesrpc "github.com/RA341/dockman/generated/files/v1/v1connect"
	inforpc "github.com/RA341/dockman/generated/info/v1/v1connect"
	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/cleaner"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/database"
	"github.com/RA341/dockman/internal/docker"
	dm "github.com/RA341/dockman/internal/docker_manager"
	"github.com/RA341/dockman/internal/files"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/docker/docker/client"
	"github.com/rs/zerolog/log"
)

type App struct {
	Auth          *auth.Service
	Config        *config.AppConfig
	DockerManager *dm.Service
	File          *files.Service
	DB            *database.Service
	Info          *info.Service
	SSH           *ssh.Service
	UserConfigSrv *config.Service
}

func NewApp(conf *config.AppConfig) (*App, error) {
	cr := conf.ComposeRoot

	gormDB, dbSrv := database.NewService(conf.ConfigDir)

	infoSrv := info.NewService(dbSrv.InfoDB)

	sessionsDB := auth.NewSessionGormDB(gormDB, uint(conf.Auth.MaxSessions))
	authDB := auth.NewUserGormDB(gormDB)
	authSrv := auth.NewService(
		conf.Auth.Username,
		conf.Auth.Password,
		&conf.Auth,
		authDB,
		sessionsDB,
	)

	sshSrv := ssh.NewService(dbSrv.SshKeyDB, dbSrv.MachineDB)

	dockerManagerSrv := dm.NewService(
		sshSrv,
		dbSrv.ImageUpdateDB,
		dbSrv.UserConfigDB,
		func() string {
			return conf.ComposeRoot
		},
		func() *config.UpdaterConfig {
			return &conf.Updater
		},
		func() string {
			return conf.LocalAddr
		},
	)

	fileSrv := files.NewService(
		cr, conf.DockYaml,
		conf.Perms.PUID, conf.Perms.GID,
		dockerManagerSrv.GetActiveClient,
	)
	err := git.NewMigrator(cr)
	if err != nil {
		log.Fatal().Err(err).Msg("unable to complete git migration")
	}

	userConfigSrv := config.NewService(
		dbSrv.UserConfigDB,
		dockerManagerSrv.ResetContainerUpdater,
	)

	log.Info().Msg("Dockman initialized successfully")
	return &App{
		Config:        conf,
		Auth:          authSrv,
		File:          fileSrv,
		DockerManager: dockerManagerSrv,
		DB:            dbSrv,
		Info:          infoSrv,
		SSH:           sshSrv,
		UserConfigSrv: userConfigSrv,
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

func (a *App) registerApiRoutes(mux *http.ServeMux) {
	authInterceptor := connect.WithInterceptors()
	if a.Config.Auth.Enable {
		authInterceptor = connect.WithInterceptors(auth.NewInterceptor(a.Auth))
	}

	cleanerSrv := cleaner.NewService(
		func() *client.Client {
			return a.DockerManager.GetService().Container.Daemon
		},
		a.DB.CleanerStore,
	)

	handlers := []func() (string, http.Handler){
		// auth
		func() (string, http.Handler) {
			return authrpc.NewAuthServiceHandler(auth.NewConnectHandler(a.Auth))
		},
		// info
		func() (string, http.Handler) {
			return inforpc.NewInfoServiceHandler(info.NewConnectHandler(a.Info), authInterceptor)
		},
		// user config
		func() (string, http.Handler) {
			return configrpc.NewConfigServiceHandler(config.NewConnectHandler(a.UserConfigSrv), authInterceptor)
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
			return dockerpc.NewDockerServiceHandler(docker.NewConnectHandler(a.DockerManager.GetService, a.Config.Updater.Addr),
				authInterceptor,
			)
		},
		func() (string, http.Handler) {
			return v1connect.NewCleanerServiceHandler(cleaner.NewHandler(cleanerSrv))
		},
		// git
		//func() (string, http.Handler) {
		//	return gitrpc.NewGitServiceHandler(git.NewConnectHandler(a.Git), authInterceptor)
		//},
		//func() (string, http.Handler) {
		//	return a.registerHttpHandler("/api/git", git.NewFileHandler(a.Git))
		//},l
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
		//func() (string, http.Handler) {
		//	wsFunc := lsp.WebSocketHandler(lsp.DefaultUpgrader)
		//	return a.registerHttpHandler("/ws/lsp", wsFunc)
		//},
	}

	for _, hand := range handlers {
		path, handler := hand()
		mux.Handle(path, handler)
	}

	oidcHandlers := auth.NewHandlerHttp(a.Auth)
	if a.Config.Auth.EnableOidc {
		mux.HandleFunc("GET /auth/login/oidc", oidcHandlers.OIDCLogin)
		mux.HandleFunc("GET /auth/login/oidc/callback", oidcHandlers.OIDCCallback)
	}

	var execHandler http.Handler = docker.NewExecWSHandler(a.DockerManager.GetService)
	var logHandler http.Handler = docker.NewLogWSHandler(a.DockerManager.GetService)
	if a.Config.Auth.Enable {
		authMiddleware := auth.NewHttpAuthMiddleware(a.Auth)
		execHandler = authMiddleware(execHandler)
		logHandler = authMiddleware(logHandler)
	}

	mux.Handle("GET /docker/exec/{contID}", execHandler)
	mux.Handle("GET /docker/logs/{contID}", logHandler)
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
