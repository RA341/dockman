package container

import (
	"context"
	"fmt"

	"github.com/docker/compose/v2/pkg/api"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/api/types/volume"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

type VolumeInfo struct {
	volume.Volume
	ContainerID        string
	ComposePath        string
	ComposeProjectName string
}

func (s *Service) VolumesList(ctx context.Context) ([]VolumeInfo, error) {
	listResp, err := s.Client.VolumeList(ctx, client.VolumeListOptions{})
	if err != nil {
		return nil, err
	}

	if listResp.Items == nil {
		return []VolumeInfo{}, nil
	}

	diskUsage, err := s.Client.DiskUsage(ctx, client.DiskUsageOptions{
		Volumes: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get disk usage data: %w", err)
	}

	tmpMap := make(map[string]volume.Volume)
	sd := diskUsage.Volumes.Items
	if sd != nil {
		tmpMap = make(map[string]volume.Volume, len(sd))
		for _, l := range sd {
			tmpMap[l.Name] = l
		}
	}

	volumeFilters := client.Filters{}
	for i, vol := range listResp.Items {
		val, ok := tmpMap[vol.Name]
		if ok {
			listResp.Items[i] = val
		}
		volumeFilters.Add("volume", val.Name)
	}

	containers, err := s.Client.ContainerList(ctx, client.ContainerListOptions{
		All:     true,
		Filters: volumeFilters,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	containersUsingVolumesMap := make(map[string][3]string)
	for _, c := range containers.Items {
		// We inspect the container's Mounts to find volume information.
		for _, mn := range c.Mounts {
			if mn.Type == mount.TypeVolume {
				// Append the container's first known name to the list for this volume.
				if len(c.Names) > 0 {
					containersUsingVolumesMap[mn.Name] = [3]string{
						c.ID,
						c.Labels[api.ConfigFilesLabel],
						c.Labels[api.ProjectLabel],
					}
				}
			}
		}
	}

	var volumes []VolumeInfo
	for _, vol := range listResp.Items {
		inf := VolumeInfo{Volume: vol}
		if contID, found := containersUsingVolumesMap[vol.Name]; found {
			inf.ContainerID = contID[0]
			inf.ComposePath = contID[1]
			inf.ComposeProjectName = contID[2]
		}

		volumes = append(volumes, inf)
	}

	return volumes, nil
}

func (s *Service) VolumesCreate(ctx context.Context, name string) (volume.Volume, error) {
	create, err := s.Client.VolumeCreate(ctx, client.VolumeCreateOptions{
		Name: name,
	})
	if err != nil {
		return volume.Volume{}, err
	}
	return create.Volume, err
}

func (s *Service) VolumesDelete(ctx context.Context, volumeName string, force bool) error {
	_, err := s.Client.VolumeRemove(ctx, volumeName, client.VolumeRemoveOptions{Force: force})
	if err != nil {
		return err
	}
	return nil
}

func (s *Service) VolumesPruneUnunsed(ctx context.Context) error {
	volResponse, err := s.Client.VolumeList(ctx, client.VolumeListOptions{})
	if err != nil {
		return fmt.Errorf("failed to get disk usage data: %w", err)
	}

	volumeFilters := client.Filters{}
	for _, vol := range volResponse.Items {
		volumeFilters.Add("volume", vol.Name)
	}

	containers, err := s.Client.ContainerList(ctx, client.ContainerListOptions{
		All:     true,
		Filters: volumeFilters,
	})
	if err != nil {
		return fmt.Errorf("failed to list containers: %w", err)
	}

	containersUsingVolumesMap := make(map[string]string)
	for _, c := range containers.Items {
		// We inspect the container's Mounts to find volume information.
		for _, mn := range c.Mounts {
			if mn.Type == mount.TypeVolume {
				// Append the container's first known name to the list for this volume.
				if len(c.Names) > 0 {
					containersUsingVolumesMap[mn.Name] = c.ID
				}
			}
		}
	}

	var delErr error
	for _, vol := range volResponse.Items {
		if _, found := containersUsingVolumesMap[vol.Name]; found {
			continue
		}

		_, err = s.Client.VolumeRemove(ctx, vol.Name, client.VolumeRemoveOptions{})
		if err != nil {
			delErr = fmt.Errorf("%w\n%w", delErr, err)
		}
	}

	return delErr
}

func (s *Service) VolumesPrune(ctx context.Context) error {
	prune, err := s.Client.VolumePrune(ctx, client.VolumePruneOptions{})
	log.Debug().Any("report", prune).Msg("VolumesPrune result")
	return err
}
