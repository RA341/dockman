package docker

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/docker/v1"
	contSrv "github.com/RA341/dockman/internal/docker/container"
	"github.com/docker/compose/v5/pkg/api"
)

////////////////////////////////////////////
// 				Volume Actions 			  //
////////////////////////////////////////////

func (h *Handler) VolumeList(ctx context.Context, req *connect.Request[v1.ListVolumesRequest]) (*connect.Response[v1.ListVolumesResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	volumes, err := dkSrv.Container.VolumesList(ctx)
	if err != nil {
		return nil, err
	}

	var rpcVolumes []*v1.Volume
	for _, vol := range volumes {
		rpcVolumes = append(rpcVolumes, &v1.Volume{
			Name:               vol.Name,
			ContainerID:        vol.ContainerID,
			Size:               safeGetSize(vol),
			CreatedAt:          vol.CreatedAt,
			Labels:             getVolumeProjectNameFromLabel(vol.Labels),
			MountPoint:         vol.Mountpoint,
			ComposePath:        h.getComposeFilePath(vol.ComposePath),
			ComposeProjectName: vol.ComposeProjectName,
		})
	}

	return connect.NewResponse(&v1.ListVolumesResponse{Volumes: rpcVolumes}), nil
}

func safeGetSize(vol contSrv.VolumeInfo) int64 {
	if vol.UsageData == nil {
		return 0
	}
	return vol.UsageData.Size
}

func getVolumeProjectNameFromLabel(labels map[string]string) string {
	if labels == nil {
		return ""
	}
	const LabelVolumeAnonymous = "com.docker.volume.anonymous"
	if _, ok := labels[LabelVolumeAnonymous]; ok {
		return "anonymous"
	}

	if val, ok := labels[api.ProjectLabel]; ok {
		return val
	}

	return ""
}

func (h *Handler) VolumeCreate(_ context.Context, req *connect.Request[v1.CreateVolumeRequest]) (*connect.Response[v1.CreateVolumeResponse], error) {
	//TODO implement me
	return nil, fmt.Errorf(" implement me VolumeCreate")
}

func (h *Handler) VolumeDelete(ctx context.Context, req *connect.Request[v1.DeleteVolumeRequest]) (*connect.Response[v1.DeleteVolumeResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	if req.Msg.Anon {
		err = dkSrv.Container.VolumesPrune(ctx)
	} else if req.Msg.Unused {
		err = dkSrv.Container.VolumesPruneUnunsed(ctx)
	} else {
		for _, vols := range req.Msg.VolumeIds {
			err = dkSrv.Container.VolumesDelete(ctx, vols, false)
		}
	}

	return connect.NewResponse(&v1.DeleteVolumeResponse{}), err
}
