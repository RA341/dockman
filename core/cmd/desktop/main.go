package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time" // Added for startup delay

	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/pkg/argos"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed dist
var frontendDir embed.FS

func main() {
	// 1. FIX: Ensure we get the actual 'dist' folder for both Wails and the Backend
	subFS, err := fs.Sub(frontendDir, "dist")
	if err != nil {
		log.Fatal("Error loading frontend directory", err)
	}

	// ... Environment setup ...
	prefixer := argos.Prefixer(config.EnvPrefix)
	envMap := map[string]string{
		"LOG_LEVEL":    "debug",
		"LOG_VERBOSE":  "true",
		"CONFIG":       "./config",
		"COMPOSE_ROOT": "./compose",
		"GID":          "1000",
		"PUID":         "1000",
	}
	for k, v := range envMap {
		_ = os.Setenv(prefixer(k), v)
	}

	// Start Backend in Goroutine
	go func() {
		app.StartServer(
			config.WithUIFS(subFS),
		)
	}()

	// 2. Give the backend a moment to actually bind to port 8866
	// If Wails starts too fast, the proxy might hit "Connection Refused" immediately.
	time.Sleep(1 * time.Second)

	// --- PROXY SETUP ---
	target := "http://localhost:8866"
	targUr, _ := url.Parse(target)

	proxy := httputil.NewSingleHostReverseProxy(targUr)

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)

		// If left set, it causes errors when the client tries to reuse the request.
		req.RequestURI = ""
		// Set the Host so the backend thinks it's a local request
		req.Host = targUr.Host
		req.URL.Host = targUr.Host
		req.URL.Scheme = targUr.Scheme

		req.Header.Set("X-Forwarded-Proto", "http")
		req.Header.Del("Origin")
		req.Header.Del("Referer")
	}

	proxy.ModifyResponse = func(r *http.Response) error {
		if r.StatusCode >= 300 && r.StatusCode < 400 {
			fmt.Printf("[Proxy Redirect] %s -> %s\n", r.Request.URL.Path, r.Header.Get("Location"))
		} else {
			fmt.Printf("[Proxy] %s | Status: %s\n", r.Request.URL.Path, r.Status)
		}
		return nil
	}

	err = StartWails(subFS, proxy)
	if err != nil {
		log.Fatal("Error starting wails ", err)
	}
}

func StartWails(assets fs.FS, proxy *httputil.ReverseProxy) error {
	return wails.Run(&options.App{
		Debug: options.Debug{
			OpenInspectorOnStartup: true,
		},
		EnableDefaultContextMenu: true,
		Title:                    "Dockman Desktop",
		WindowStartState:         options.Minimised,
		Width:                    1920,
		Height:                   1080,

		AssetServer: &assetserver.Options{
			Assets: assets,
			Middleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if strings.HasPrefix(r.URL.Path, "/api") ||
						strings.HasPrefix(r.URL.Path, "/auth/ping") ||
						strings.Contains(r.URL.Path, ".v1.") {

						log.Println("proxying", r.Method, r.URL)

						// FIX: Remove Accept-Encoding so backend sends plain text (easier to debug)
						r.Header.Del("Accept-Encoding")

						proxy.ServeHTTP(w, r)
						return
					}

					log.Println("assets", r.Method, r.URL)
					next.ServeHTTP(w, r)
				})
			},
		},
	})
}
