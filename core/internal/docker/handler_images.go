package docker

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/docker/v1"
	"github.com/dustin/go-humanize"
	"github.com/moby/moby/api/types/image"
)

////////////////////////////////////////////
// 				Image Actions 			  //
////////////////////////////////////////////

func (h *Handler) ImageList(ctx context.Context, req *connect.Request[v1.ListImagesRequest]) (*connect.Response[v1.ListImagesResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	images, err := dkSrv.Container.ImageList(ctx)
	if err != nil {
		return nil, err
	}
	//imageUpdates, err := h.updater(host).Store.GetUpdateAvailable(
	//	"",
	//	listutils.ToMap(images, func(t image.Summary) string {
	//		return t.ID
	//	})...,
	//)
	//if err != nil {
	//	return nil, err
	//}

	var unusedContainers int64
	var totalDisk int64
	var untagged int64
	var rpcImages []*v1.Image

	for _, img := range images {
		totalDisk += img.Size

		if len(img.RepoTags) == 0 {
			untagged++
		}

		if img.Containers == 0 {
			unusedContainers++
		}

		rpcImages = append(rpcImages, &v1.Image{
			Containers:  img.Containers,
			Created:     img.Created,
			Id:          img.ID,
			Labels:      img.Labels,
			ParentId:    img.ParentID,
			RepoDigests: img.RepoDigests,
			RepoTags:    img.RepoTags,
			SharedSize:  img.SharedSize,
			Size:        img.Size,
			//UpdateRef:   imageUpdates[img.ID].UpdateRef,
			Manifests: []*v1.ManifestSummary{}, // todo
		})
	}

	return connect.NewResponse(&v1.ListImagesResponse{
		TotalDiskUsage:   totalDisk,
		Images:           rpcImages,
		UnusedImageCount: unusedContainers,
	}), err
}

func (h *Handler) ImageRemove(ctx context.Context, req *connect.Request[v1.RemoveImageRequest]) (*connect.Response[v1.RemoveImageResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	for _, img := range req.Msg.ImageIds {
		_, err := dkSrv.Container.ImageDelete(ctx, img)
		if err != nil {
			return nil, fmt.Errorf("unable to remove image %s: %w", img, err)
		}
	}

	return connect.NewResponse(&v1.RemoveImageResponse{}), nil
}

func (h *Handler) ImagePruneUnused(ctx context.Context, req *connect.Request[v1.ImagePruneRequest]) (*connect.Response[v1.ImagePruneResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	var result image.PruneReport
	if req.Msg.GetPruneAll() {
		result, err = dkSrv.Container.ImagePruneUnused(ctx)
	} else {
		result, err = dkSrv.Container.ImagePruneUntagged(ctx)
	}
	if err != nil {
		return nil, err
	}

	response := v1.ImagePruneResponse{
		SpaceReclaimed: result.SpaceReclaimed,
	}

	var deleted []*v1.ImagesDeleted
	for _, res := range result.ImagesDeleted {
		deleted = append(deleted, &v1.ImagesDeleted{
			Deleted:  res.Deleted,
			Untagged: res.Untagged,
		})
	}
	response.Deleted = deleted

	return connect.NewResponse(&response), nil
}

func (h *Handler) ImageInspect(ctx context.Context, req *connect.Request[v1.ImageInspectRequest]) (*connect.Response[v1.ImageInspectResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	inspect, history, err := dkSrv.Container.ImageInspect(
		ctx,
		req.Msg.ImageId,
	)
	if err != nil {
		return nil, err
	}

	var layers = make([]*v1.ImageLayer, 0, len(history.Items))
	for _, sd := range history.Items {
		layers = append(layers, &v1.ImageLayer{
			Cmd:  sd.CreatedBy,
			Size: humanize.Bytes(uint64(sd.Size)),
		})
	}

	var name string
	for _, sd := range inspect.RepoDigests {
		name = sd
	}

	var insp = &v1.ImageInspect{
		Name:       name,
		Id:         inspect.ID,
		Arch:       inspect.Architecture,
		Size:       humanize.Bytes(uint64(inspect.Size)),
		CreatedIso: inspect.Created,
		Layers:     layers,
	}

	return connect.NewResponse(&v1.ImageInspectResponse{
		Inspect: insp,
	}), nil
}
