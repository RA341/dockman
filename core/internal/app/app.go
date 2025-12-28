package app

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"connectrpc.com/connect"
	authrpc "github.com/RA341/dockman/generated/auth/v1/v1connect"
	"github.com/RA341/dockman/generated/cleaner/v1/v1connect"
	configrpc "github.com/RA341/dockman/generated/config/v1/v1connect"
	dockerpc "github.com/RA341/dockman/generated/docker/v1/v1connect"
	hostrpc "github.com/RA341/dockman/generated/host/v1/v1connect"

	filesrpc "github.com/RA341/dockman/generated/files/v1/v1connect"
	inforpc "github.com/RA341/dockman/generated/info/v1/v1connect"
	viewerrpc "github.com/RA341/dockman/generated/viewer/v1/v1connect"
	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/cleaner"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/database"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/files"
	dockmanYaml "github.com/RA341/dockman/internal/files/dockman_yaml"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/internal/host"
	hm "github.com/RA341/dockman/internal/host/middleware"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/internal/viewer"
	"github.com/rs/zerolog/log"
)

type App struct {
	Config *config.AppConfig

	Auth          *auth.Service
	HostManager   *host.Service
	File          *files.Service
	Info          *info.Service
	SSH           *ssh.Service
	UserConfigSrv *config.Service
	CleanerSrv    *cleaner.Service
	Viewer        *viewer.Service
}

func (a *App) VerifyServices() error {
	val := reflect.ValueOf(a).Elem()
	typ := val.Type()

	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		fieldName := typ.Field(i).Name

		// We only care about pointers (services)
		if field.Kind() == reflect.Ptr && field.IsNil() {
			return fmt.Errorf("critical error: service '%s' was not initialized", fieldName)
		}
	}
	return nil
}

func NewApp(conf *config.AppConfig) (app *App) {
	// db and info setup
	gormDB := database.New(conf.ConfigDir, info.IsDev())
	userDb := config.NewUserConfigDB(gormDB)
	infoDb := info.NewVersionHistoryManager(gormDB)
	infoSrv := info.NewService(infoDb)

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

	composeRoot := setupComposeRoot(conf.ComposeRoot)

	// docker manager setup
	sshDb := ssh.NewGormKeyManager(gormDB)
	machDb := ssh.NewGormMachineManger(gormDB)
	sshSrv := ssh.NewService(sshDb, machDb)
	dockYamlSrv := dockmanYaml.NewDockmanYaml(conf.DockYaml, func() string {
		// todo host aware
		return conf.ComposeRoot
	})

	aliasStore := host.NewAliasStore(gormDB)
	hostStore := host.NewStore(gormDB)
	hostManager := host.NewService(
		hostStore,
		aliasStore,
		sshSrv,
		conf.ComposeRoot,
		conf.LocalAddr,
	)

	fileSrv := files.New(
		hostManager.GetFileSystem,
		dockYamlSrv,
		&conf.Perms,
	)

	err := git.NewMigrator(composeRoot)
	if err != nil {
		log.Fatal().Err(err).Msg("unable to complete git migration")
	}

	userConfigSrv := config.NewService(
		userDb,
		func() {},
	)

	cleanerStore := cleaner.NewStore(gormDB)
	cleanerSrv := cleaner.NewService(
		hostManager.GetDockerService,
		cleanerStore,
	)

	viewerSrv := viewer.New(
		hostManager.GetDockerService,
		func(input, host string) (root string, relpath string, err error) {
			fs, relpath, err := fileSrv.LoadAll(input, host)
			if err != nil {
				return "", "", err
			}

			join := filepath.Join(fs.Root(), relpath)
			return join, relpath, nil
		},
		hostManager.GetSSH,
	)

	app = &App{
		Config:        conf,
		Auth:          authSrv,
		File:          fileSrv,
		HostManager:   hostManager,
		Info:          infoSrv,
		SSH:           sshSrv,
		UserConfigSrv: userConfigSrv,
		CleanerSrv:    cleanerSrv,
		Viewer:        viewerSrv,
	}
	err = app.VerifyServices()
	if err != nil {
		log.Fatal().Err(err).Msg("error occurred while verifying services")
	}

	log.Info().Msg("Dockman initialized successfully")
	return app
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
	interceptors := connect.WithInterceptors()
	if a.Config.Auth.Enable {
		interceptors = connect.WithInterceptors(auth.NewInterceptor(a.Auth))

	}

	hostInterceptor := connect.WithInterceptors(hm.NewHostInterceptor())

	handlers := []func() (string, http.Handler){
		// auth
		func() (string, http.Handler) {
			return authrpc.NewAuthServiceHandler(auth.NewConnectHandler(a.Auth))
		},
		// info
		func() (string, http.Handler) {
			return inforpc.NewInfoServiceHandler(
				info.NewConnectHandler(a.Info),
				interceptors,
			)
		},
		// user config
		func() (string, http.Handler) {
			return configrpc.NewConfigServiceHandler(
				config.NewConnectHandler(a.UserConfigSrv),
				interceptors,
			)
		},
		// host_manager
		func() (string, http.Handler) {
			return hostrpc.NewHostManagerServiceHandler(
				host.NewHandler(a.HostManager),
				interceptors,
			)
		},
		// files
		func() (string, http.Handler) {
			return filesrpc.NewFileServiceHandler(
				files.NewConnectHandler(a.File),
				interceptors,
				hostInterceptor,
			)
		},
		// files http
		func() (string, http.Handler) {
			return a.registerHttpHandler(
				"/api/file",
				files.NewFileHandler(a.File),
				hm.HttpMiddleware,
			)
		},
		// docker
		func() (string, http.Handler) {
			return dockerpc.NewDockerServiceHandler(
				docker.NewConnectHandler(a.HostManager.GetDockerService),
				interceptors,
				hostInterceptor,
			)
		},
		// docker http
		func() (string, http.Handler) {
			return a.registerHttpHandler(
				"/api/docker",
				docker.NewHandlerHttp(a.HostManager.GetDockerService),
				hm.HttpMiddleware,
			)
		},
		// cleaner
		func() (string, http.Handler) {
			return v1connect.NewCleanerServiceHandler(
				cleaner.NewHandler(a.CleanerSrv),
				interceptors,
				hostInterceptor,
			)
		},
		// git
		//func() (string, http.Handler) {
		//	return gitrpc.NewGitServiceHandler(git.NewConnectHandler(a.Git), authInterceptor)
		//},
		//func() (string, http.Handler) {
		//	return a.registerHttpHandler("/api/git", git.NewFileHandler(a.Git))
		//},
		// auth shit
		func() (string, http.Handler) {
			return a.registerHttpHandler("/auth/ping", http.HandlerFunc(
				func(w http.ResponseWriter, r *http.Request) {
					if _, err := w.Write([]byte("pong")); err != nil {
						return
					}
				}),
			)
		},
		func() (string, http.Handler) {
			return viewerrpc.NewViewerServiceHandler(
				viewer.NewHandler(a.Viewer),
				interceptors,
				hostInterceptor,
			)
		},
		func() (string, http.Handler) {
			basePath := "/api/viewer/"
			handler := viewer.NewHandlerHttp(a.Viewer)
			if a.Config.Auth.Enable {
				authMiddleware := auth.NewHttpAuthMiddleware(a.Auth)
				handler = authMiddleware(handler)
			}
			// we need this because the reverse proxy expects a full path
			// The router will match "/api/viewer/" and pass the full path to the handler
			return basePath, handler
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
}

type Middleware func(http.Handler) http.Handler

func (a *App) registerHttpHandler(basePath string, subMux http.Handler, middleware ...Middleware) (string, http.Handler) {
	if !strings.HasSuffix(basePath, "/") {
		basePath = basePath + "/"
	}

	baseHandler := http.StripPrefix(strings.TrimSuffix(basePath, "/"), subMux)
	if a.Config.Log.HttpLogger {
		var logger Middleware = func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				log.Debug().Str("url", r.URL.String()).Msg("path")
				next.ServeHTTP(w, r)
			})
		}
		baseHandler = logger(baseHandler)
	}

	if a.Config.Auth.Enable {
		httpAuth := auth.NewHttpAuthMiddleware(a.Auth)
		baseHandler = httpAuth(baseHandler)
	}

	for _, mid := range middleware {
		baseHandler = mid(baseHandler)
	}

	return basePath, baseHandler
}
