package dockyaml

import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/dockyaml/v1"
	dockyamlrpc "github.com/RA341/dockman/generated/dockyaml/v1/v1connect"
	"github.com/RA341/dockman/internal/host/middleware"
)

type Handler struct {
	srv *Service
}

func NewHandler(srv *Service) (string, http.Handler) {
	h := &Handler{srv: srv}
	return dockyamlrpc.NewDockyamlServiceHandler(h)
}

func (h *Handler) GetYaml(ctx context.Context, _ *connect.Request[v1.GetYamlRequest]) (*connect.Response[v1.GetYamlResponse], error) {
	host, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	yam := h.srv.GetYaml(host)

	return connect.NewResponse(&v1.GetYamlResponse{
		Dock: yam.ToProto(),
	}), nil
}

func (h *Handler) Get(ctx context.Context, _ *connect.Request[v1.GetRequest]) (*connect.Response[v1.GetResponse], error) {
	host, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	contents, err := h.srv.GetContents(host)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.GetResponse{Contents: contents}), nil
}

func (h *Handler) Save(ctx context.Context, req *connect.Request[v1.SaveRequest]) (*connect.Response[v1.SaveResponse], error) {
	host, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	err = h.srv.Save(host, req.Msg.Contents)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.SaveResponse{}), nil
}

func (d *DockmanYaml) ToProto() *v1.DockmanYaml {
	return &v1.DockmanYaml{
		CustomTools:                d.CustomTools,
		DisableComposeQuickActions: d.DisableComposeQuickActions,
		UseComposeFolders:          d.UseComposeFolders,
		SearchLimit:                int32(d.SearchLimit),
		VolumesPage:                d.VolumesPage.toProto(),
		TabLimit:                   d.TabLimit,
		NetworkPage:                d.NetworkPage.toProto(),
		ImagePage:                  d.ImagePage.toProto(),
		ContainerPage:              d.ContainerPage.toProto(),
	}
}

func (s Sort) toProto() *v1.Sort {
	return &v1.Sort{
		SortOrder: s.Order,
		SortField: s.Field,
	}
}

func (v ContainerConfig) toProto() *v1.ContainerConfig {
	return &v1.ContainerConfig{
		Sort: v.Sort.toProto(),
	}
}

func (v VolumesConfig) toProto() *v1.VolumesConfig {
	return &v1.VolumesConfig{
		Sort: v.Sort.toProto(),
	}
}

func (n NetworkConfig) toProto() *v1.NetworkConfig {
	return &v1.NetworkConfig{
		Sort: n.Sort.toProto(),
	}
}

func (i ImageConfig) toProto() *v1.ImageConfig {
	return &v1.ImageConfig{
		Sort: i.Sort.toProto(),
	}
}
