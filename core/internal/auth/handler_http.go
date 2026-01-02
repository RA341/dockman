package auth

import (
	"fmt"
	"net/http"

	"github.com/RA341/dockman/internal/info"
	"github.com/google/uuid"
)

type HandlerHttp struct {
	srv *Service
}

func NewHandlerHttp(srv *Service) http.Handler {
	hand := &HandlerHttp{srv: srv}

	subMux := http.NewServeMux()
	subMux.HandleFunc("GET /oidc", hand.OIDCLogin)
	subMux.HandleFunc("GET /oidc/callback", hand.OIDCCallback)

	return subMux
}

// OIDCLogin GET /auth/login/google
func (h *HandlerHttp) OIDCLogin(w http.ResponseWriter, r *http.Request) {
	state := uuid.New().String()
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_state",
		Value:    state,
		Path:     "/",
		MaxAge:   300,
		HttpOnly: true,
		Secure:   !info.IsDev(),
		SameSite: http.SameSiteLaxMode,
	})

	url := h.srv.GetOIDCLoginURL(state)

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

	cookie, err := r.Cookie("oidc_state")
	if err != nil {
		http.Error(w, "State cookie missing", http.StatusBadRequest)
		return
	}

	returnedState := query.Get("state")
	if returnedState == "" || returnedState != cookie.Value {
		http.Error(w, "Invalid state parameter (CSRF detected)", http.StatusUnauthorized)
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
