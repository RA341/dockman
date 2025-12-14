package cleaner

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/cleaner/v1"
	"github.com/dustin/go-humanize"
)

type Handler struct {
	srv *Service
}

func NewHandler(srv *Service) *Handler {
	return &Handler{srv: srv}
}

func (h *Handler) ListHistory(context.Context, *connect.Request[v1.ListHistoryRequest]) (*connect.Response[v1.ListHistoryResponse], error) {
	result, err := h.srv.store.ListResult(h.srv.hostname())
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

func (h *Handler) SpaceStatus(ctx context.Context, req *connect.Request[v1.SpaceStatusRequest]) (*connect.Response[v1.SpaceStatusResponse], error) {
	sys, net, err := h.srv.SystemStorage(ctx)
	if err != nil {
		return nil, err
	}

	var inuse int
	for _, ne := range net {
		if len(ne.Containers) > 0 {
			inuse++
		}
	}

	inu := int64(inuse)
	count := int64(len(net))
	network := &v1.SpaceStat{
		ActiveCount: inu,
		TotalCount:  count,
		Reclaimable: strconv.FormatInt(count-inu, 10),
		TotalSize:   "N/A",
	}

	volumes := &v1.SpaceStat{
		ActiveCount: sys.Volumes.ActiveCount,
		TotalCount:  sys.Volumes.TotalCount,
		Reclaimable: humanize.Bytes(uint64(sys.Volumes.Reclaimable)),
		TotalSize:   humanize.Bytes(uint64(sys.Volumes.TotalSize)),
	}

	containers := &v1.SpaceStat{
		ActiveCount: sys.Containers.ActiveCount,
		TotalCount:  sys.Containers.TotalCount,
		Reclaimable: humanize.Bytes(uint64(sys.Containers.Reclaimable)),
		TotalSize:   humanize.Bytes(uint64(sys.Containers.TotalSize)),
	}

	images := &v1.SpaceStat{
		ActiveCount: sys.Images.ActiveCount,
		TotalCount:  sys.Images.TotalCount,
		Reclaimable: humanize.Bytes(uint64(sys.Images.Reclaimable)),
		TotalSize:   humanize.Bytes(uint64(sys.Images.TotalSize)),
	}

	buildCache := &v1.SpaceStat{
		ActiveCount: sys.BuildCache.ActiveCount,
		TotalCount:  sys.BuildCache.TotalCount,
		Reclaimable: humanize.Bytes(uint64(sys.BuildCache.Reclaimable)),
		TotalSize:   humanize.Bytes(uint64(sys.BuildCache.TotalSize)),
	}

	return connect.NewResponse(&v1.SpaceStatusResponse{
		Containers: containers,
		Images:     images,
		Volumes:    volumes,
		BuildCache: buildCache,
		Network:    network,
	}), nil
}

func (h *Handler) RunCleaner(context.Context, *connect.Request[v1.RunCleanerRequest]) (*connect.Response[v1.RunCleanerResponse], error) {
	err := h.srv.Run()
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.RunCleanerResponse{}), nil
}

func (h *Handler) GetConfig(context.Context, *connect.Request[v1.GetConfigRequest]) (*connect.Response[v1.GetConfigResponse], error) {
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
