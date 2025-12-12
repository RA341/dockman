package cleaner

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/dustin/go-humanize"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/moby/moby/client"
)

type cliFn func() *client.Client

type Service struct {
	cli      cliFn
	store    Store
	log      zerolog.Logger
	task     *Scheduler
	taskLock sync.Mutex
	// use a closure to get the upto date client
	hostname func() string
}

func NewService(cli cliFn, hostname func() string, store Store) *Service {
	s := &Service{
		cli:      cli,
		hostname: hostname,
		store:    store,
		log:      log.With().Str("service", "docker cleaner").Logger(),
	}
	err := s.store.InitConfig()
	if err != nil {
		s.log.Fatal().Err(err).Msg("Failed to initialize default cleaner config")
	}

	return s
}

func (s *Service) Run() error {
	config, err := s.store.GetConfig()
	if err != nil {
		return fmt.Errorf("failed to get config for cleaner: %w", err)
	}
	if !config.Enabled {
		return fmt.Errorf("cleaner is disabled, enable in config")
	}

	if !s.isTaskSetup() {
		s.setupTask(config.Interval)
	}

	msg := s.task.Manual()
	s.log.Info().Msg(msg)

	return nil
}

func (s *Service) GetTask() *Scheduler {
	s.taskLock.Lock()
	defer s.taskLock.Unlock()

	return s.task
}

func (s *Service) isTaskSetup() bool {
	s.taskLock.Lock()
	defer s.taskLock.Unlock()

	return s.task != nil
}

func (s *Service) setupTask(interval time.Duration) {
	s.taskLock.Lock()
	defer s.taskLock.Unlock()

	s.task = NewScheduler(
		func(ctx context.Context) {
			pruneConfig, err := s.store.GetConfig()
			if err != nil {
				s.log.Err(err).Msg("failed to get docker config")
			}

			if !pruneConfig.Enabled {
				s.GetTask().Stop()
				return
			}

			cli := s.cli()
			result := PruneResult{}
			result.Host = s.hostname()

			s.Prune(ctx, pruneConfig, cli, &result)

			err = s.store.AddResult(&result)
			if err != nil {
				s.log.Err(err).Msg("Failed to add result for cleaner")
				return
			}
		},
		interval,
	)
}

type DiskSpace struct {
	Containers string
	Image      string
	Volumes    string
	BuildCache string
}

func (s *Service) SystemStorage() (client.DiskUsageResult, error) {
	ctx := context.Background()

	usage, err := s.cli().DiskUsage(ctx, client.DiskUsageOptions{
		Containers: true,
		Images:     true,
		BuildCache: true,
		Volumes:    true,
		Verbose:    true,
	})
	if err != nil {
		return client.DiskUsageResult{}, err
	}

	return usage, nil
}

func (s *Service) Prune(
	ctx context.Context,
	opts PruneConfig,
	cli *client.Client,
	result *PruneResult,
) {
	if opts.Containers {
		containerReport, err := cli.ContainerPrune(ctx, client.ContainerPruneOptions{})
		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf(
				"Deleted Containers: %d\nReclaimed: %s\n",
				len(containerReport.Report.ContainersDeleted),
				humanize.Bytes(containerReport.Report.SpaceReclaimed),
			)
		}

		result.Containers = res
	}

	if opts.Images {
		imageFilters := client.Filters{}
		// all unused images
		imageFilters.Add("dangling", "false")

		imageReport, err := cli.ImagePrune(ctx, client.ImagePruneOptions{
			Filters: imageFilters,
		})
		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf(
				"Deleted Images: %d\nReclaimed: %s\n",
				len(imageReport.Report.ImagesDeleted),
				humanize.Bytes(imageReport.Report.SpaceReclaimed),
			)
		}
		result.Images = res
	}

	if opts.BuildCache {
		buildCacheOpts := client.BuildCachePruneOptions{
			// todo proper filters
			//All: true,
			//Filters: nil,
		}
		rep, err := cli.BuildCachePrune(ctx, buildCacheOpts)

		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			buildCacheReport := rep.Report
			res.Success = fmt.Sprintf(
				"Deleted Build Cache: %d\nReclaimed: %s\n",
				len(buildCacheReport.CachesDeleted),
				humanize.Bytes(buildCacheReport.SpaceReclaimed),
			)
		}

		result.BuildCache = res
	}

	if opts.Networks {
		networkReport, err := cli.NetworkPrune(ctx, client.NetworkPruneOptions{})

		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf("Deleted Networks: %d", len(networkReport.Report.NetworksDeleted))
		}

		result.Networks = res
	}

	if opts.Volumes {
		prune, err := cli.VolumePrune(ctx, client.VolumePruneOptions{})
		var res OpResult
		if err != nil {
			res.Err = err.Error()
		} else {
			res.Success = fmt.Sprintf(
				"Deleted Volumes: %d\nReclaimed: %s",
				len(prune.Report.VolumesDeleted),
				humanize.Bytes(prune.Report.SpaceReclaimed),
			)
		}

		result.Volumes = res
	}
}
