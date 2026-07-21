package auth

import (
	"context"
	"fmt"
	"net/http"

	"github.com/rs/zerolog/log"
)

const CookieHeaderAuth = "Authorization"
const CookieHeaderSessionId = "SessionId"
const KeyUserCtx = "user"

func Middleware(service *Service, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r, ok := CheckAuth(w, r, service)
		if !ok {
			return
		}
		next.ServeHTTP(w, r)
	})
}

const oidcPage = "/api/auth/login/oidc"

// CheckAuth verifies the request's auth cookie. On success it returns a request
// whose context carries the authenticated user (under KeyUserCtx) together with
// ok=true; callers must forward the returned request downstream. On failure it
// writes the appropriate response and returns ok=false.
func CheckAuth(w http.ResponseWriter, r *http.Request, srv *Service) (*http.Request, bool) {
	u, err := verifyCookie(r.Cookies(), srv)
	if err == nil {
		// http.Request.WithContext returns a shallow copy; we must return it so
		// the enriched context actually reaches the downstream handler.
		r = r.WithContext(context.WithValue(
			r.Context(),
			KeyUserCtx, u,
		))
		return r, true
	}

	if srv.config.OIDCEnable && srv.config.OIDCAutoRedirect {
		// IMPORTANT BEFORE CHANGING THE STATUS CODE HERE
		// update the code here as well: ui/src/lib/api.ts:82
		w.WriteHeader(http.StatusFound)
		_, err = w.Write([]byte(oidcPage))
		if err != nil {
			log.Warn().Err(err).Msg("Failed to write response")
		}
		return r, false
	}

	http.Error(w, err.Error(), http.StatusUnauthorized)
	return r, false
}

func getCookie(cookieName string, cookies []*http.Cookie) (*http.Cookie, error) {
	if cookieName == "" {
		return nil, http.ErrNoCookie
	}

	for _, c := range cookies {
		if c.Name == cookieName {
			return c, nil
		}
	}

	return nil, http.ErrNoCookie
}

func verifyCookie(cookies []*http.Cookie, srv *Service) (*User, error) {
	cookie, err := getCookie(CookieHeaderAuth, cookies)
	if err != nil {
		return nil, err
	}

	token := cookie.Value
	userInfo, err := srv.VerifyToken(token)
	if err != nil {
		log.Error().Err(err).Msg("Unable to verify token")
		return nil, fmt.Errorf("unable to verify token")
	}

	return userInfo, nil
}
