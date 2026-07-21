package container

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/docker/compose/v5/pkg/api"
	"github.com/moby/moby/api/types/image"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
	diveImg "github.com/wagoodman/dive/dive/image"
	"github.com/wagoodman/dive/dive/image/docker"
)

func (s *Service) ImageList(ctx context.Context) ([]image.Summary, error) {
	list, err := s.Client.ImageList(ctx, client.ImageListOptions{
		All:        true,
		SharedSize: true,
		Manifests:  true,
	})
	if err != nil {
		return nil, err
	}
	return list.Items, err
}

func (s *Service) ImageInspect(ctx context.Context, id string) (client.ImageInspectResult, client.ImageHistoryResult, error) {
	hist, err := s.Cli().ImageHistory(ctx, id)
	if err != nil {
		return client.ImageInspectResult{}, client.ImageHistoryResult{}, err
	}

	inspect, err := s.Cli().ImageInspect(
		ctx,
		id,
		client.ImageInspectWithManifests(true),
	)
	if err != nil {
		return client.ImageInspectResult{}, client.ImageHistoryResult{}, err
	}

	return inspect, hist, nil
}

// ImageContainer describes one container created from a given image.
type ImageContainer struct {
	ID             string
	Name           string
	State          string
	ComposeProject string
}

// ImageContainers returns every container created from the given image. The
// image inspect data does not carry this, so it is derived from the container
// list filtered by the image "ancestor".
func (s *Service) ImageContainers(ctx context.Context, imageID string) ([]ImageContainer, error) {
	filters := client.Filters{}
	filters.Add("ancestor", imageID)

	resp, err := s.Client.ContainerList(ctx, client.ContainerListOptions{
		All:     true,
		Filters: filters,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers for image %s: %w", imageID, err)
	}

	out := make([]ImageContainer, 0, len(resp.Items))
	for _, c := range resp.Items {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		out = append(out, ImageContainer{
			ID:             c.ID,
			Name:           name,
			State:          string(c.State),
			ComposeProject: c.Labels[api.ProjectLabel],
		})
	}

	return out, nil
}

func (s *Service) ImagePull(ctx context.Context, imageTag string, writer io.Writer) error {
	log.Info().Msg("Pulling latest image")

	reader, err := s.Client.ImagePull(ctx, imageTag, client.ImagePullOptions{})
	if err != nil {
		return fmt.Errorf("failed to pull image %s: %w", imageTag, err)
	}
	defer fileutil.Close(reader)

	// Copy the pull output to stdout to show progress
	_, err = io.Copy(writer, reader)
	if err != nil {
		return fmt.Errorf("failed to read image pull response: %w", err)
	}

	log.Info().Msg("Image pull complete")
	return nil
}

func (s *Service) ImageDelete(ctx context.Context, imageId string) ([]image.DeleteResponse, error) {
	remove, err := s.Client.ImageRemove(ctx, imageId, client.ImageRemoveOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to delete image %s: %w", imageId, err)
	}
	return remove.Items, err
}

// ImageUsageCounts returns, per image ID, how many containers (running or
// stopped) were created from it. The image list's own Containers field is
// unreliable (-1 when not computed, 0 on some image stores), while image
// prune decides from the daemon's actual reference counts — so usage comes
// from the disk-usage report (the daemon-computed count) complemented by the
// container list, and matches what prune would really do.
func (s *Service) ImageUsageCounts(ctx context.Context) (map[string]int64, error) {
	counts := make(map[string]int64)

	diskUsage, err := s.Client.DiskUsage(ctx, client.DiskUsageOptions{
		Images:  true,
		Verbose: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get disk usage data: %w", err)
	}
	for _, img := range diskUsage.Images.Items {
		if img.Containers > 0 {
			counts[img.ID] = img.Containers
		}
	}

	// an image missing from disk usage (or reported without a computed count)
	// must still show as used while a container references it
	resp, err := s.Client.ContainerList(ctx, client.ContainerListOptions{All: true})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers: %w", err)
	}
	perID := make(map[string]int64, len(resp.Items))
	for _, c := range resp.Items {
		perID[c.ImageID]++
	}
	for id, n := range perID {
		if n > counts[id] {
			counts[id] = n
		}
	}

	return counts, nil
}

// ImageDescendantContainers reports how many containers were created from the
// image or from any image built on top of it, via the daemon's "ancestor"
// filter. This catches base/parent images with no direct container: prune
// keeps them because a dependent child image is still in use, so they must
// not be reported as unused.
func (s *Service) ImageDescendantContainers(ctx context.Context, imageID string) (int64, error) {
	filters := client.Filters{}
	filters.Add("ancestor", imageID)

	resp, err := s.Client.ContainerList(ctx, client.ContainerListOptions{
		All:     true,
		Filters: filters,
	})
	if err != nil {
		return 0, fmt.Errorf("failed to list containers for image %s: %w", imageID, err)
	}
	return int64(len(resp.Items)), nil
}

func (s *Service) ImagePruneUntagged(ctx context.Context) (image.PruneReport, error) {
	filter := client.Filters{}
	// removes dangling (untagged) mostly due to image being updated
	filter.Add("dangling", "true")

	prune, err := s.Client.ImagePrune(ctx, client.ImagePruneOptions{Filters: filter})
	if err != nil {
		return prune.Report, err
	}

	//deletedIDs := listutils.ToMap(prune.Report.ImagesDeleted, func(t image.DeleteResponse) string {
	//	return t.Deleted
	//})
	// todo
	//err = s.imageUpdateStore.Delete(deletedIDs...)
	//if err != nil {
	//	log.Warn().Err(err).Msg("failed to cleanup image update db")
	//}

	return prune.Report, nil
}

func (s *Service) ImagePruneUnused(ctx context.Context) (image.PruneReport, error) {
	filter := client.Filters{}
	filter.Add("dangling", "false")
	// force remove all unused
	prune, err := s.Client.ImagePrune(ctx, client.ImagePruneOptions{Filters: filter})
	if err != nil {
		return prune.Report, err
	}
	return prune.Report, nil
}

// ImageDive todo image dive
// support docker only; dockman doesn't support other runtimes
// the struct can be huge to send over the wire
func (s *Service) ImageDive(ctx context.Context, imageId string) (*diveImg.AnalysisResult, error) {
	body, err := s.Client.ImageSave(ctx, []string{imageId})
	if err != nil {
		return nil, fmt.Errorf("failed to extract image data %s: %w", imageId, err)
	}
	// body streams the whole image tar (can be many GB); it must be closed or
	// the response body and the daemon-side export stay pinned in memory.
	defer fileutil.Close(body)

	parse, err := docker.NewImageArchive(body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse image archive %s: %w", imageId, err)
	}

	img, err := parse.ToImage()
	if err != nil {
		return nil, err
	}

	analysis, err := img.Analyze()
	if err != nil {
		return nil, fmt.Errorf("analyzing image %q: %w", imageId, err)
	}

	return analysis, nil
}
