package docker

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"time"

	"connectrpc.com/connect"
	v1 "github.com/RA341/dockman/generated/docker/v1"
	"github.com/docker/compose/v5/pkg/api"
	"github.com/moby/moby/api/types/network"
)

////////////////////////////////////////////
// 				Network Actions 		  //
////////////////////////////////////////////

func (h *Handler) NetworkList(ctx context.Context, req *connect.Request[v1.ListNetworksRequest]) (*connect.Response[v1.ListNetworksResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	networks, err := dkSrv.Container.NetworksList(ctx)
	if err != nil {
		return nil, err
	}

	var rpcNetworks []*v1.Network
	for _, netI := range networks {
		rpcNetworks = append(rpcNetworks, ToRpcNetwork(netI))
	}

	return connect.NewResponse(&v1.ListNetworksResponse{Networks: rpcNetworks}), nil
}

func ToRpcNetwork(netI network.Inspect) *v1.Network {
	return &v1.Network{
		Id:             netI.ID,
		Name:           netI.Name,
		CreatedAt:      netI.Created.Format(time.RFC3339),
		Subnet:         getSubnet(netI),
		Scope:          netI.Scope,
		Driver:         netI.Driver,
		EnableIpv4:     netI.EnableIPv4,
		EnableIpv6:     netI.EnableIPv6,
		Internal:       netI.Internal,
		Attachable:     netI.Attachable,
		ComposeProject: netI.Labels[api.ProjectLabel],
		ContainerIds:   slices.Collect(maps.Keys(netI.Containers)),
	}
}

func (h *Handler) NetworkInspect(ctx context.Context, req *connect.Request[v1.NetworkInspectRequest]) (*connect.Response[v1.NetworkInspectResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	inspect, err := dkSrv.Container.NetworksInspect(ctx, req.Msg.NetworkId)
	if err != nil {
		return nil, err
	}

	rpcNetworks := make([]*v1.NetworkContainerInspect, 0, len(inspect.Containers))
	for _, d := range inspect.Containers {
		rpcNetworks = append(rpcNetworks, &v1.NetworkContainerInspect{
			Name:     d.Name,
			Endpoint: d.EndpointID,
			IPv4:     d.IPv4Address.String(),
			IPv6:     d.IPv6Address.String(),
			Mac:      d.MacAddress.String(),
		})
	}

	info := v1.NetworkInspectInfo{
		Net:       ToRpcNetwork(inspect),
		Container: rpcNetworks,
	}

	return connect.NewResponse(&v1.NetworkInspectResponse{
		Inspect: &info,
	}), nil
}

func getSubnet(netI network.Inspect) string {
	if len(netI.IPAM.Config) == 0 {
		return "-----"
	}
	return netI.IPAM.Config[0].Subnet.String()
}

func (h *Handler) NetworkCreate(_ context.Context, _ *connect.Request[v1.CreateNetworkRequest]) (*connect.Response[v1.CreateNetworkResponse], error) {
	//TODO implement me
	return nil, fmt.Errorf(" implement me NetworkCreate")
}

func (h *Handler) NetworkDelete(ctx context.Context, req *connect.Request[v1.DeleteNetworkRequest]) (*connect.Response[v1.DeleteNetworkResponse], error) {
	_, dkSrv, err := h.getHost(ctx)
	if err != nil {
		return nil, err
	}

	if req.Msg.Prune {
		err = dkSrv.Container.NetworksPrune(ctx)
	} else {
		for _, nid := range req.Msg.NetworkIds {
			err = dkSrv.Container.NetworksDelete(ctx, nid)
		}
	}
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1.DeleteNetworkResponse{}), nil
}
