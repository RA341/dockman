package files

import (
	"context"
	"fmt"
	"strings"

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
	result, err := h.srv.List(req.Msg.Path, req.Msg.Alias)
	if err != nil {
		return nil, err
	}

	conf := h.srv.dy.GetDockmanYaml()

	var rpcResult = make([]*v1.FsEntry, 0, len(result))
	for _, entry := range result {
		var composeFileName = ""
		multipleComposeFiles := false

		ele := &v1.FsEntry{
			Filename:  entry.fullpath,
			IsDir:     entry.isDir,
			IsFetched: true,
			SubFiles: ToMap(entry.children, func(childEntry Entry) *v1.FsEntry {
				hasComposeExt := strings.HasSuffix(childEntry.fullpath, "compose.yaml") ||
					strings.HasSuffix(childEntry.fullpath, "compose.yml")

				if !multipleComposeFiles && conf.UseComposeFolders && !childEntry.isDir && hasComposeExt {
					if composeFileName != "" {
						// previously set
						multipleComposeFiles = true
					}
					composeFileName = childEntry.fullpath
				}

				return &v1.FsEntry{
					Filename: childEntry.fullpath,
					IsDir:    childEntry.isDir,
					// max depth is 2 so indicate that it is unfetched
					IsFetched: false,
					SubFiles:  []*v1.FsEntry{},
				}
			}),
		}

		if !multipleComposeFiles {
			ele.IsComposeFolder = composeFileName
		}

		rpcResult = append(rpcResult, ele)
	}

	return connect.NewResponse(&v1.ListResponse{Entries: rpcResult}), nil
}

func (h *Handler) Format(_ context.Context, req *connect.Request[v1.FormatRequest]) (*connect.Response[v1.FormatResponse], error) {
	name := req.Msg.GetFilename()
	format, err := h.srv.Format(name, req.Msg.Alias)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.FormatResponse{Contents: string(format)}), nil
}

func (h *Handler) Create(_ context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	filename, err := getFile(req.Msg)
	if err != nil {
		return nil, err
	}

	err = h.srv.Create(filename, req.Msg.Alias, req.Msg.IsDir)
	if err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Exists(_ context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	if err := h.srv.Exists(req.Msg.GetFilename(), req.Msg.Alias); err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Delete(_ context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	filename, err := getFile(req.Msg)
	if err != nil {
		return nil, err
	}

	if err := h.srv.Delete(filename, req.Msg.Alias); err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Rename(_ context.Context, req *connect.Request[v1.RenameFile]) (*connect.Response[v1.Empty], error) {
	err := h.srv.Rename(req.Msg.OldFilePath, req.Msg.NewFilePath, req.Msg.Alias)
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
	conf := h.srv.dy.GetDockmanYaml()
	return connect.NewResponse(conf.toProto()), nil
}

func (h *Handler) ListAlias(ctx context.Context, req *connect.Request[v1.ListAliasRequest]) (*connect.Response[v1.ListAliasResponse], error) {
	list, err := h.srv.store.List()
	if err != nil {
		return nil, err
	}

	var resp = make([]*v1.Alias, 0, len(list))
	for _, alias := range list {
		resp = append(resp, &v1.Alias{
			Alias:    alias.Alias,
			Fullpath: alias.Fullpath,
		})
	}

	return connect.NewResponse(&v1.ListAliasResponse{
		Aliases: resp,
	}), nil
}

func (h *Handler) AddAlias(ctx context.Context, req *connect.Request[v1.AddAliasRequest]) (*connect.Response[v1.AddAliasResponse], error) {
	alias := req.Msg.Alias
	err := h.srv.store.AddAlias(alias.Alias, alias.Fullpath)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.AddAliasResponse{}), nil
}

func (h *Handler) DeleteAlias(ctx context.Context, req *connect.Request[v1.DeleteAliasRequest]) (*connect.Response[v1.DeleteAliasResponse], error) {
	err := h.srv.store.RemoveAlias(req.Msg.Alias.Alias)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1.DeleteAliasResponse{}), nil
}

func (d *DockmanYaml) toProto() *v1.DockmanYaml {
	return &v1.DockmanYaml{
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
