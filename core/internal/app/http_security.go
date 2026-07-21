package app

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/RA341/dockman/internal/config"
)

const bytesPerMiB = 1024 * 1024

func enforceOriginPolicy(conf *config.AppConfig, next http.Handler) http.Handler {
	allowed := make(map[string]struct{})
	allowAll := false
	for _, origin := range conf.GetAllowedOrigins() {
		if origin == "*" {
			allowAll = true
			continue
		}
		allowed[origin] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSuffix(strings.TrimSpace(r.Header.Get("Origin")), "/")
		if origin == "" || allowAll || requestIsSameOrigin(r, origin) {
			next.ServeHTTP(w, r)
			return
		}
		if _, ok := allowed[origin]; ok {
			next.ServeHTTP(w, r)
			return
		}
		http.Error(w, "browser origin is not allowed", http.StatusForbidden)
	})
}

func requestIsSameOrigin(r *http.Request, origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}
	return strings.EqualFold(parsed.Host, r.Host)
}

func limitRequestBodies(conf *config.AppConfig, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limitMB := conf.HTTPMaxBodyMB
		if strings.HasSuffix(r.URL.Path, "/file/save") || (strings.Contains(r.URL.Path, "/docker/files/") && strings.HasSuffix(r.URL.Path, "/upload")) {
			limitMB = conf.HTTPMaxUploadMB
		}
		if limitMB <= 0 || r.Body == nil {
			next.ServeHTTP(w, r)
			return
		}

		limit := int64(limitMB) * bytesPerMiB
		if r.ContentLength > limit {
			http.Error(w, fmt.Sprintf("request body exceeds the %d MiB limit", limitMB), http.StatusRequestEntityTooLarge)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}
