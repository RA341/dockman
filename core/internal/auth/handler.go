package auth

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/auth/v1"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	auth *Service
}

func NewConnectHandler(auth *Service) *Handler {
	return &Handler{auth: auth}
}

func (a *Handler) Login(_ context.Context, c *connect.Request[v1.User]) (*connect.Response[v1.Empty], error) {
	username, password := c.Msg.Username, c.Msg.Password
	if username != c.Msg.Username || password != c.Msg.Password {
		return nil, fmt.Errorf("empty username or password")
	}

	session, authToken, err := a.auth.Login(username, password)
	if err != nil {
		return nil, err
	}

	response := connect.NewResponse(&v1.Empty{})
	setCookie(response, CookieHeaderAuth, authToken, session.Expires)
	setCookie(
		response,
		CookieHeaderSessionId,
		strconv.Itoa(int(session.ID)),
		session.Expires,
	)

	return response, nil
}

func (a *Handler) Logout(_ context.Context, req *connect.Request[v1.Empty]) (*connect.Response[v1.Empty], error) {
	cookies, err := http.ParseCookie(req.Header().Get("Cookie"))
	if err != nil {
		return nil, err
	}

	_, err = verifyCookie(cookies, a.auth)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}

	sessionIdStr, err := getCookie(CookieHeaderSessionId, cookies)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	sessionID, err := strconv.Atoi(sessionIdStr.Value)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	err = a.auth.Logout(uint(sessionID))
	if err != nil {
		log.Warn().Err(err).Msg("error while logging out")
	}

	return connect.NewResponse(&v1.Empty{}), nil
}
