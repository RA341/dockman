package container

import (
	"context"
	"fmt"

	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
)

func (s *Service) NetworksList(ctx context.Context) ([]network.Inspect, error) {
	list, err := s.Client.NetworkList(ctx, client.NetworkListOptions{})
	if err != nil {
		return nil, err
	}

	var errs []error
	var result []network.Inspect
	for _, ref := range list.Items {
		networkInspect, err2 := s.Client.NetworkInspect(ctx, ref.ID, client.NetworkInspectOptions{})
		if err2 != nil {
			errs = append(errs, err2)
			continue
		}
		result = append(result, networkInspect.Network)
	}

	if errs != nil {
		return nil, fmt.Errorf("could not list networks: %v", errs)
	}

	return result, nil
}

func (s *Service) NetworksCreate(ctx context.Context, name string) error {
	_, err := s.Client.NetworkCreate(ctx, name, client.NetworkCreateOptions{})
	return err
}

func (s *Service) NetworksDelete(ctx context.Context, networkID string) error {
	_, err := s.Client.NetworkRemove(ctx, networkID, client.NetworkRemoveOptions{})
	return err
}

func (s *Service) NetworksPrune(ctx context.Context) error {
	_, err := s.Client.NetworkPrune(ctx, client.NetworkPruneOptions{})
	return err
}
