package cleaner

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/cleaner/v1"
	cleanerrpc "github.com/RA341/dockman/generated/cleaner/v1/v1connect"
	"github.com/RA341/dockman/internal/host/middleware"

	"github.com/dustin/go-humanize"
)

type Handler struct {
	srv *Service
}

func NewHandler(srv *Service) (string, http.Handler) {
	h := &Handler{srv: srv}
	return cleanerrpc.NewCleanerServiceHandler(h)
}

func (h *Handler) CleanOnce(ctx context.Context, c *connect.Request[v1.CleanOnceRequest]) (*connect.Response[v1.CleanOnceResponse], error) {
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	var pc PruneConfig
	pc.FromProto(c.Msg.Config)

	err = h.srv.RunOnce(ctx, hostname, &pc)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.CleanOnceResponse{}), nil
}

func (h *Handler) ListHistory(ctx context.Context, _ *connect.Request[v1.ListHistoryRequest]) (*connect.Response[v1.ListHistoryResponse], error) {
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	result, err := h.srv.store.ListResult(hostname)
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

func (h *Handler) SpaceStatus(ctx context.Context, _ *connect.Request[v1.SpaceStatusRequest]) (*connect.Response[v1.SpaceStatusResponse], error) {
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	sys, net, err := h.srv.GetSystemStorage(ctx, hostname)
	if err != nil {
		return nil, err
	}

	var inuse int
	for _, ne := range net {
		isSystem := ne.Name == "host" || ne.Name == "bridge" || ne.Name == "none"
		if len(ne.Containers) > 0 || isSystem {
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

func (h *Handler) RunCleaner(ctx context.Context, _ *connect.Request[v1.RunCleanerRequest]) (*connect.Response[v1.RunCleanerResponse], error) {
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	err = h.srv.RunWithScheduler(hostname, false)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.RunCleanerResponse{}), nil
}

func (h *Handler) GetConfig(ctx context.Context, _ *connect.Request[v1.GetConfigRequest]) (*connect.Response[v1.GetConfigResponse], error) {
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	config, err := h.srv.store.GetConfig(hostname)
	if err != nil {
		return nil, err
	}
	resp := connect.NewResponse(
		&v1.GetConfigResponse{
			Config: config.ToProto(),
		},
	)

	return resp, nil
}

func (h *Handler) EditConfig(ctx context.Context, req *connect.Request[v1.EditConfigRequest]) (*connect.Response[v1.EditConfigResponse], error) {
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	var cf PruneConfig
	cf.FromProto(req.Msg.Config)
	cf.Host = hostname

	err = h.srv.store.UpdateConfig(&cf)
	if err != nil {
		return nil, fmt.Errorf("unable to update config: %v", err)
	}

	getConfig, err := h.srv.store.GetConfig(hostname)
	if err != nil {
		return nil, err
	}

	err = h.srv.RunWithScheduler(hostname, true)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.EditConfigResponse{
		Config: getConfig.ToProto(),
	}), nil
}
