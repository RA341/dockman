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
		ok := CheckAuth(w, r, service)
		if !ok {
			return
		}
		next.ServeHTTP(w, r)
	})
}

func CheckAuth(w http.ResponseWriter, r *http.Request, srv *Service) (ok bool) {
	u, err := verifyCookie(r.Cookies(), srv)
	if err == nil {
		r.WithContext(context.WithValue(
			r.Context(),
			KeyUserCtx, u,
		))
		return true
	}

	if srv.config.EnableOidc {
		// IMPORTANT BEFORE CHANGING THE STATUS CODE HERE
		// update the code here as well: ui/src/lib/api.ts:82
		w.WriteHeader(http.StatusFound)
		oidcPage := "/api/auth/login/oidc"
		_, err = w.Write([]byte(oidcPage))
		if err != nil {
			log.Warn().Err(err).Msg("Failed to write response")
		}
		return false
	}

	http.Error(w, err.Error(), http.StatusUnauthorized)
	return false
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
