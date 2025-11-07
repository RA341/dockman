package files

import (
	"context"
	"fmt"
	"maps"
	"path/filepath"
	"slices"
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

func (h *Handler) List(_ context.Context, _ *connect.Request[v1.Empty]) (*connect.Response[v1.ListResponse], error) {
	fileList, err := h.srv.List()
	if err != nil {
		return nil, err
	}

	config := h.srv.GetDockmanYaml()

	var resp []*v1.FileGroup
	for _, key := range slices.Sorted(maps.Keys(fileList)) {
		// Sort subfiles with the updated rule
		slices.SortFunc(fileList[key], func(a, b string) int {
			return sortFiles(a, b, fileList, config)
		})

		resp = append(resp, &v1.FileGroup{
			Root:     key,
			SubFiles: fileList[key],
		})
	}

	// Sort groups alphabetically
	slices.SortFunc(resp, func(a, b *v1.FileGroup) int {
		return sortFiles(
			a.Root,
			b.Root,
			fileList,
			config,
		)
	})

	return connect.NewResponse(&v1.ListResponse{Groups: resp}), nil
}

func sortFiles(a, b string, fileList map[string][]string, dockmanConf *DockmanYaml) int {
	ra := getSortRank(a, fileList, dockmanConf)
	rb := getSortRank(b, fileList, dockmanConf)

	if ra < rb {
		return -1
	}
	if ra > rb {
		return 1
	}
	return strings.Compare(a, b)
}

func (h *Handler) Format(ctx context.Context, c *connect.Request[v1.FormatRequest]) (*connect.Response[v1.FormatResponse], error) {
	name := c.Msg.GetFilename()
	format, err := h.srv.Format(name)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.FormatResponse{Contents: string(format)}), nil
}

// getSortRank determines priority: dotfiles, directories, then files by getFileSortRank
func getSortRank(name string, fileList map[string][]string, conf *DockmanYaml) int {
	base := filepath.Base(name)
	// -1: pinned files (highest priority)
	if priority, ok := conf.PinnedFiles[base]; ok {
		// potential bug, but if someone is manually writing the order of 100000 files i say get a life
		// -999 > -12 in this context, pretty stupid but i cant be bothered to fix this mathematically
		return priority - 100_000
	}

	// 0: dotfiles (highest priority)
	if strings.HasPrefix(base, ".") {
		return 1
	}

	// Check if it's a directory (has subfiles)
	if len(fileList[name]) > 0 {
		return 2
	}

	// 2+: normal files, ranked by getFileSortRank
	return 3 + getFileSortRank(name)
}

// getFileSortRank assigns priority within normal files
func getFileSortRank(filename string) int {
	base := filepath.Base(filename)
	// Priority 0: docker-compose files
	if strings.HasSuffix(base, "compose.yaml") || strings.HasSuffix(base, "compose.yml") {
		return 0
	}
	// Priority 1: other yaml/yml
	if strings.HasSuffix(base, ".yaml") || strings.HasSuffix(base, ".yml") {
		return 1
	}
	// Priority 2: everything else
	return 2
}

func (h *Handler) Create(_ context.Context, c *connect.Request[v1.File]) (*connect.Response[v1.Empty], error) {
	filename, err := getFile(c.Msg)
	if err != nil {
		return nil, err
	}

	if err := h.srv.Create(filename); err != nil {
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

func (d DockmanYaml) toProto() *v1.DockmanYaml {
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
