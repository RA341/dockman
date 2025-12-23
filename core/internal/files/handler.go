package files

import (
	"context"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"github.com/RA341/dockman/generated/files/v1"
	"github.com/RA341/dockman/internal/host"
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

func (h *Handler) List(ctx context.Context, req *connect.Request[v1.ListRequest]) (*connect.Response[v1.ListResponse], error) {
	hostname, err := host.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	result, err := h.srv.List(req.Msg.Path, hostname)
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

func (h *Handler) Format(ctx context.Context, req *connect.Request[v1.FormatRequest]) (*connect.Response[v1.FormatResponse], error) {
	hostname, err := host.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	name := req.Msg.Filename
	format, err := h.srv.Format(name, hostname)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.FormatResponse{Contents: string(format)}), nil
}

func (h *Handler) Create(ctx context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	hostname, err := host.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	filename, err := getFile(req.Msg, hostname)
	if err != nil {
		return nil, err
	}

	err = h.srv.Create(filename, req.Msg.IsDir, hostname)
	if err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Exists(ctx context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	hostname, err := host.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	err = h.srv.Exists(req.Msg.Filename, hostname)
	if err != nil {
		return nil, err
	}
	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Delete(ctx context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	hostname, err := host.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	filename, err := getFile(req.Msg, hostname)
	if err != nil {
		return nil, err
	}

	if err := h.srv.Delete(filename, hostname); err != nil {
		return nil, err
	}

	return &connect.Response[v1.Empty]{}, nil
}

func (h *Handler) Rename(ctx context.Context, req *connect.Request[v1.RenameFile]) (*connect.Response[v1.Empty], error) {
	hostname, err := host.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	err = h.srv.Rename(req.Msg.OldFilePath, req.Msg.NewFilePath, hostname)
	if err != nil {
		return nil, err
	}
	return &connect.Response[v1.Empty]{}, nil
}

func getFile(c *v1.File, hostname string) (string, error) {
	msg := c.Filename
	if msg == "" {
		return "", fmt.Errorf("name is empty")
	}
	return msg, nil
}

func (h *Handler) GetDockmanYaml(_ context.Context, _ *connect.Request[v1.Empty]) (*connect.Response[v1.DockmanYaml], error) {
	conf := h.srv.dy.GetDockmanYaml()
	return connect.NewResponse(conf.ToProto()), nil
}

func (h *Handler) ListAlias(_ context.Context, req *connect.Request[v1.ListAliasRequest]) (*connect.Response[v1.ListAliasResponse], error) {
	list, err := h.srv.store.List(req.Msg.Host)
	if err != nil {
		return nil, err
	}

	var resp = make([]*v1.Alias, 0, len(list))
	for _, alias := range list {
		resp = append(resp, &v1.Alias{
			Alias:    alias.Alias,
			Fullpath: alias.Fullpath,
			// Host:  we only use host to input new aliases it will use FormatAlias before inserting
		})
	}

	return connect.NewResponse(&v1.ListAliasResponse{
		Aliases: resp,
	}), nil
}

func (h *Handler) AddAlias(_ context.Context, req *connect.Request[v1.AddAliasRequest]) (*connect.Response[v1.AddAliasResponse], error) {
	alias := req.Msg.Alias
	err := h.srv.store.AddAlias(FormatAlias(alias.Alias, alias.Host), alias.Fullpath)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.AddAliasResponse{}), nil
}

func (h *Handler) DeleteAlias(_ context.Context, req *connect.Request[v1.DeleteAliasRequest]) (*connect.Response[v1.DeleteAliasResponse], error) {
	err := h.srv.store.RemoveAlias(req.Msg.Alias.Alias)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&v1.DeleteAliasResponse{}), nil
}
