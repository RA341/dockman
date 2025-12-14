package viewer

import (
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"path/filepath"
	"strings"
	"time"
)

type HandlerHttp struct {
	srv *Service
}

func NewHandlerHttp(service *Service) http.Handler {
	hand := &HandlerHttp{srv: service}
	return hand.register()
}

func (h *HandlerHttp) register() http.Handler {
	subMux := http.NewServeMux()
	subMux.HandleFunc("/api/viewer/view/", h.proxySession)

	return subMux
}

func (h *HandlerHttp) proxySession(w http.ResponseWriter, r *http.Request) {
	// 1. Force Trailing Slash
	// sqlite-web fails if the url doesn't end in a slash (it triggers a redirect loop)
	if !strings.HasSuffix(r.URL.Path, "/") && !strings.Contains(filepath.Base(r.URL.Path), ".") {
		http.Redirect(w, r, r.URL.Path+"/", http.StatusTemporaryRedirect)
		return
	}

	// 2. Parse ID from full path: /api/viewer/view/<id>/...
	parts := strings.Split(r.URL.Path, "/")
	// ["", "api", "viewer", "view", "db-123", ...]
	// Index: 0    1       2       3       4
	if len(parts) < 5 {
		http.Error(w, "Invalid path", 404)
		return
	}
	sessionID := parts[4]

	targetAddr, exists := h.srv.sessions.Load(sessionID)
	if !exists {
		http.Error(w, "Session expired", 404)
		return
	}

	targetURL, err := url.Parse("http://" + targetAddr)
	if err != nil {
		http.Error(w, "Invalid URL: "+err.Error(), 400)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// 3. Ensure the Host header matches the container (not localhost:3000)
	// and PRESERVE the path.
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = targetURL.Host
		// We do NOT touch req.URL.Path. It is already "/api/viewer/view/..."
		// which matches what we passed to --url-prefix in Docker.
	}

	proxy.FlushInterval = 100 * time.Millisecond
	proxy.ServeHTTP(w, r)
}

func waitForPort(addr string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if err == nil {
			conn.Close()
			return true
		}
		time.Sleep(200 * time.Millisecond)
	}
	return false
}
