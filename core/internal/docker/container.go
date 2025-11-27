package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/docker/compose/v2/pkg/api"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/volume"
	"github.com/docker/docker/client"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
)

type ContainerService struct {
	*dependencies
}

func NewContainerService(u *dependencies) *ContainerService {
	return &ContainerService{dependencies: u}
}

// NewSimpleContainerService creates a simple docker client for
// messing around only has access to the socket
func NewSimpleContainerService(client *client.Client) *ContainerService {
	return &ContainerService{dependencies: &dependencies{
		Daemon: client,
	}}
}

// NewUpdaterService service used by dockman updater
func NewUpdaterService(client *client.Client) *ContainerService {
	u := &dependencies{
		hostname:         LocalClient,
		Daemon:           client,
		syncer:           NewNoopSyncer(),
		imageUpdateStore: NewNoopStore(),
		// not needed by updater service
		//daemonAddr:       "",
		//ComposeRoot:      "",
		//updaterUrl:       "",
	}

	return &ContainerService{dependencies: u}
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Container stuff

func (s *ContainerService) ContainersList(ctx context.Context) ([]container.Summary, error) {
	return s.Daemon.ContainerList(ctx, container.ListOptions{
		All:    true,
		Size:   false,
		Latest: false,
	})
}

func (s *ContainerService) containerListByIDs(ctx context.Context, containerID ...string) ([]container.Summary, error) {
	filterArgs := filters.NewArgs()
	for _, id := range containerID {
		filterArgs.Add("id", id)
	}

	options := container.ListOptions{
		All:     true, // Include stopped containers
		Filters: filterArgs,
	}

	list, err := s.Daemon.ContainerList(ctx, options)
	if err != nil {
		return nil, fmt.Errorf("unable to fetch container info: %w", err)
	}

	return list, nil
}

func (s *ContainerService) ContainersStart(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		err := s.Daemon.ContainerStart(ctx, cont, container.StartOptions{})
		if err != nil {
			return fmt.Errorf("unable to start Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *ContainerService) ContainersStop(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		err := s.Daemon.ContainerStop(ctx, cont, container.StopOptions{})
		if err != nil {
			return fmt.Errorf("unable to stop Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *ContainerService) ContainersRestart(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		err := s.Daemon.ContainerRestart(ctx, cont, container.StopOptions{})
		if err != nil {
			return fmt.Errorf("unable to restart Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *ContainerService) ContainersRemove(ctx context.Context, containerId ...string) error {
	for _, cont := range containerId {
		err := s.Daemon.ContainerRemove(ctx, cont, container.RemoveOptions{
			Force: true,
		})
		if err != nil {
			return fmt.Errorf("unable to remove Container: %s => %w", cont, err)
		}
	}
	return nil
}

func (s *ContainerService) ContainerLogs(ctx context.Context, containerID string) (io.ReadCloser, bool, error) {
	inspect, err := s.Daemon.ContainerInspect(ctx, containerID)
	if err != nil {
		return nil, false, fmt.Errorf("unable to inspect container: %w", err)
	}

	logStream, err := s.Daemon.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     true,
		Details:    true,
	})
	if err != nil {
		return nil, false, fmt.Errorf("unable to get container logs: %w", err)
	}

	return logStream, inspect.Config.Tty, nil
}

func (s *ContainerService) ContainerStats(ctx context.Context, filter container.ListOptions) ([]ContainerStats, error) {
	containers, err := s.Daemon.ContainerList(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("could not list containers: %w", err)
	}

	if len(containers) == 0 {
		return []ContainerStats{}, nil
	}

	statsList := s.containerGetStatsFromList(ctx, containers)
	return statsList, nil
}

func (s *ContainerService) containerGetStatsFromList(ctx context.Context, containers []container.Summary) []ContainerStats {
	return parallelLoop(containers, func(r container.Summary) (ContainerStats, bool) {
		stats, err := s.getAndFormatStats(ctx, r)
		if err != nil && !errors.Is(err, context.Canceled) {
			log.Warn().Err(err).Str("container", r.ID[:12]).Msg("could not convert stats, skipping...")
			return ContainerStats{}, false
		}
		return stats, true
	})
}

func (s *ContainerService) ContainersUpdateAll(ctx context.Context, opts ...UpdateOption) error {
	containers, err := s.Daemon.ContainerList(ctx,
		container.ListOptions{
			All: true,
		},
	)
	if err != nil {
		return err
	}

	return s.containersUpdateLoop(
		ctx,
		containers,
		opts...,
	)
}

// ContainersUpdateDockman contID is expected to be a dockman container
//
// this will bypass the self update check
func (s *ContainerService) ContainersUpdateDockman(ctx context.Context, contID string) error {
	list, err := s.containerListByIDs(ctx, contID)
	if err != nil {
		return err
	}

	return s.containersUpdateLoop(ctx, list, WithSelfUpdate())
}

func (s *ContainerService) ContainersUpdateByContainerID(ctx context.Context, containerID ...string) error {
	list, err := s.containerListByIDs(ctx, containerID...)
	if err != nil {
		return err
	}

	return s.containersUpdateLoop(ctx, list)
}

// ContainersUpdateByImage finds all containers using the specified image,
// pulls the latest version of the image, and recreates the containers
// with the new image while preserving their configuration.
func (s *ContainerService) ContainersUpdateByImage(ctx context.Context, imageTag string) error {
	// Find all containers using this image
	containerFilters := filters.NewArgs()
	containerFilters.Add("ancestor", imageTag)

	containers, err := s.Daemon.ContainerList(ctx, container.ListOptions{
		All:     true, // Consider both running and stopped containers
		Filters: containerFilters,
	})
	if err != nil {
		return fmt.Errorf("failed to list containers for image %s: %w", imageTag, err)
	}

	return s.containersUpdateLoop(ctx, containers, WithForceUpdate())
}

type UpdateOption func(*containersUpdateConfig)

func parseOpts(opts ...UpdateOption) *containersUpdateConfig {
	var conf containersUpdateConfig
	for _, opt := range opts {
		opt(&conf)
	}
	return &conf
}

type containersUpdateConfig struct {
	AllowSelfUpdate bool
	ForceUpdate     bool
	// enable this to only notify on new images instead of updating containers
	NotifyOnlyMode bool

	// change update mode to opt in only, only containers with DockmanOptInUpdateLabel will be updated
	optInUpdates bool
}

// WithSelfUpdate allows, if a container is detected as being dockman,
// it will let it update instead of skipping
func WithSelfUpdate() UpdateOption {
	return func(c *containersUpdateConfig) { c.AllowSelfUpdate = true }
}

// WithForceUpdate bypasses the image update false label in a container,
// and updates it anyways
func WithForceUpdate() UpdateOption {
	return func(c *containersUpdateConfig) { c.ForceUpdate = true }
}

// WithOptInUpdate makes dockman update containers only with DockmanOptInUpdateLabel label present
func WithOptInUpdate() UpdateOption {
	return func(c *containersUpdateConfig) { c.optInUpdates = true }
}

// WithNotifyOnly updates the new img id in db
// and notifies user that an update is available
func WithNotifyOnly() UpdateOption {
	return func(c *containersUpdateConfig) { c.NotifyOnlyMode = true }
}

func WithConfig(conf *containersUpdateConfig) UpdateOption {
	return func(c *containersUpdateConfig) { c = conf }
}

// containersUpdateLoop Core updater,
// uses the image name in the containers to pull/update/healthcheck containers
func (s *ContainerService) containersUpdateLoop(
	ctx context.Context,
	containers []container.Summary,
	opts ...UpdateOption,
) error {
	updateConfig := parseOpts(opts...)
	if len(containers) == 0 {
		log.Info().Msgf("No containers to update. Nothing to do")
		return nil
	}

	var dockmanUpdate = func() {}
	for _, cur := range containers {
		if hasDockmanLabel(&cur) && s.hostname == LocalClient && !updateConfig.AllowSelfUpdate {
			// Store the update for later
			id := cur.ID
			dockmanUpdate = func() {
				log.Info().Msg("Starting dockman update")
				err := UpdateDockman(id, s.updaterUrl)
				if err != nil {
					log.Warn().Err(err).Msg("Failed to update Dockman container")
				}
			}
			// defer dockman update until all other containers are done
			continue
		}

		if updateConfig.optInUpdates && !hasUpdateLabel(&cur) {
			// opt in mode and container does not have DockmanOptInUpdateLabel
			continue
		}

		s.containerUpdate(ctx, cur, updateConfig)
	}

	log.Info().Msg("Cleaning up untagged dangling images...")

	pruneReport, err := s.ImagePruneUntagged(ctx)
	if err != nil {
		log.Warn().Err(err).Msg("failed to prune images")
	}

	if len(pruneReport.ImagesDeleted) > 0 {
		log.Info().Msgf("Pruned %d images, reclaimed %d bytes", len(pruneReport.ImagesDeleted), pruneReport.SpaceReclaimed)
	} else {
		log.Info().Msg("No images to prune")
	}

	dockmanUpdate()

	return nil
}

const DockmanOptInUpdateLabel = "dockman.update"

func hasUpdateLabel(c *container.Summary) bool {
	if _, ok := c.Labels[DockmanOptInUpdateLabel]; !ok {
		return false
	}
	return true
}

func (s *ContainerService) containerUpdate(
	ctx context.Context,
	cur container.Summary,
	updateConfig *containersUpdateConfig,
) {
	if hasDisableUpdateLabel(&cur) && !updateConfig.ForceUpdate {
		log.Warn().
			Str("id", cur.ID).Str("name", cur.Names[0]).
			Msg("updates are disabled for this container")
		return
	}

	imgTag := cur.Image

	updateAvailable, newImgID, err := s.ImageUpdateAvailable(ctx, imgTag)
	if err != nil {
		log.Warn().Str("cont", cur.Names[0]).
			Err(err).Msg("Failed to get image metadata, skipping...")
		return
	}

	if !updateAvailable {
		log.Info().
			Str("container", cur.Names[0]).Str("img", imgTag).
			Msgf("Image already up to date, skipping")
		return
	}

	if updateConfig.NotifyOnlyMode {
		err := s.imageUpdateStore.Save(&ImageUpdate{
			Host:      s.hostname,
			ImageID:   cur.ImageID,
			UpdateRef: newImgID,
		})
		if err != nil {
			log.Warn().Err(err).Str("img", imgTag).
				Msg("Failed to update image metadata")
		}

		// todo notify
		return
	}

	err = s.ImagePull(ctx, imgTag)
	if err != nil {
		log.Error().Err(err).Msg("Failed to pull image, skipping...")
		return
	}

	err = s.ContainerRecreate(ctx, imgTag, cur)
	if err != nil {
		// todo do not fail notify or save reason
		log.Error().Err(err).Msg("Failed to recreate container")
		return
	}
}

//////////////////////////////////////////////
// update guards and utils

const DockmanUpdateDisableLabel = "dockman.update.disable"

func hasDisableUpdateLabel(c *container.Summary) bool {
	return c.Labels[DockmanUpdateDisableLabel] == "true"
}

const DockmanContainerLabel = "dockman.container"

func hasDockmanLabel(cont *container.Summary) bool {
	value := cont.Labels[DockmanContainerLabel]
	return value == "true"
}

// UpdateDockman updates a running dockman container
// by pinging the sidecar updater service
//
// containerID is the id of the current dockman container
func UpdateDockman(containerID, updaterUrl string) error {
	fullUrl := fmt.Sprintf("%s/%s", updaterUrl, containerID)
	resp, err := http.Get(fullUrl)
	if err != nil {
		return fmt.Errorf("unable to send request updater: %w", err)
	}
	defer fileutil.Close(resp.Body)
	return nil
}

func (s *ContainerService) ContainerRecreate(ctx context.Context, imageTag string, oldContainer container.Summary) error {
	containerName := "Untagged"
	if len(oldContainer.Names) > 0 {
		containerName = strings.TrimPrefix(oldContainer.Names[0], "/")
	}

	log.Debug().Msgf("Processing container: %s (ID: %s)", containerName, oldContainer.ID[:12])

	inspectedData, err := s.Daemon.ContainerInspect(ctx, oldContainer.ID)
	if err != nil {
		return fmt.Errorf("failed to inspect container %s: %w", oldContainer.ID, err)
	}

	log.Debug().Msgf("Stopping old container %s...", containerName)
	if err := s.Daemon.ContainerStop(ctx, oldContainer.ID, container.StopOptions{}); err != nil {
		return fmt.Errorf("failed to stop container %s: %w", oldContainer.ID, err)
	}

	// if container was not running before create but do not start
	if !inspectedData.State.Running {
		if err := s.Daemon.ContainerRemove(ctx, oldContainer.ID, container.RemoveOptions{}); err != nil {
			return fmt.Errorf("failed to remove old container %s: %w", oldContainer.ID, err)
		}

		_, err := s.containerCreate(ctx, imageTag, containerName, inspectedData)
		if err != nil {
			return fmt.Errorf("failed to create container %s: %w", containerName, err)
		}

		return nil
	}

	newContainer, err := s.containerCreate(ctx, imageTag, containerName+"_updated", inspectedData)
	if err != nil {
		return s.containerRollbackToOldContainer(ctx, oldContainer.ID, containerName, err)
	}

	log.Debug().Msgf("Starting new container %s...", newContainer.ID[:12])
	if err = s.Daemon.ContainerStart(ctx, newContainer.ID, container.StartOptions{}); err != nil {

		err = s.Daemon.ContainerRemove(ctx, newContainer.ID, container.RemoveOptions{Force: true})
		if err != nil {
			return err
		}

		return s.containerRollbackToOldContainer(ctx, oldContainer.ID, containerName, err)
	}

	if err = s.ContainerHealthCheck(newContainer.ID, &inspectedData); err != nil {

		err = s.Daemon.ContainerRemove(ctx, newContainer.ID, container.RemoveOptions{Force: true})
		if err != nil {
			return err
		}

		return s.containerRollbackToOldContainer(ctx, oldContainer.ID, containerName, err)
	}

	// Health check passed - now we can safely remove old container and rename new one
	log.Debug().Msgf("Health check passed, finalizing update...")

	if err := s.Daemon.ContainerRemove(ctx, oldContainer.ID, container.RemoveOptions{Force: true}); err != nil {
		log.Warn().Msgf("Failed to remove old container: %v", err)
	}

	// Rename new container to original name
	if err := s.Daemon.ContainerRename(ctx, newContainer.ID, containerName); err != nil {
		log.Warn().Msgf("Failed to rename container to original name: %v", err)
	}

	log.Info().Msgf("Successfully updated container %s", containerName)
	return nil
}

func (s *ContainerService) containerRollbackToOldContainer(ctx context.Context, oldContainerID, containerName string, originalErr error) error {
	log.Warn().Msgf("Rolling back to old container %s", containerName)

	if err := s.Daemon.ContainerStart(ctx, oldContainerID, container.StartOptions{}); err != nil {
		return fmt.Errorf("rollback failed - cannot restart old container: %w (original error: %v)", err, originalErr)
	}

	log.Info().Msgf("Successfully rolled back to old container %s", containerName)
	return fmt.Errorf("update failed, rolled back to previous version: %w", originalErr)
}

func (s *ContainerService) containerCreate(
	ctx context.Context,
	imageTag, containerName string,
	inspectedData container.InspectResponse,
) (container.CreateResponse, error) {
	// Create a new container with the same configuration but the new image
	// The inspected config has the old image name, so we update it.
	log.Debug().Msgf("Creating new container %s with updated image...", containerName)
	inspectedData.Config.Image = imageTag
	newContainer, err := s.Daemon.ContainerCreate(ctx,
		inspectedData.Config,
		inspectedData.HostConfig,
		&network.NetworkingConfig{
			EndpointsConfig: inspectedData.NetworkSettings.Networks,
		},
		nil,
		containerName,
	)
	if err != nil {
		return container.CreateResponse{}, fmt.Errorf("failed to create new container for %s: %w", containerName, err)
	}

	return newContainer, nil
}

func (s *ContainerService) ContainerHealthCheck(containerID string, c *container.InspectResponse) error {
	log.Info().Msg("Starting healthcheck for container")

	eg := errgroup.Group{}
	eg.Go(func() error {
		err := s.containerHealthCheckUptime(containerID, c)
		if err != nil {
			return fmt.Errorf("uptime healthcheck failed\n%w", err)
		}
		return nil
	})

	eg.Go(func() error {
		err := s.containerHealthCheckPing(c)
		if err != nil {
			return fmt.Errorf("endpoint ping healthcheck failed\n%w", err)
		}
		return nil
	})

	if err := eg.Wait(); err != nil {
		return err
	}

	return nil
}

const DockmanHealthCheckUptimeLabel = "dockman.update.healthcheck.uptime"

func (s *ContainerService) containerHealthCheckUptime(containerID string, c *container.InspectResponse) error {
	lab := c.Config.Labels[DockmanHealthCheckUptimeLabel]
	expectedUptime, err := time.ParseDuration(lab)
	if err != nil {
		log.Warn().Msg("invalid time format skipping uptime check")
		return nil
	}

	// wait for 1.5 times the expected time, to skip any container shenanigans
	// on 1x the container uptime was not matching expectedUptime for some reason
	timer := time.NewTimer(time.Duration(float64(expectedUptime) * 1.5))
	defer timer.Stop()
	<-timer.C

	inspect, err := s.Daemon.ContainerInspect(context.Background(), containerID)
	if err != nil {
		return err
	}

	if !inspect.State.Running {
		return fmt.Errorf("container is not running")
	}

	startedAt, err := time.Parse(time.RFC3339Nano, inspect.State.StartedAt)
	if err != nil {
		return fmt.Errorf("failed to parse started time: %w", err)
	}

	uptime := time.Since(startedAt)
	if uptime < expectedUptime {
		return fmt.Errorf("container did not reach expected uptime of %s, container uptime: %s",
			expectedUptime.String(), uptime.String())
	}

	return nil
}

const DockmanHealthCheckPingLabel = "dockman.update.healthcheck.ping"
const DockmanHealthCheckPingTimeLabel = "dockman.update.healthcheck.time"

func (s *ContainerService) containerHealthCheckPing(c *container.InspectResponse) error {
	endpoint := c.Config.Labels[DockmanHealthCheckPingLabel]
	if endpoint == "" {
		log.Warn().Msg("healthcheck ping endpoint is empty skipping check")
		return nil
	}

	val := c.Config.Labels[DockmanHealthCheckPingTimeLabel]
	pingAfter, err := time.ParseDuration(val)
	if err != nil {
		log.Warn().Msg("invalid time format skipping ping endpoint check")
		return nil
	}

	timer := time.NewTimer(pingAfter)
	defer timer.Stop()
	<-timer.C

	resp, err := http.Get(endpoint)
	if err != nil {
		return fmt.Errorf("failed to ping %s: %w", endpoint, err)
	}
	defer fileutil.Close(resp.Body)

	// Check for a successful status code (in the 2xx range)
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("invalid http status code %d: %s, statusCode must be within 200 <= code < 300", resp.StatusCode, resp.Status)
	}

	return nil
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Image stuff

func (s *ContainerService) ImageList(ctx context.Context) ([]image.Summary, error) {
	return s.Daemon.ImageList(ctx, image.ListOptions{
		All:        true,
		SharedSize: true,
		Manifests:  true,
	})
}

func (s *ContainerService) ImageUpdateAvailable(ctx context.Context, imageName string) (bool, string, error) {
	// Get local image info
	localImages, err := s.Daemon.ImageList(ctx, image.ListOptions{
		Filters: filters.NewArgs(filters.Arg("reference", imageName)),
	})
	if err != nil {
		return false, "", err
	}

	var localDigest string
	for _, img := range localImages {
		localDigest = img.ID
	}

	// Get remote image info
	distributionInspect, err := s.Daemon.DistributionInspect(ctx, imageName, "")
	if err != nil {
		return false, "", err
	}
	remoteDigest := string(distributionInspect.Descriptor.Digest)

	localDigest = strings.TrimPrefix(localDigest, "sha256:")
	remoteDigest = strings.TrimPrefix(remoteDigest, "sha256:")

	return localDigest != remoteDigest, remoteDigest, nil
}

func (s *ContainerService) ImagePull(ctx context.Context, imageTag string) error {
	log.Info().Msg("Pulling latest image")

	reader, err := s.Daemon.ImagePull(ctx, imageTag, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("failed to pull image %s: %w", imageTag, err)
	}
	defer fileutil.Close(reader)

	// Copy the pull output to stdout to show progress
	if _, err := io.Copy(os.Stdout, reader); err != nil {
		return fmt.Errorf("failed to read image pull response: %w", err)
	}

	log.Info().Msg("Image pull complete")
	return nil
}

func (s *ContainerService) ImageDelete(ctx context.Context, imageId string) ([]image.DeleteResponse, error) {
	return s.Daemon.ImageRemove(ctx, imageId, image.RemoveOptions{})
}

func (s *ContainerService) ImagePruneUntagged(ctx context.Context) (image.PruneReport, error) {
	filter := filters.NewArgs()
	// removes dangling (untagged) mostly due to image being updated
	filter.Add("dangling", "true")

	prune, err := s.Daemon.ImagesPrune(ctx, filter)
	if err != nil {
		return prune, err
	}

	deletedIDs := ToMap(prune.ImagesDeleted, func(t image.DeleteResponse) string {
		return t.Deleted
	})

	err = s.imageUpdateStore.Delete(deletedIDs...)
	if err != nil {
		log.Warn().Err(err).Msg("failed to cleanup image update db")
	}

	return prune, nil
}

func (s *ContainerService) ImagePruneUnused(ctx context.Context) (image.PruneReport, error) {
	filter := filters.NewArgs()
	filter.Add("dangling", "false")
	// force remove all unused
	return s.Daemon.ImagesPrune(ctx, filter)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Network stuff

func (s *ContainerService) NetworksList(ctx context.Context) ([]network.Inspect, error) {
	list, err := s.Daemon.NetworkList(ctx, network.ListOptions{})
	if err != nil {
		return nil, err
	}

	var errs []error
	var result []network.Inspect
	for _, ref := range list {
		networkInspect, err2 := s.Daemon.NetworkInspect(ctx, ref.ID, network.InspectOptions{})
		if err2 != nil {
			errs = append(errs, err2)
			continue
		}
		result = append(result, networkInspect)
	}

	if errs != nil {
		return nil, fmt.Errorf("could not list networks: %v", errs)
	}

	return result, nil
}

func (s *ContainerService) NetworksCreate(ctx context.Context, name string) (network.CreateResponse, error) {
	return s.Daemon.NetworkCreate(ctx, name, network.CreateOptions{})
}

func (s *ContainerService) NetworksDelete(ctx context.Context, networkID string) error {
	return s.Daemon.NetworkRemove(ctx, networkID)
}

func (s *ContainerService) NetworksPrune(ctx context.Context) (network.PruneReport, error) {
	return s.Daemon.NetworksPrune(ctx, filters.NewArgs())
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Volume stuff

type VolumeInfo struct {
	*volume.Volume
	ContainerID        string
	ComposePath        string
	ComposeProjectName string
}

func (s *ContainerService) VolumesList(ctx context.Context) ([]VolumeInfo, error) {
	listResp, err := s.Daemon.VolumeList(ctx, volume.ListOptions{})
	if err != nil {
		return nil, err
	}

	if listResp.Volumes == nil {
		return []VolumeInfo{}, nil // Return empty slice instead of nil
	}

	diskUsage, err := s.Daemon.DiskUsage(ctx, types.DiskUsageOptions{
		Types: []types.DiskUsageObject{types.VolumeObject}, // fetch volumes only
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get disk usage data: %w", err)
	}

	// Add nil check for diskUsage.Volumes with zerolog debug logging
	tmpMap := make(map[string]*volume.Volume)
	if diskUsage.Volumes == nil {
		log.Debug().Msg("DiskUsage returned nil volumes slice")
	} else {
		tmpMap = make(map[string]*volume.Volume, len(diskUsage.Volumes))
		for _, l := range diskUsage.Volumes {
			tmpMap[l.Name] = l
		}
	}

	var volumeFilters []filters.KeyValuePair
	for i, vol := range listResp.Volumes {
		if vol == nil {
			continue
		}

		val, ok := tmpMap[vol.Name]
		if ok {
			// overwrite with more metadata from diskusage
			listResp.Volumes[i] = val
			volumeFilters = append(volumeFilters, filters.Arg("volume", val.Name))
			continue
		}

		volumeFilters = append(volumeFilters, filters.Arg("volume", vol.Name))
	}

	containers, err := s.Daemon.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filters.NewArgs(volumeFilters...),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}

	containersUsingVolumesMap := make(map[string][3]string)
	for _, c := range containers {
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
	for _, vol := range listResp.Volumes {
		if vol == nil {
			continue
		}

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

func (s *ContainerService) VolumesCreate(ctx context.Context, name string) (volume.Volume, error) {
	return s.Daemon.VolumeCreate(ctx, volume.CreateOptions{
		Name: name,
	})
}

func (s *ContainerService) VolumesDelete(ctx context.Context, volumeName string, force bool) error {
	return s.Daemon.VolumeRemove(ctx, volumeName, force)
}

func (s *ContainerService) VolumesPruneUnunsed(ctx context.Context) error {
	volResponse, err := s.Daemon.VolumeList(ctx, volume.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to get disk usage data: %w", err)
	}

	var volumeFilters []filters.KeyValuePair
	for _, vol := range volResponse.Volumes {
		volumeFilters = append(volumeFilters, filters.Arg("volume", vol.Name))
	}

	containers, err := s.Daemon.ContainerList(ctx, container.ListOptions{
		All:     true,
		Filters: filters.NewArgs(volumeFilters...),
	})
	if err != nil {
		return fmt.Errorf("failed to list containers: %w", err)
	}

	containersUsingVolumesMap := make(map[string]string)
	for _, c := range containers {
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
	for _, vol := range volResponse.Volumes {
		if _, found := containersUsingVolumesMap[vol.Name]; found {
			continue
		}

		err = s.Daemon.VolumeRemove(ctx, vol.Name, false)
		if err != nil {
			delErr = fmt.Errorf("%w\n%w", delErr, err)
		}
	}

	return delErr
}

func (s *ContainerService) VolumesPrune(ctx context.Context) error {
	prune, err := s.Daemon.VolumesPrune(ctx, filters.NewArgs())
	if err != nil {
		log.Debug().Any("report", prune).Msg("VolumesPrune result")
	}
	return err
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// utils

func (s *ContainerService) getAndFormatStats(ctx context.Context, info container.Summary) (ContainerStats, error) {
	contId := info.ID[:12]
	stats, err := s.Daemon.ContainerStats(ctx, info.ID, false)
	if err != nil {
		return ContainerStats{}, fmt.Errorf("failed to get stats for cont %s: %w", contId, err)
	}
	defer fileutil.Close(stats.Body)

	body, err := io.ReadAll(stats.Body)
	if err != nil {
		return ContainerStats{}, fmt.Errorf("failed to read body for cont %s: %w", contId, err)
	}
	var statsJSON container.StatsResponse
	if err := json.Unmarshal(body, &statsJSON); err != nil {
		return ContainerStats{}, fmt.Errorf("failed to unmarshal body for cont %s: %w", contId, err)
	}

	cpuPercent := formatCPU(statsJSON)
	rx, tx := formatNetwork(statsJSON)
	blkRead, blkWrite := formatDiskIO(statsJSON)

	return ContainerStats{
		ID:          contId,
		Name:        info.Names[0],
		CPUUsage:    cpuPercent,
		MemoryUsage: statsJSON.MemoryStats.Usage,
		MemoryLimit: statsJSON.MemoryStats.Limit,
		NetworkRx:   rx,
		NetworkTx:   tx,
		BlockRead:   blkRead,
		BlockWrite:  blkWrite,
	}, nil
}

func (s *ContainerService) ExecContainer(ctx context.Context, containerID string, cmd []string) (*types.HijackedResponse, error) {
	execConfig := container.ExecOptions{
		Cmd:          cmd,
		AttachStdout: true,
		AttachStderr: true,
		AttachStdin:  true,
		Tty:          true,
	}

	execCreateResp, err := s.Daemon.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create exec instance: %w", err)
	}

	execAttachOptions := container.ExecAttachOptions{
		Detach: false,
		Tty:    true,
	}

	hijackedResp, err := s.Daemon.ContainerExecAttach(ctx, execCreateResp.ID, execAttachOptions)
	if err != nil {
		return nil, fmt.Errorf("failed to attach to exec instance: %w", err)
	}

	err = s.Daemon.ContainerExecStart(ctx, execCreateResp.ID, container.ExecStartOptions{
		Detach: false,
		Tty:    true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start exec instance: %w", err)
	}

	return &hijackedResp, nil
}

func formatDiskIO(statsJSON container.StatsResponse) (uint64, uint64) {
	var blkRead, blkWrite uint64
	for _, bioEntry := range statsJSON.BlkioStats.IoServiceBytesRecursive {
		switch bioEntry.Op {
		case "read":
			blkRead += bioEntry.Value
		case "write":
			blkWrite += bioEntry.Value
		}
	}
	return blkRead, blkWrite
}

// Collect Network and Disk I/O
func formatNetwork(statsJSON container.StatsResponse) (uint64, uint64) {
	var rx, tx uint64
	for _, v := range statsJSON.Networks {
		rx += v.RxBytes
		tx += v.TxBytes
	}
	return rx, tx
}

func formatCPU(statsJSON container.StatsResponse) float64 {
	cpuDelta := float64(statsJSON.CPUStats.CPUUsage.TotalUsage - statsJSON.PreCPUStats.CPUUsage.TotalUsage)
	systemCpuDelta := float64(statsJSON.CPUStats.SystemUsage - statsJSON.PreCPUStats.SystemUsage)
	numberCPUs := float64(statsJSON.CPUStats.OnlineCPUs)
	if numberCPUs == 0.0 {
		numberCPUs = float64(len(statsJSON.CPUStats.CPUUsage.PercpuUsage))
	}

	var cpuPercent = 0.0
	// Avoid division by zero
	if systemCpuDelta > 0.0 && cpuDelta > 0.0 {
		cpuPercent = (cpuDelta / systemCpuDelta) * numberCPUs * 100.0
	}

	return cpuPercent
}

func parallelLoop[T any, R any](input []R, mapper func(R) (T, bool)) []T {
	contChan := make(chan T, len(input))

	var wg sync.WaitGroup
	for _, cont := range input {
		wg.Add(1)
		go func(i R) {
			defer wg.Done()
			res, ok := mapper(i)
			if ok {
				contChan <- res
			}
		}(cont)
	}

	go func() {
		wg.Wait()
		close(contChan)
	}()

	var result []T
	for c := range contChan {
		result = append(result, c)
	}

	return result
}

// ContainerStats holds metrics for a single Docker container.
type ContainerStats struct {
	ID          string
	Name        string
	CPUUsage    float64
	MemoryUsage uint64 // in bytes
	MemoryLimit uint64 // in bytes
	NetworkRx   uint64 // bytes received
	NetworkTx   uint64 // bytes sent
	BlockRead   uint64 // bytes read from block devices
	BlockWrite  uint64 // bytes written to block devices
}
