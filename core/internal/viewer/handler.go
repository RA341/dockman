package viewer

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/viewer/v1"
	hm "github.com/RA341/dockman/internal/host/middleware"
	"github.com/rs/zerolog/log"
)

type Handler struct {
	srv *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{srv: service}
}

func (h *Handler) StartSqliteSession(ctx context.Context, req *connect.Request[v1.StartSqliteSessionRequest], stream *connect.ServerStream[v1.StartSqliteSessionResponse]) error {
	hostname, err := hm.GetHost(ctx)
	if err != nil {
		return err
	}

	path := req.Msg.Path

	sessionUrl, closer, err := h.srv.StartSession(
		context.Background(),
		path.Filename,
		path.Alias,
		hostname,
	)
	if err != nil {
		return err
	}
	defer closer()

	log.Debug().Str("url", sessionUrl).Msg("session started")

	err = stream.Send(&v1.StartSqliteSessionResponse{
		Url: sessionUrl,
	})
	if err != nil {
		return err
	}
	// wait for client to end stream
	select {
	case <-ctx.Done():
		log.Debug().Msg("context done from request")
	}

	return nil
}

func (h *Handler) StopSqliteSession(ctx context.Context, c *connect.Request[v1.StopSqliteSessionRequest]) (*connect.Response[v1.StopSqliteSessionResponse], error) {
	//TODO implement me
	return nil, fmt.Errorf("implement me StopSqliteSession")
}
