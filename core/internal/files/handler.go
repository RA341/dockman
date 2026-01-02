package files

import (
	"context"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"github.com/RA341/dockman/generated/files/v1"
	"github.com/RA341/dockman/internal/host/middleware"
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
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	result, err := h.srv.List(req.Msg.Path, hostname)
	if err != nil {
		return nil, err
	}

	var rpcResult = make([]*v1.FsEntry, 0, len(result))
	for _, entry := range result {
		var composeFileName = ""

		ele := &v1.FsEntry{
			Filename:  entry.fullpath,
			IsDir:     entry.isDir,
			IsFetched: true,
			SubFiles: ToMap(entry.children, func(childEntry Entry) *v1.FsEntry {
				hasComposeExt := strings.HasSuffix(childEntry.fullpath, "compose.yaml") ||
					strings.HasSuffix(childEntry.fullpath, "compose.yml")

				if !childEntry.isDir && hasComposeExt {
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

		ele.IsComposeFolder = composeFileName
		rpcResult = append(rpcResult, ele)
	}

	return connect.NewResponse(&v1.ListResponse{Entries: rpcResult}), nil
}

func (h *Handler) Format(ctx context.Context, req *connect.Request[v1.FormatRequest]) (*connect.Response[v1.FormatResponse], error) {
	hostname, err := middleware.GetHost(ctx)
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
	hostname, err := middleware.GetHost(ctx)
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

func (h *Handler) Copy(ctx context.Context, req *connect.Request[v1.CopyRequest]) (*connect.Response[v1.CopyResponse], error) {
	hostname, err := middleware.GetHost(ctx)
	if err != nil {
		return nil, err
	}

	dest := req.Msg.Dest.Filename
	src := req.Msg.Source.Filename
	isDir := req.Msg.Source.IsDir

	err = h.srv.Copy(src, dest, hostname, isDir)
	if err != nil {
		return nil, err
	}

	return &connect.Response[v1.CopyResponse]{}, nil
}

func (h *Handler) Exists(ctx context.Context, req *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	hostname, err := middleware.GetHost(ctx)
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
	hostname, err := middleware.GetHost(ctx)
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
	hostname, err := middleware.GetHost(ctx)
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
