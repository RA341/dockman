package viewer

import (
	"context"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"github.com/rs/zerolog/log"
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
	subMux.HandleFunc("/view/{sessionId}/", h.proxySession)
	return subMux
}

func (h *HandlerHttp) proxySession(w http.ResponseWriter, r *http.Request) {
	sessionId := r.PathValue("sessionId")
	if sessionId == "" {
		http.Error(w, "sessionId not found", http.StatusBadRequest)
		return
	}

	session, exists := h.srv.sessions.Load(sessionId)
	if !exists {
		http.Error(w, "Session expired", 404)
		return
	}

	targetURL, err := url.Parse("http://" + session.addr)
	if err != nil {
		http.Error(w, "Invalid URL: "+err.Error(), 400)
		return
	}
	log.Debug().Str("url", targetURL.String()).
		Msg("Using the reverse proxy url")

	cli, err := h.srv.sshCli(session.host)
	if err != nil {
		http.Error(w, "Failed to connect: "+err.Error(), 500)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	if cli != nil {
		// set if an ssh session otherwise use local
		proxy.Transport = &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return cli.Dial(network, addr)
			},
		}
	}

	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = targetURL.Host

		// RESTORE THE PREFIX:
		// By the time the request hits this handler, middlewares have stripped:
		// /api, /protected, and /viewer.
		// req.URL.Path is currently: "/view/{sessionId}/..."
		// We must put the prefix back so it matches what sqlite-web expects.
		req.URL.Path = recreateViewerUrl(req.URL.Path)
		// If URL has encoded characters, also fix RawPath
		if req.URL.RawPath != "" {
			req.URL.Path = recreateViewerUrl(req.URL.RawPath)
		}

		log.Debug().Str("url", req.URL.Path).Str("raw", req.URL.RawPath).Msg("reverse proxy path")
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
