package cleaner

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/cleaner/v1"
)

type Handler struct {
	srv *Service
}

func NewHandler(srv *Service) Handler {
	return Handler{srv: srv}
}

func (h Handler) ListHistory(ctx context.Context, c *connect.Request[v1.ListHistoryRequest]) (*connect.Response[v1.ListHistoryResponse], error) {
	return nil, fmt.Errorf("implement me ListHistory")
}

func (h Handler) RunCleaner(ctx context.Context, c *connect.Request[v1.RunCleanerRequest]) (*connect.Response[v1.RunCleanerResponse], error) {
	return nil, fmt.Errorf("implement me RunCleaner")
}

func (h Handler) GetConfig(ctx context.Context, c *connect.Request[v1.GetConfigRequest]) (*connect.Response[v1.GetConfigResponse], error) {
	return nil, fmt.Errorf("implement me GetConfig")
}

func (h Handler) EditConfig(ctx context.Context, c *connect.Request[v1.EditConfigRequest]) (*connect.Response[v1.EditConfigResponse], error) {
	return nil, fmt.Errorf("implement me EditConfig")
}
