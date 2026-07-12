package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// fakeSessionStore is a minimal SessionStore that returns a fixed session,
// letting us exercise the middleware without a database.
type fakeSessionStore struct {
	session Session
	err     error
}

func (f *fakeSessionStore) NewSession(*Session) error                 { return nil }
func (f *fakeSessionStore) DeleteSession(uint) error                  { return nil }
func (f *fakeSessionStore) GetSession(uint) (Session, error)          { return f.session, f.err }
func (f *fakeSessionStore) GetSessionByToken(string) (Session, error) { return f.session, f.err }

// TestMiddleware_PropagatesUserToContext guards against a regression where
// CheckAuth discarded the *http.Request returned by WithContext, so the
// authenticated user never reached downstream handlers.
func TestMiddleware_PropagatesUserToContext(t *testing.T) {
	want := User{Username: "alice"}
	srv := &Service{
		config: &Config{},
		sessionStore: &fakeSessionStore{
			session: Session{
				User:    want,
				Expires: time.Now().Add(time.Hour),
			},
		},
	}

	var got *User
	downstream := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		if u, ok := r.Context().Value(KeyUserCtx).(*User); ok {
			got = u
		}
	})

	req := httptest.NewRequest(http.MethodGet, "/api/protected/info", nil)
	req.AddCookie(&http.Cookie{Name: CookieHeaderAuth, Value: "any-token"})
	rec := httptest.NewRecorder()

	Middleware(srv, downstream).ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, got, "authenticated user must reach the downstream handler via context")
	require.Equal(t, want.Username, got.Username)
}

// TestMiddleware_RejectsMissingCookie ensures unauthenticated requests are
// stopped with 401 and never reach the downstream handler.
func TestMiddleware_RejectsMissingCookie(t *testing.T) {
	srv := &Service{config: &Config{}, sessionStore: &fakeSessionStore{}}

	called := false
	downstream := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true })

	req := httptest.NewRequest(http.MethodGet, "/api/protected/info", nil)
	rec := httptest.NewRecorder()

	Middleware(srv, downstream).ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.False(t, called, "downstream must not run for unauthenticated requests")
}
