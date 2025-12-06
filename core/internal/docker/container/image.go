package container

import (
	"context"
	"fmt"
	"io"
	"os"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/moby/moby/api/types/image"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
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

// ImagePull todo pass in a io.writer for more info
func (s *Service) ImagePull(ctx context.Context, imageTag string) error {
	log.Info().Msg("Pulling latest image")

	reader, err := s.Client.ImagePull(ctx, imageTag, client.ImagePullOptions{})
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
