package app

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"connectrpc.com/connect"
	authrpc "github.com/RA341/dockman/generated/auth/v1/v1connect"
	"github.com/RA341/dockman/generated/cleaner/v1/v1connect"
	configrpc "github.com/RA341/dockman/generated/config/v1/v1connect"
	dockerpc "github.com/RA341/dockman/generated/docker/v1/v1connect"
	dockermanagerrpc "github.com/RA341/dockman/generated/docker_manager/v1/v1connect"
	filesrpc "github.com/RA341/dockman/generated/files/v1/v1connect"
	inforpc "github.com/RA341/dockman/generated/info/v1/v1connect"
	v1connect2 "github.com/RA341/dockman/generated/viewer/v1/v1connect"
	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/cleaner"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/database"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/docker/container"
	dm "github.com/RA341/dockman/internal/docker_manager"
	"github.com/RA341/dockman/internal/files"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/internal/viewer"
	"github.com/moby/moby/client"
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
	CleanerSrv    *cleaner.Service
	Viewer        *viewer.Service
}

func NewApp(conf *config.AppConfig) (app *App, err error) {
	// db and info setup
	gormDB, dbSrv := database.NewService(conf.ConfigDir)
	infoSrv := info.NewService(dbSrv.InfoDB)

	// auth setup
	sessionsDB := auth.NewSessionGormDB(gormDB, uint(conf.Auth.MaxSessions))
	authDB := auth.NewUserGormDB(gormDB)
	authSrv := auth.NewService(
		conf.Auth.Username,
		conf.Auth.Password,
		&conf.Auth,
		authDB,
		sessionsDB,
	)

	// docker manager setup
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

	composeRoot := setupComposeRoot(conf.ComposeRoot)
	composeRootProvider := func() string {
		mach := dockerManagerSrv.GetActiveClient()
		if mach == container.LocalClient {
			// return normal compose root for local client
			return composeRoot
		}
		return filepath.Join(composeRoot, git.DockmanRemoteFolder, mach)
	}

	fileStore := files.NewGormStore(gormDB)
	dockYamlSrv := files.NewDockmanYaml(conf.DockYaml, composeRootProvider)
	fileSrv := files.New(
		fileStore,
		composeRootProvider,
		dockYamlSrv,
		&conf.Perms,
	)

	err = git.NewMigrator(composeRoot)
	if err != nil {
		log.Fatal().Err(err).Msg("unable to complete git migration")
	}

	userConfigSrv := config.NewService(
		dbSrv.UserConfigDB,
		func() {
			// todo container updater
			//dockerManagerSrv.ResetContainerUpdater
		},
	)

	cleanerStore := cleaner.NewStore(gormDB)
	cleanerSrv := cleaner.NewService(
		func() *client.Client {
			// todo pass in and use service functions instead of direct client
			return dockerManagerSrv.GetService().Container.Client
		},
		func() string {
			return dockerManagerSrv.GetActiveClient()
		},
		cleanerStore,
	)

	viewerSrv := viewer.NewService(
		func() *client.Client {
			// todo pass in and use service functions instead of direct client
			return dockerManagerSrv.GetService().Container.Client
		},
		fileSrv.WithRoot,
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
		CleanerSrv:    cleanerSrv,
		Viewer:        viewerSrv,
	}, nil
}

func setupComposeRoot(composeRoot string) (cr string) {
	var err error
	if !filepath.IsAbs(composeRoot) {
		composeRoot, err = filepath.Abs(composeRoot)
		if err != nil {
			log.Fatal().
				Str("path", composeRoot).
				Msg("Err getting abs path for composeRoot")
		}
	}

	err = os.MkdirAll(composeRoot, 0755)
	if err != nil {
		log.Fatal().Err(err).
			Str("compose-root", composeRoot).
			Msg("failed to create compose root folder")
	}

	return composeRoot
}

func (a *App) registerApiRoutes(mux *http.ServeMux) {
	authInterceptor := connect.WithInterceptors()
	if a.Config.Auth.Enable {
		authInterceptor = connect.WithInterceptors(auth.NewInterceptor(a.Auth))
	}

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
			return v1connect.NewCleanerServiceHandler(cleaner.NewHandler(a.CleanerSrv))
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
		func() (string, http.Handler) {
			return v1connect2.NewViewerServiceHandler(viewer.NewHandler(a.Viewer))
		},
		func() (string, http.Handler) {
			// 1. Define the full base path
			basePath := "/api/viewer/"

			// 2. Create the handler (it now expects the full path)
			handler := viewer.NewHandlerHttp(a.Viewer)

			// 3. Manually apply Auth Middleware (since we aren't using registerHttpHandler)
			if a.Config.Auth.Enable {
				authMiddleware := auth.NewHttpAuthMiddleware(a.Auth)
				handler = authMiddleware(handler)
			}

			// 4. Return WITHOUT stripping prefix
			// The router will match "/api/viewer/" and pass the full path to the handler
			return basePath, handler
			//return a.registerHttpHandler("/api/viewer", viewer.NewHandlerHttp(a.Viewer))
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

func (a *App) Close() error {
	if err := a.File.Close(); err != nil {
		return fmt.Errorf("failed to close file service: %w", err)
	}

	if err := a.DB.Close(); err != nil {
		return fmt.Errorf("failed to close database service: %w", err)
	}

	return nil
}
