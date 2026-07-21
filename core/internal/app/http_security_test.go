package app

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/RA341/dockman/internal/config"
)

func TestOriginPolicy(t *testing.T) {
	conf := &config.AppConfig{AllowedOrigins: "https://admin.example"}
	handler := enforceOriginPolicy(conf, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	tests := []struct {
		name   string
		host   string
		origin string
		want   int
	}{
		{"non browser", "dockman.local", "", http.StatusNoContent},
		{"same origin", "dockman.local:8866", "http://dockman.local:8866", http.StatusNoContent},
		{"configured reverse proxy", "dockman.internal:8866", "https://admin.example", http.StatusNoContent},
		{"foreign browser", "dockman.local:8866", "https://evil.example", http.StatusForbidden},
		{"opaque browser", "dockman.local:8866", "null", http.StatusForbidden},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "http://"+test.host+"/api/protected/ping", nil)
			req.Host = test.host
			if test.origin != "" {
				req.Header.Set("Origin", test.origin)
			}
			res := httptest.NewRecorder()
			handler.ServeHTTP(res, req)
			if res.Code != test.want {
				t.Fatalf("status = %d, want %d", res.Code, test.want)
			}
		})
	}
}

func TestRequestBodyLimitsUseLargerFileAllowance(t *testing.T) {
	conf := &config.AppConfig{HTTPMaxBodyMB: 1, HTTPMaxUploadMB: 2}
	handler := limitRequestBodies(conf, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.Copy(io.Discard, r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	body := strings.Repeat("x", bytesPerMiB+1)

	regular := httptest.NewRequest(http.MethodPost, "http://dockman/api/protected/rpc", strings.NewReader(body))
	regularRes := httptest.NewRecorder()
	handler.ServeHTTP(regularRes, regular)
	if regularRes.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("regular body status = %d, want %d", regularRes.Code, http.StatusRequestEntityTooLarge)
	}

	upload := httptest.NewRequest(http.MethodPost, "http://dockman/api/protected/local/file/save", strings.NewReader(body))
	uploadRes := httptest.NewRecorder()
	handler.ServeHTTP(uploadRes, upload)
	if uploadRes.Code != http.StatusNoContent {
		t.Fatalf("upload body status = %d, want %d", uploadRes.Code, http.StatusNoContent)
	}
}
