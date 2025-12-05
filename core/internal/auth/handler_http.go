package auth

import (
	"fmt"
	"net/http"
)

// TODO use a random string and store it in a secure cookie to verify later
const csrfState = "random-state-to-protect-against-csrf"

type HandlerHttp struct {
	srv *Service
}

func NewHandlerHttp(srv *Service) *HandlerHttp {
	return &HandlerHttp{srv: srv}
}

// OIDCLogin GET /auth/login/google
func (h *HandlerHttp) OIDCLogin(w http.ResponseWriter, r *http.Request) {
	url := h.srv.GetOIDCLoginURL(csrfState)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// OIDCCallback GET /auth/callback
func (h *HandlerHttp) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	oidcErr := query.Get("error")
	if oidcErr != "" {
		mess := fmt.Sprintf("error: %s, desc: %s", oidcErr, query.Get("error_description"))
		http.Error(w, mess, http.StatusUnauthorized)
		return
	}

	state := query.Get("state")
	if state != csrfState {
		http.Error(w, "error: Invalid state parameter", http.StatusUnauthorized)
		return
	}

	code := query.Get("code")
	ctx := r.Context()

	session, token, err := h.srv.OIDCCallback(ctx, code)
	if err != nil {
		http.Error(
			w,
			fmt.Sprintf("error Failed to verify OIDC token details %s", err.Error()),
			http.StatusInternalServerError,
		)
		return
	}

	cookies := createAuthCookies(token, session.ID, session.Expires)
	for _, cookie := range cookies {
		http.SetCookie(w, &cookie)
	}

	http.Redirect(w, r, "/", http.StatusPermanentRedirect)
}
