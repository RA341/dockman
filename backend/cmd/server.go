package cmd

import (
	connectcors "connectrpc.com/cors"
	"embed"
	"fmt"
	"github.com/RA341/dockman/pkg"
	"github.com/rs/cors"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

func StartServer(opts ...ServerOpt) {
	config := parseConfig(opts...)

	router := http.NewServeMux()

	app, err := NewApp(config)
	if err != nil {
		log.Fatal().Err(err).Msg("failed setting up app")
	}
	defer pkg.CloseFile(app)

	app.registerRoutes(router)
	router.Handle("/", newSpaHandler(config.uiFS))

	middleware := cors.New(cors.Options{
		AllowedOrigins:      config.AllowedOrigins,
		AllowPrivateNetwork: true,
		AllowedMethods:      connectcors.AllowedMethods(),
		AllowedHeaders:      append(connectcors.AllowedHeaders(), "Authorization"),
		ExposedHeaders:      connectcors.ExposedHeaders(),
	})
	finalMux := middleware.Handler(router)

	log.Info().Int("port", config.Port).Msg("Starting server...")
	err = http.ListenAndServe(
		fmt.Sprintf(":%d", config.Port),
		h2c.NewHandler(finalMux, &http2.Server{}),
	)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to start server")
	}
}

// SpaHandler implements the http.Handler interface and serves a single-page
// application. If a requested file is not found, it serves the 'index.html'
// file, allowing client-side routing to take over.
type SpaHandler struct {
	staticFS   fs.FS
	fileServer http.Handler
}

func (h *SpaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	reqPath := path.Clean(r.URL.Path)
	fsPath := strings.TrimPrefix(reqPath, "/")

	// Check if the file exists in the filesystem.
	if _, err := fs.Stat(h.staticFS, fsPath); os.IsNotExist(err) {
		// The file does not exist, so serve index.html.
		http.ServeFileFS(w, r, h.staticFS, "index.html")
		return
	}

	h.fileServer.ServeHTTP(w, r)
}

// newSpaHandler creates a new handler for serving a single-page application.
// see SpaHandler for info
func newSpaHandler(staticFS fs.FS) http.Handler {
	return &SpaHandler{
		staticFS:   staticFS,
		fileServer: http.FileServer(http.FS(staticFS)),
	}
}

func LoadFileUI(path string) fs.FS {
	root, err := os.OpenRoot(path)
	if err != nil {
		log.Fatal().Err(err).Str("path", path).Msg("failed to open file for UI")
	}

	return root.FS()
}

func LoadEmbeddedUI(uiFs embed.FS) fs.FS {
	log.Debug().Msg("Loading frontend from embedded FS")

	subFS, err := fs.Sub(uiFs, "dist")
	if err != nil {
		log.Fatal().Err(err).Msg("failed to setup frontend fs")
	}

	return subFS
}
