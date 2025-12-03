package cleaner

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/cleaner/v1"
)

type Handler struct {
	srv *Service
}

func NewHandler(srv *Service) *Handler {
	return &Handler{srv: srv}
}

func (h *Handler) ListHistory(ctx context.Context, req *connect.Request[v1.ListHistoryRequest]) (*connect.Response[v1.ListHistoryResponse], error) {
	result, err := h.srv.store.ListResult()
	if err != nil {
		return nil, err
	}

	var rpcResults []*v1.PruneHistory
	for _, rs := range result {
		rpcResults = append(rpcResults, &v1.PruneHistory{
			TimeRan: rs.CreatedAt.Format(time.RFC3339),
			// todo unimplemented
			//Status:     "",

			Volumes:    rs.Volumes.Val(),
			Networks:   rs.Networks.Val(),
			Images:     rs.Images.Val(),
			Containers: rs.Containers.Val(),
			BuildCache: rs.BuildCache.Val(),
		})
	}

	return connect.NewResponse(&v1.ListHistoryResponse{
		History: rpcResults,
	}), nil
}

func (h *Handler) SpaceStatus(context.Context, *connect.Request[v1.SpaceStatusRequest]) (*connect.Response[v1.SpaceStatusResponse], error) {
	// todo
	_, err := h.srv.SystemStorage()
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.SpaceStatusResponse{
		//Containers: storage.Containers,
		//Images:     storage.Image,
		//Volumes:    storage.Volumes,
		//BuildCache: storage.BuildCache,
	}), nil
}

func (h *Handler) RunCleaner(ctx context.Context, req *connect.Request[v1.RunCleanerRequest]) (*connect.Response[v1.RunCleanerResponse], error) {
	err := h.srv.Run()
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.RunCleanerResponse{}), nil
}

func (h *Handler) GetConfig(ctx context.Context, req *connect.Request[v1.GetConfigRequest]) (*connect.Response[v1.GetConfigResponse], error) {
	config, err := h.srv.store.GetConfig()
	if err != nil {
		return nil, err
	}
	resp := connect.NewResponse(
		&v1.GetConfigResponse{
			Config: ToRpcPruneConfig(config),
		},
	)

	return resp, nil
}

func ToRpcPruneConfig(config PruneConfig) *v1.PruneConfig {
	return &v1.PruneConfig{
		Enabled:         config.Enabled,
		IntervalInHours: uint32(config.Interval.Hours()),
		Volumes:         config.Volumes,
		Networks:        config.Networks,
		Images:          config.Images,
		Containers:      config.Containers,
		BuildCache:      config.BuildCache,
	}
}

func (h *Handler) EditConfig(_ context.Context, req *connect.Request[v1.EditConfigRequest]) (*connect.Response[v1.EditConfigResponse], error) {
	rpcConfig := req.Msg.Config
	var config = PruneConfig{
		Enabled:  rpcConfig.Enabled,
		Interval: time.Duration(rpcConfig.IntervalInHours) * time.Hour,

		Volumes:    rpcConfig.Volumes,
		Networks:   rpcConfig.Networks,
		Images:     rpcConfig.Images,
		Containers: rpcConfig.Containers,
		BuildCache: rpcConfig.BuildCache,
	}

	err := h.srv.store.UpdateConfig(&config)
	if err != nil {
		return nil, fmt.Errorf("unable to update config: %v", err)
	}

	getConfig, err := h.srv.store.GetConfig()
	if err != nil {
		return nil, fmt.Errorf("unable to get config: %v", err)
	}

	return connect.NewResponse(&v1.EditConfigResponse{
		Config: ToRpcPruneConfig(getConfig),
	}), nil
}
