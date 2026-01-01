package middleware

import (
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
)

func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subLog := log.With().
			Str("url", r.URL.String()).
			Str("method", r.Method).
			Logger()

		if r.Header.Get("Connect-Protocol-Version") != "" {
			subLog.Debug().Str("url", r.URL.String()).
				Msg("connect rpc")
			next.ServeHTTP(w, r)
			return
		}

		// WebSocket request, don't
		// wrap the writer to avoid hijacking errs
		if r.Header.Get("Upgrade") == "websocket" {
			subLog.Debug().Str("url", r.URL.String()).
				Msg("websocket connection")
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		//subLog.Debug().Msg("Started request")

		next.ServeHTTP(wrapped, r)

		subLog.Debug().
			//Int("status", wrapped.statusCode).
			Dur("elapsed", time.Since(start)).
			Msg("Completed request")
	})
}

type responseWriter struct {
	http.ResponseWriter
	http.Flusher
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Optional: If Write is called without calling WriteHeader,
// Go defaults to 200 OK. We should account for that.
func (rw *responseWriter) Write(b []byte) (int, error) {
	if rw.statusCode == 0 {
		rw.statusCode = http.StatusOK
	}
	return rw.ResponseWriter.Write(b)
}
