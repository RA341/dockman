package host

import "net/http"

func HttpMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := setHost(r.Context(), r.Header)
		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)
	})
}
