package app

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"

	authrpc "github.com/RA341/dockman/generated/auth/v1/v1connect"
	cleanerrpc "github.com/RA341/dockman/generated/cleaner/v1/v1connect"
	configrpc "github.com/RA341/dockman/generated/config/v1/v1connect"
	dockerpc "github.com/RA341/dockman/generated/docker/v1/v1connect"
	dockyamlrpc "github.com/RA341/dockman/generated/dockyaml/v1/v1connect"
	filesrpc "github.com/RA341/dockman/generated/files/v1/v1connect"
	hostrpc "github.com/RA341/dockman/generated/host/v1/v1connect"
	inforpc "github.com/RA341/dockman/generated/info/v1/v1connect"
	viewerrpc "github.com/RA341/dockman/generated/viewer/v1/v1connect"

	mid "github.com/RA341/dockman/internal/app/middleware"
	"github.com/RA341/dockman/internal/app/ui"
	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/cleaner"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/database"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/dockyaml"
	"github.com/RA341/dockman/internal/files"
	"github.com/RA341/dockman/internal/host"
	hostMid "github.com/RA341/dockman/internal/host/middleware"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/internal/viewer"
	"github.com/RA341/dockman/pkg/argos"

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
	DockYaml      *dockyaml.Service
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
	var err error

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

	setupComposeRoot(conf.ComposeRoot)

	// docker manager setup
	sshDb := ssh.NewGormKeyManager(gormDB)
	machDb := ssh.NewGormMachineManger(gormDB)
	sshSrv := ssh.NewService(sshDb, machDb)

	store := dockyaml.NewStore(filepath.Join(conf.ConfigDir, "dockyaml"))
	dockyamlSrv := dockyaml.New(store)

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
		hostManager.GetAlias,
		&conf.Perms,
		dockyamlSrv.GetYaml,
	)

	//err := git.NewMigrator(composeRoot)
	//if err != nil {
	//	log.Fatal().Err(err).Msg("unable to complete git migration")
	//}

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
		&conf.Viewer,
	)

	app = &App{
		Config:        conf,
		Auth:          authSrv,
		File:          fileSrv,
		HostManager:   hostManager,
		Info:          infoSrv,
		DockYaml:      dockyamlSrv,
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

//type connectHandler func() (string, http.Handler)
//
//type Middleware func(http.Handler) http.Handler
//
//func (a *App) registerHttpHandler(basePath string, subMux http.Handler, middleware ...Middleware) (string, http.Handler) {
//	if !strings.HasSuffix(basePath, "/") {
//		basePath = basePath + "/"
//	}
//
//	baseHandler := http.StripPrefix(strings.TrimSuffix(basePath, "/"), subMux)
//
//	if a.Config.Auth.Enable {
//		httpAuth := auth.NewHttpAuthMiddleware(a.Auth)
//		baseHandler = httpAuth(baseHandler)
//	}
//
//	for _, mid := range middleware {
//		baseHandler = mid(baseHandler)
//	}
//
//	return basePath, baseHandler
//}

/*
Registers all routes required by dockman with the following hierarchy

	/ <- UI files
	/api
	|-----/ <- public endpoints
	|-----/auth <- auth endpoints
	|-----/protec <- protected paths
	|-----|-----/ 	     <- normal endpoints
	|-----|-----/:host/* <- endpoints require hosts info
*/
func (a *App) registerRoutes(mux *http.ServeMux) {
	// /api
	apiRouter := http.NewServeMux()
	a.registerApiRoutes(apiRouter)
	withSubRouter(mux, "/api", a.withLogger(apiRouter))

	// / UI (Catch-all)
	a.registerFrontend(mux)
}

func (a *App) registerFrontend(router *http.ServeMux) {
	var uiHandler http.Handler

	if a.Config.UIFS == nil {
		log.Warn().Msg("no ui files found, setting default page")
		uiHandler = ui.NewDefaultUIHandler()
	} else {
		uiHandler = ui.NewSpaHandler(a.Config.UIFS)
	}

	router.Handle("/", mid.GzipMiddleware(uiHandler))
}

func (a *App) registerApiAuthRoutes(authRouter *http.ServeMux) {
	if !a.Config.Auth.Enable {
		return
	}

	authRouter.Handle(
		authrpc.NewAuthServiceHandler(
			auth.NewConnectHandler(a.Auth),
		),
	)

	if a.Config.Auth.OIDCEnable {
		withSubRouter(
			authRouter,
			"/login",
			auth.NewHandlerHttp(a.Auth),
		)
	}
}

func (a *App) registerApiRoutes(publicApiMux *http.ServeMux) {
	publicApiMux.HandleFunc(
		"/hola",
		func(writer http.ResponseWriter, request *http.Request) {
			_, err := writer.Write([]byte("Fuck you"))
			if err != nil {
				return
			}
		},
	)

	// /auth
	authRouter := http.NewServeMux()
	a.registerApiAuthRoutes(authRouter)
	withSubRouter(publicApiMux, "/auth", authRouter)

	protectedApiMux := http.NewServeMux()
	a.registerApiProtectedRoutes(protectedApiMux)

	withSubRouter(
		publicApiMux,
		"/protected",
		a.withAuth(protectedApiMux),
	)
}

// /api/protected
func (a *App) registerApiProtectedRoutes(protectedApiMux *http.ServeMux) {
	// penger
	protectedApiMux.HandleFunc(
		"/ping",
		func(w http.ResponseWriter, r *http.Request) {
			_, err := w.Write([]byte("pong"))
			if err != nil {
				log.Warn().Err(err).Msg("unable to write pong")
				return
			}
		},
	)

	// info
	protectedApiMux.Handle(
		inforpc.NewInfoServiceHandler(
			info.NewConnectHandler(a.Info),
		),
	)
	// user config
	protectedApiMux.Handle(
		configrpc.NewConfigServiceHandler(
			config.NewConnectHandler(a.UserConfigSrv),
		),
	)
	// host manager
	protectedApiMux.Handle(
		hostrpc.NewHostManagerServiceHandler(
			host.NewHandler(a.HostManager),
		),
	)

	// viewer http doesnt need hosts uses uuid
	withSubRouter(
		protectedApiMux,
		"/viewer",
		viewer.NewHandlerHttp(a.Viewer),
	)

	// /:host
	// Host-specific sub-router
	hostMux := http.NewServeMux()
	a.registerApiHostRoutes(hostMux)
	protectedApiMux.Handle(
		"/{host}/",
		a.HostPathMiddleware(hostMux),
	)
}

func withSubRouter(parent *http.ServeMux, path string, child http.Handler) {
	if strings.HasSuffix(path, "/") {
		panic(fmt.Sprintf("path must not end with /: %s", path))
	}

	basepath := path + "/"
	parent.Handle(
		basepath,
		http.StripPrefix(path, child),
	)
}

// /api/protected/:host
func (a *App) registerApiHostRoutes(hostMux *http.ServeMux) {
	// dockyaml
	hostMux.Handle(
		dockyamlrpc.NewDockyamlServiceHandler(
			dockyaml.NewHandler(a.DockYaml),
		),
	)

	// files
	hostMux.Handle(
		filesrpc.NewFileServiceHandler(
			files.NewConnectHandler(a.File),
		),
	)
	// files http handlers
	hostMux.Handle(
		"/file/",
		http.StripPrefix("/file",
			files.NewFileHandler(a.File),
		),
	)
	// docker
	hostMux.Handle(
		dockerpc.NewDockerServiceHandler(
			docker.NewConnectHandler(
				a.HostManager.GetDockerService,
			),
		),
	)
	// docker http
	withSubRouter(
		hostMux,
		"/docker",
		docker.NewHandlerHttp(a.HostManager.GetDockerService),
	)
	// cleaner
	hostMux.Handle(
		cleanerrpc.NewCleanerServiceHandler(
			cleaner.NewHandler(a.CleanerSrv),
		),
	)
	// viewer
	hostMux.Handle(
		viewerrpc.NewViewerServiceHandler(
			viewer.NewHandler(a.Viewer),
		),
	)

}

func (a *App) HostPathMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hostname := r.PathValue("host")
		if hostname == "" {
			http.Error(w, "Hostname is missing: "+r.URL.String(), http.StatusBadRequest)
			return
		}

		hostCtx := hostMid.SetHost(
			r.Context(),
			hostname,
		)

		// Strip the dynamic prefix
		// Eg: /server-1/files.FileService/GetFile
		// Becomes: /files.FileService/GetFile
		prefix := "/" + hostname
		strippedHandler := http.StripPrefix(prefix, next)
		strippedHandler.ServeHTTP(w, r.WithContext(hostCtx))
	})
}

func (a *App) withLogger(mux http.Handler) http.Handler {
	var apiHandler = mux
	if a.Config.Log.HttpLogger {
		apiHandler = mid.LoggingMiddleware(apiHandler)
	}
	return apiHandler
}

func (a *App) withAuth(mux http.Handler) http.Handler {
	if !a.Config.Auth.Enable {
		if !info.IsDev() {
			printAuthWarning()
		}

		return mux
	}
	return auth.Middleware(a.Auth, mux)
}

// visualWidth calculates the length of the string without ANSI color codes
func visualWidth(s string) int {
	re := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	plain := re.ReplaceAllString(s, "")
	return len(plain)
}

func printAuthWarning() {
	boxWidth := 50

	// List of message lines
	messages := []string{
		argos.Colorize("Warning: Authentication Disabled", argos.ColorYellow),
		argos.Colorize("Running without auth is fine for testing", argos.ColorCyan),
		argos.Colorize("but you should enable it before exposing Dockman", argos.ColorCyan),
		argos.Colorize("to a network or using it regularly.", argos.ColorCyan),
		"",
		argos.Colorize("Why this matters:", argos.ColorYellow),
		argos.Colorize("Dockman has root-level access to manage", argos.ColorCyan),
		argos.Colorize("Docker containers and system resources.", argos.ColorCyan),
		"",
		argos.Colorize("Guide:", argos.ColorYellow),
		argos.Colorize("https://dockman.radn.dev/docs/authentication/", argos.ColorGreen),
	}

	var sb strings.Builder
	topBorder := argos.Colorize("╔"+strings.Repeat("═", boxWidth+4)+"╗", argos.ColorRed)
	bottomBorder := argos.Colorize("╚"+strings.Repeat("═", boxWidth+4)+"╝", argos.ColorRed)
	emptyLine := argos.Colorize("║"+argos.ColorReset+strings.Repeat(" ", boxWidth+4)+argos.ColorRed+"║", argos.ColorRed)

	sb.WriteString("\n" + topBorder + "\n")
	sb.WriteString(emptyLine + "\n")

	for _, msg := range messages {
		if msg == "" {
			sb.WriteString(emptyLine + "\n")
			continue
		}

		// Calculate padding
		contentWidth := visualWidth(msg)
		padding := boxWidth - contentWidth
		if padding < 0 {
			padding = 0
		}

		// Border + 2 space margin + Text + Remaining Padding + Border
		sb.WriteString(argos.Colorize("║", argos.ColorRed))
		sb.WriteString("  " + msg + strings.Repeat(" ", padding+2))
		sb.WriteString(argos.Colorize("║"+argos.ColorReset+"\n", argos.ColorRed))
	}

	sb.WriteString(emptyLine + "\n")
	sb.WriteString(bottomBorder + "\n\n")

	fmt.Print(sb.String())
}
