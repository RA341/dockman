package ui

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

// SpaHandler implements the http.Handler interface and serves a single-page
// application. If a requested file is not found, it serves the 'index.html'
// file, allowing client-side routing to take over.
type SpaHandler struct {
	staticFS   fs.FS
	fileServer http.Handler
}

// NewSpaHandler creates a new handler for serving a single-page application.
// see SpaHandler for info
func NewSpaHandler(staticFS fs.FS) http.Handler {
	return &SpaHandler{
		staticFS:   staticFS,
		fileServer: http.FileServer(http.FS(staticFS)),
	}
}

func (h *SpaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	reqPath := path.Clean(r.URL.Path)
	fsPath := strings.TrimPrefix(reqPath, "/")

	// Check if the file exists in the filesystem.
	if _, err := fs.Stat(h.staticFS, fsPath); os.IsNotExist(err) {
		// The file does not exist, so serve index.html.
		// Embedded files carry no modification time, so without an explicit
		// policy browsers cache the app shell heuristically and keep
		// launching an old bundle long after the server was updated —
		// index.html must be revalidated on every load.
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFileFS(w, r, h.staticFS, "index.html")
		return
	}

	// Vite content-hashes everything under assets/, safe to cache forever;
	// the entry files (index.html, favicon...) must always be revalidated.
	if strings.HasPrefix(fsPath, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}

	h.fileServer.ServeHTTP(w, r)
}
