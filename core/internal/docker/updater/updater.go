package updater

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	containerSrv "github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/pkg/fileutil"

	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
)

type Service struct {
	srv            *containerSrv.Service
	hostname       string
	dockmanUpdater string
	Store          Store
}

func New(
	srv *containerSrv.Service,
	hostname string,
	url string,
	store Store,
) *Service {
	return &Service{
		srv:            srv,
		hostname:       hostname,
		dockmanUpdater: url,
		Store:          store,
	}
}

// access to the raw docker client
func (u *Service) cli() *client.Client {
	return u.srv.Client
}

func (u *Service) ContainersUpdateAll(ctx context.Context, opts ...UpdateOption) error {
	containers, err := u.cli().ContainerList(ctx,
		client.ContainerListOptions{
			All: true,
		},
	)
	if err != nil {
		return err
	}

	return u.containersUpdateLoop(
		ctx,
		containers.Items,
		opts...,
	)
}

// ContainersUpdateDockman contID is expected to be a dockman container
//
// this will bypass the self update check
func (u *Service) ContainersUpdateDockman(ctx context.Context, contID string) error {
	list, err := u.srv.ContainerListByIDs(ctx, contID)
	if err != nil {
		return err
	}

	return u.containersUpdateLoop(ctx, list, WithSelfUpdate())
}

func (u *Service) ContainersUpdateByContainerID(ctx context.Context, containerID ...string) error {
	list, err := u.srv.ContainerListByIDs(ctx, containerID...)
	if err != nil {
		return err
	}

	return u.containersUpdateLoop(ctx, list)
}

// ImagePuller pulls an image tag; injected so the caller decides HOW to
// pull (the compose CLI runner carries the host's registry credentials,
// unlike the bare daemon API).
type ImagePuller func(ctx context.Context, imageTag string) error

// ContainersForceUpdate pulls each container's image tag and recreates the
// container when the pull brought down a different image. Unlike the
// metadata-driven update loop it needs no registry digest lookup, and it
// reports failures instead of skipping silently — this backs the explicit
// per-container Update action in the UI. Progress lines go to out.
func (u *Service) ContainersForceUpdate(ctx context.Context, pull ImagePuller, out io.Writer, containerID ...string) error {
	list, err := u.srv.ContainerListByIDs(ctx, containerID...)
	if err != nil {
		return err
	}
	if len(list) == 0 {
		return fmt.Errorf("no containers found for the given ids")
	}

	report := func(format string, args ...any) {
		_, _ = fmt.Fprintf(out, format+"\r\n", args...)
	}

	var errs []error
	for _, cur := range list {
		name := strings.TrimPrefix(cur.Names[0], "/")
		imgTag := cur.Image

		// a reference without a repository tag (image removed/retagged, or
		// only ever built locally) cannot be pulled
		if imgTag == "" || strings.HasPrefix(imgTag, "sha256:") {
			report("%s: image %q has no pullable tag (locally built?), skipping", name, imgTag)
			errs = append(errs, fmt.Errorf("%s: image %q has no pullable tag", name, imgTag))
			continue
		}

		report("Pulling %s for %s...", imgTag, name)
		if err := pull(ctx, imgTag); err != nil {
			report("%s: pull failed: %v", name, err)
			errs = append(errs, fmt.Errorf("%s: pull %s: %w", name, imgTag, err))
			continue
		}

		localImages, err := u.cli().ImageList(ctx, client.ImageListOptions{
			Filters: client.Filters{}.Add("reference", imgTag),
		})
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: inspect %s: %w", name, imgTag, err))
			continue
		}

		newID := ""
		if len(localImages.Items) > 0 {
			newID = localImages.Items[0].ID
		}
		if newID == "" || newID == cur.ImageID {
			report("%s: image already up to date, container kept as is", name)
			log.Info().Str("container", name).Str("img", imgTag).
				Msg("image unchanged after pull, container kept as is")
			continue
		}

		report("Recreating %s on the new image...", name)
		if err := u.ContainerRecreate(ctx, imgTag, cur); err != nil {
			report("%s: recreate failed: %v", name, err)
			errs = append(errs, fmt.Errorf("%s: recreate: %w", name, err))
			continue
		}
		report("%s updated successfully", name)
	}
	return errors.Join(errs...)
}

// ContainersUpdateByImage finds all containers using the specified image,
// pulls the latest version of the image, and recreates the containers
// with the new image while preserving their configuration.
func (u *Service) ContainersUpdateByImage(ctx context.Context, imageTag string) error {
	// Find all containers using this image
	containerFilters := client.Filters{}
	containerFilters.Add("ancestor", imageTag)

	containers, err := u.cli().ContainerList(ctx, client.ContainerListOptions{
		All:     true, // Consider both running and stopped containers
		Filters: containerFilters,
	})
	if err != nil {
		return fmt.Errorf("failed to list containers for image %s: %w", imageTag, err)
	}

	return u.containersUpdateLoop(ctx, containers.Items, WithForceUpdate())
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
func (u *Service) containersUpdateLoop(
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
		if hasDockmanLabel(&cur) && u.hostname == containerSrv.LocalClient && !updateConfig.AllowSelfUpdate {
			// Store the update for later
			//id := cur.ID
			dockmanUpdate = func() {
				// todo
				//log.Info().Msg("Starting dockman update")
				//err := UpdateDockman(id, s.updaterUrl)
				//if err != nil {
				//	log.Warn().Err(err).Msg("Failed to update Dockman container")
				//}
			}
			// defer dockman update until all other containers are done
			continue
		}

		if updateConfig.optInUpdates && !hasUpdateLabel(&cur) {
			// opt in mode and container does not have DockmanOptInUpdateLabel
			continue
		}

		u.containerUpdate(ctx, cur, updateConfig)
	}

	log.Info().Msg("Cleaning up untagged dangling images...")

	pruneReport, err := u.srv.ImagePruneUntagged(ctx)
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

func (u *Service) containerUpdate(
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

	updateAvailable, _, err := u.ImageUpdateAvailable(ctx, imgTag)
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
		//err := s.imageUpdateStore.Save(&ImageUpdate{
		//	Host:      s.hostname,
		//	ImageID:   cur.ImageID,
		//	UpdateRef: newImgID,
		//})
		//if err != nil {
		//	log.Warn().Err(err).Str("img", imgTag).
		//		Msg("Failed to update image metadata")
		//}
		//
		//// todo notify
		//return
	}

	err = u.srv.ImagePull(ctx, imgTag, os.Stdout)
	if err != nil {
		log.Error().Err(err).Msg("Failed to pull image, skipping...")
		return
	}

	err = u.ContainerRecreate(ctx, imgTag, cur)
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

// ContainerRecreate swaps a container onto a (freshly pulled) image while
// keeping its whole configuration. A running container is replaced through a
// create-start-healthcheck-swap sequence with rollback to the old container
// on any failure; a stopped one is swapped in place and left stopped.
func (u *Service) ContainerRecreate(ctx context.Context, imageTag string, oldContainer container.Summary) error {
	containerName := "untagged"
	if len(oldContainer.Names) > 0 {
		containerName = strings.TrimPrefix(oldContainer.Names[0], "/")
	}
	log.Debug().Msgf("Recreating container %s (%s) on image %s", containerName, oldContainer.ID[:12], imageTag)

	inspected, err := u.cli().ContainerInspect(ctx, oldContainer.ID, client.ContainerInspectOptions{})
	if err != nil {
		return fmt.Errorf("failed to inspect container %s: %w", containerName, err)
	}
	inspectedData := inspected.Container

	wasRunning := inspectedData.State != nil && inspectedData.State.Running

	// container at rest: swap in place, leave it stopped
	if !wasRunning {
		if _, err := u.cli().ContainerRemove(ctx, oldContainer.ID, client.ContainerRemoveOptions{}); err != nil {
			return fmt.Errorf("failed to remove old container %s: %w", containerName, err)
		}
		if _, err := u.containerCreate(ctx, imageTag, containerName, inspectedData); err != nil {
			return fmt.Errorf("failed to create container %s: %w", containerName, err)
		}
		return nil
	}

	if _, err := u.cli().ContainerStop(ctx, oldContainer.ID, client.ContainerStopOptions{}); err != nil {
		return fmt.Errorf("failed to stop container %s: %w", containerName, err)
	}

	newContainer, err := u.containerCreate(ctx, imageTag, containerName+"_updated", inspectedData)
	if err != nil {
		return u.containerRollbackToOldContainer(ctx, oldContainer.ID, containerName, err)
	}

	if _, err = u.cli().ContainerStart(ctx, newContainer.ID, client.ContainerStartOptions{}); err != nil {
		if _, rmErr := u.cli().ContainerRemove(ctx, newContainer.ID, client.ContainerRemoveOptions{Force: true}); rmErr != nil {
			log.Warn().Err(rmErr).Msg("failed to clean up the replacement container")
		}
		return u.containerRollbackToOldContainer(ctx, oldContainer.ID, containerName, err)
	}

	if err = u.ContainerHealthCheck(newContainer.ID, &inspectedData); err != nil {
		if _, rmErr := u.cli().ContainerRemove(ctx, newContainer.ID, client.ContainerRemoveOptions{Force: true}); rmErr != nil {
			log.Warn().Err(rmErr).Msg("failed to clean up the replacement container")
		}
		return u.containerRollbackToOldContainer(ctx, oldContainer.ID, containerName, err)
	}

	// healthy: drop the old container and take over its name
	if _, err := u.cli().ContainerRemove(ctx, oldContainer.ID, client.ContainerRemoveOptions{Force: true}); err != nil {
		log.Warn().Err(err).Msgf("failed to remove old container %s", containerName)
	}
	if _, err := u.cli().ContainerRename(ctx, newContainer.ID, client.ContainerRenameOptions{NewName: containerName}); err != nil {
		log.Warn().Err(err).Msgf("failed to rename the new container to %s", containerName)
	}

	log.Info().Msgf("Successfully updated container %s", containerName)
	return nil
}

func (u *Service) containerRollbackToOldContainer(ctx context.Context, oldContainerID, containerName string, originalErr error) error {
	log.Warn().Msgf("Rolling back to old container %s", containerName)

	_, err := u.cli().ContainerStart(ctx, oldContainerID, client.ContainerStartOptions{})
	if err != nil {
		return fmt.Errorf("rollback failed - cannot restart old container: %w (original error: %v)", err, originalErr)
	}

	log.Info().Msgf("Successfully rolled back to old container %s", containerName)
	return fmt.Errorf("update failed, rolled back to previous version: %w", originalErr)
}

// containerCreate creates a new container carrying the old one's whole
// configuration (config, host config, network endpoints) on a new image.
func (u *Service) containerCreate(
	ctx context.Context,
	imageTag, containerName string,
	inspectedData container.InspectResponse,
) (client.ContainerCreateResult, error) {
	cfg := inspectedData.Config
	if cfg == nil {
		cfg = &container.Config{}
	}
	// the inspected config still names the old image
	newCfg := *cfg
	newCfg.Image = imageTag

	var netConfig *network.NetworkingConfig
	if inspectedData.NetworkSettings != nil {
		netConfig = &network.NetworkingConfig{
			EndpointsConfig: inspectedData.NetworkSettings.Networks,
		}
	}

	created, err := u.cli().ContainerCreate(ctx, client.ContainerCreateOptions{
		Name:             containerName,
		Config:           &newCfg,
		HostConfig:       inspectedData.HostConfig,
		NetworkingConfig: netConfig,
	})
	if err != nil {
		return client.ContainerCreateResult{}, fmt.Errorf("failed to create new container for %s: %w", containerName, err)
	}
	return created, nil
}

func (u *Service) ContainerHealthCheck(containerID string, c *container.InspectResponse) error {
	log.Info().Msg("Starting healthcheck for container")

	eg := errgroup.Group{}
	eg.Go(func() error {
		err := u.containerHealthCheckUptime(containerID, c)
		if err != nil {
			return fmt.Errorf("uptime healthcheck failed\n%w", err)
		}
		return nil
	})

	eg.Go(func() error {
		err := u.containerHealthCheckPing(c)
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

func (u *Service) containerHealthCheckUptime(containerID string, c *container.InspectResponse) error {
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

	inspect, err := u.cli().ContainerInspect(context.Background(), containerID, client.ContainerInspectOptions{})
	if err != nil {
		return err
	}

	state := inspect.Container.State
	if !state.Running {
		return fmt.Errorf("container is not running")
	}

	startedAt, err := time.Parse(time.RFC3339Nano, state.StartedAt)
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

func (u *Service) containerHealthCheckPing(c *container.InspectResponse) error {
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

func (u *Service) ImageUpdateAvailable(ctx context.Context, imageName string) (bool, string, error) {
	// Get local image info
	localImages, err := u.cli().ImageList(ctx, client.ImageListOptions{
		Filters: client.Filters{}.Add("reference", imageName),
	})
	if err != nil {
		return false, "", err
	}

	var localDigest string
	for _, img := range localImages.Items {
		localDigest = img.ID
	}

	// Get remote image info
	distributionInspect, err := u.cli().DistributionInspect(ctx, imageName, client.DistributionInspectOptions{})
	if err != nil {
		return false, "", err
	}
	remoteDigest := string(distributionInspect.Descriptor.Digest)

	localDigest = strings.TrimPrefix(localDigest, "sha256:")
	remoteDigest = strings.TrimPrefix(remoteDigest, "sha256:")

	return localDigest != remoteDigest, remoteDigest, nil
}
