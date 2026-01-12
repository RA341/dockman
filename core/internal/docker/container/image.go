package container

import (
	"context"
	"fmt"
	"io"

	"github.com/RA341/dockman/pkg/fileutil"
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

func (s *Service) ImagePruneUntagged(ctx context.Context) (image.PruneReport, error) {
	filter := client.Filters{}
	// removes dangling (untagged) mostly due to image being updated
	filter.Add("dangling", "true")

	prune, err := s.Client.ImagePrune(ctx, client.ImagePruneOptions{})
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
