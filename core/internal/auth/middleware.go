package auth

import (
	"context"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"github.com/rs/zerolog/log"
)

const CookieHeaderAuth = "Authorization"
const CookieHeaderSessionId = "SessionId"
const KeyUserCtx = "user"

type HttpMiddleware struct {
	Srv *Service
}

func NewHttpAuthMiddleware(srv *Service) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, err := verifyCookie(r.Cookies(), srv)
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}

			r.WithContext(context.WithValue(r.Context(), KeyUserCtx, u))
			next.ServeHTTP(w, r)
		})
	}
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

type Interceptor struct {
	authService *Service
}

func NewInterceptor(authService *Service) *Interceptor {
	return &Interceptor{authService: authService}
}

func (i *Interceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(
		ctx context.Context,
		conn connect.StreamingHandlerConn,
	) error {
		ctx, err := i.verifyGrpcCookie(ctx, conn.RequestHeader())
		if err != nil {
			return connect.NewError(connect.CodeUnauthenticated, err)
		}

		return next(ctx, conn)
	}
}

func (i *Interceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(
		ctx context.Context,
		req connect.AnyRequest,
	) (connect.AnyResponse, error) {
		ctx, err := i.verifyGrpcCookie(ctx, req.Header())
		if err != nil {
			return nil, connect.NewError(connect.CodeUnauthenticated, err)
		}

		return next(ctx, req)
	}
}

func (*Interceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(
		ctx context.Context,
		spec connect.Spec,
	) connect.StreamingClientConn {
		return next(ctx, spec)
	}
}

func (i *Interceptor) verifyGrpcCookie(ctx context.Context, header http.Header) (context.Context, error) {
	cookies, err := http.ParseCookie(header.Get("Cookie"))
	if err != nil {
		return ctx, err
	}

	user, err := verifyCookie(cookies, i.authService)
	if err != nil {
		return ctx, fmt.Errorf("invalid cookie: %w", err)
	}

	// add user value to subsequent requests
	return context.WithValue(ctx, KeyUserCtx, user), nil
}

func GetUserContext(ctx context.Context) (*User, error) {
	userVal := ctx.Value(KeyUserCtx)
	if userVal == nil {
		return nil, fmt.Errorf("could not find user in context")
	}

	return userVal.(*User), nil
}
