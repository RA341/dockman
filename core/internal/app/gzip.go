package app

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
)

// gzipResponseWriter wraps an http.ResponseWriter, compressing writes with gzip.
type gzipResponseWriter struct {
	io.Writer
	http.ResponseWriter
}

// Write compresses the data and writes it to the underlying ResponseWriter.
func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	return w.Writer.Write(b)
}

// GzipMiddleware wraps an http.Handler to provide Gzip compression.
func GzipMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Check if the client can accept Gzip encoding.
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			next.ServeHTTP(w, r)
			return
		}

		// Set the Content-Encoding header.
		w.Header().Set("Content-Encoding", "gzip")

		// Create a new gzip.Writer.
		gz := gzip.NewWriter(w)
		defer gz.Close()

		// Create a gzipResponseWriter.
		gzw := &gzipResponseWriter{Writer: gz, ResponseWriter: w}

		// Call the next handler.
		next.ServeHTTP(gzw, r)
	})
}
