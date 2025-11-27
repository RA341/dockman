package cleaner

import (
	"context"
	"fmt"
	"time"

	"github.com/docker/docker/api/types/build"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/client"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

type PruneConfig struct {
	gorm.Model
	Enabled  bool
	Interval time.Duration

	Volumes    bool
	Networks   bool
	Images     bool
	Containers bool
	BuildCache bool
}

type OpResult struct {
	Success string
	Err     string
}

type PruneResult struct {
	gorm.Model
	Volumes    OpResult `gorm:"embedded;embeddedPrefix:volumes_"`
	Networks   OpResult `gorm:"embedded;embeddedPrefix:networks_"`
	Images     OpResult `gorm:"embedded;embeddedPrefix:images_"`
	Containers OpResult `gorm:"embedded;embeddedPrefix:containers_"`
	BuildCache OpResult `gorm:"embedded;embeddedPrefix:build_cache_"`
}

type cliFn func() *client.Client

type Service struct {
	cli   cliFn
	store Store
	log   zerolog.Logger
	task  *Scheduler
}

func NewService(cli cliFn, store Store) *Service {
	s := &Service{
		cli:   cli,
		store: store,
		log:   log.With().Str("service", "docker cleaner").Logger(),
	}
	err := s.store.InitConfig()
	if err != nil {
		s.log.Fatal().Err(err).Msg("Failed to initialize default cleaner config")
	}

	return s
}
func (s *Service) Trigger() {

}

func (s *Service) Run() {
	config, err := s.store.GetConfig()
	if err != nil {
		s.log.Err(err).Msg("Failed to get config for cleaner")
		return
	}

	if !config.Enabled {
		s.log.Info().Any("config", config).Msg("cleaner is disabled, enable in config")
		return
	}

	if s.task != nil {
		msg := s.task.Manual()
		s.log.Info().Msg(msg)
		return
	}

	s.task = NewScheduler(
		func(ctx context.Context) {
			cli := s.cli()
			result := PruneResult{}

			s.Prune(ctx, config, cli, &result)

			err = s.store.AddResult(&result)
			if err != nil {
				s.log.Err(err).Msg("Failed to add result for cleaner")
				return
			}
		},
		config.Interval)
}

func (s *Service) Prune(
	ctx context.Context,
	opts PruneConfig,
	cli *client.Client,
	result *PruneResult,
) {

	if opts.Containers {
		containerReport, err := cli.ContainersPrune(ctx, filters.Args{})
		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf(
				"Deleted Containers: %d, Space Reclaimed: %d\n",
				len(containerReport.ContainersDeleted),
				containerReport.SpaceReclaimed,
			)
		}

		result.Containers = res
	}

	if opts.Images {
		imageFilters := filters.NewArgs()
		imageFilters.Add("dangling", "false")

		imageReport, err := cli.ImagesPrune(ctx, imageFilters)
		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf(
				"Deleted Images: %d, Space Reclaimed: %d\n",
				len(imageReport.ImagesDeleted),
				imageReport.SpaceReclaimed,
			)
		}
		result.Images = res
	}

	if opts.BuildCache {
		buildCacheOpts := build.CachePruneOptions{
			All: true,
		}
		buildCacheReport, err := cli.BuildCachePrune(ctx, buildCacheOpts)

		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf(
				"Deleted Build Cache Keys: %d, Space Reclaimed: %d\n",
				len(buildCacheReport.CachesDeleted),
				buildCacheReport.SpaceReclaimed,
			)
		}

		result.BuildCache = res
	}

	if opts.Networks {
		networkReport, err := cli.NetworksPrune(ctx, filters.Args{})

		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf("Deleted Networks: %d\n", len(networkReport.NetworksDeleted))
		}

		result.Networks = res
	}

	if opts.Volumes {
		prune, err := cli.VolumesPrune(ctx, filters.Args{})
		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf(
				"Deleted Networks: %d\nSpace Reclaimed:%d",
				len(prune.VolumesDeleted),
				prune.SpaceReclaimed,
			)
		}

		result.Volumes = res
	}
}
