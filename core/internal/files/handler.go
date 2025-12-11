package files

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	"github.com/RA341/dockman/generated/files/v1"
)

type Handler struct {
	srv *Service
}

func NewConnectHandler(service *Service) *Handler {
	return &Handler{srv: service}
}

func ToMap[T any, Q any](input []T, mapper func(T) Q) []Q {
	var result = make([]Q, 0, len(input))
	for _, t := range input {
		result = append(result, mapper(t))
	}
	return result
}

func (h *Handler) List(_ context.Context, req *connect.Request[v1.ListRequest]) (*connect.Response[v1.ListResponse], error) {
	result, err := h.srv.List(req.Msg.Path)
	if err != nil {
		return nil, err
	}

	var rpcResult = make([]*v1.FsEntry, 0, len(result))
	for _, entry := range result {
		rpcResult = append(rpcResult, &v1.FsEntry{
			Filename:  entry.fullpath,
			IsDir:     entry.isDir,
			IsFetched: true,
			SubFiles: ToMap(entry.children, func(t Entry) *v1.FsEntry {
				return &v1.FsEntry{
					Filename: t.fullpath,
					IsDir:    t.isDir,
					// we fetch max depth 2 so we indicate that if it is a dir and is unfetched
					IsFetched: false,
					SubFiles:  []*v1.FsEntry{},
				}
			}),
		})
	}

	return connect.NewResponse(&v1.ListResponse{Entries: rpcResult}), nil
}

func (h *Handler) Format(_ context.Context, c *connect.Request[v1.FormatRequest]) (*connect.Response[v1.FormatResponse], error) {
	name := c.Msg.GetFilename()
	format, err := h.srv.Format(name)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.FormatResponse{Contents: string(format)}), nil
}

func (h *Handler) Create(_ context.Context, c *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	filename, err := getFile(c.Msg)
	if err != nil {
		return nil, err
	}

	err = h.srv.Create(filename, c.Msg.IsDir)
	if err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Exists(_ context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	if err := h.srv.Exists(req.Msg.GetFilename()); err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Delete(_ context.Context, c *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	filename, err := getFile(c.Msg)
	if err != nil {
		return nil, err
	}

	if err := h.srv.Delete(filename); err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Rename(_ context.Context, req *connect.Request[v1.RenameFile]) (*connect.Response[v1.Empty], error) {
	err := h.srv.Rename(req.Msg.OldFilePath, req.Msg.NewFilePath)
	if err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func getFile(c *v1.File) (string, error) {
	msg := c.GetFilename()
	if msg == "" {
		return "", fmt.Errorf("name is empty")
	}
	return msg, nil
}

func (h *Handler) GetDockmanYaml(context.Context, *connect.Request[v1.Empty]) (*connect.Response[v1.DockmanYaml], error) {
	conf := h.srv.GetDockmanYaml()
	return connect.NewResponse(conf.toProto()), nil
}

func (d *DockmanYaml) toProto() *v1.DockmanYaml {
	return &v1.DockmanYaml{
		DisableComposeQuickActions: d.DisableComposeQuickActions,
		UseComposeFolders:          d.UseComposeFolders,
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
