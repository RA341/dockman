package cleaner

import (
	"context"
	"fmt"

	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/dustin/go-humanize"
	"github.com/go-co-op/gocron/v2"
	"github.com/moby/moby/api/types/network"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type GetService func(host string) (*docker.Service, error)

type Service struct {
	cont  GetService
	store Store
	log   zerolog.Logger

	taskList syncmap.Map[string, gocron.Job]
	schd     gocron.Scheduler
}

func NewService(cont GetService, store Store) *Service {
	s := &Service{
		cont:  cont,
		store: store,
		log:   log.With().Str("service", "docker cleaner").Logger(),
	}

	schd, err := gocron.NewScheduler()
	if err != nil {
		s.log.Fatal().Err(err).Msg("Failed to initialize task runner")
	}
	s.schd = schd
	schd.Start()

	s.StartEnabled()

	return s
}

func (s *Service) cli(hostname string) (*container.Service, error) {
	cont, err := s.cont(hostname)
	if err != nil {
		return nil, err
	}
	return cont.Container, nil
}

type DiskSpace struct {
	Containers string
	Image      string
	Volumes    string
	BuildCache string
}

func (s *Service) GetSystemStorage(ctx context.Context, hostname string) (client.DiskUsageResult, []network.Inspect, error) {
	cli, err := s.cli(hostname)
	if err != nil {
		return client.DiskUsageResult{}, nil, err
	}

	usage, err := cli.Cli().DiskUsage(ctx, client.DiskUsageOptions{
		Containers: true,
		Images:     true,
		BuildCache: true,
		Volumes:    true,
		Verbose:    true,
	})
	if err != nil {
		return client.DiskUsageResult{}, nil, err
	}

	list, err := cli.NetworksList(ctx)
	if err != nil {
		return client.DiskUsageResult{}, nil, err
	}

	return usage, list, nil
}

func (s *Service) RunOnce(ctx context.Context, host string, pruneConfig *PruneConfig) error {
	log.Debug().Msg("running manual docker cleaner")

	cli, err := s.cli(host)
	if err != nil {
		return fmt.Errorf("could find docker client: %w", err)
	}

	var res PruneResult
	res.Host = host

	s.Prune(ctx, pruneConfig, cli.Client, &res)
	err = s.store.AddResult(&res)
	if err != nil {
		s.log.Err(err).Msg("Failed to add result for cleaner")
	}

	return nil
}

func (s *Service) StartEnabled() {
	enabled, err := s.store.GetEnabled()
	if err != nil {
		log.Warn().Err(err).Msg("Failed to get enabled cleaner configs")
		return
	}

	for _, cf := range enabled {
		err := s.RunWithScheduler(cf.Host, false)
		if err != nil {
			log.Warn().Err(err).Str("host", cf.Host).Msg("Failed to run cleaner")
		}
	}
}

func (s *Service) RunWithScheduler(host string, edit bool) error {
	getConfig, err := s.store.GetConfig(host)
	if err != nil {
		return err
	}
	if !getConfig.Enabled {
		return fmt.Errorf("enabled cleaner run")
	}

	var jb gocron.Job
	jobDef := gocron.DurationJob(getConfig.Interval)
	task := gocron.NewTask(s.clean, host)

	val, ok := s.taskList.Load(host)
	if ok {
		if !edit {
			return val.RunNow()
		}

		jb, err = s.schd.Update(val.ID(), jobDef, task)
	} else {
		jb, err = s.schd.NewJob(jobDef, task)
	}
	if err != nil {
		return err
	}

	s.taskList.Store(host, jb)
	return jb.RunNow()
}

func (s *Service) clean(ctx context.Context, host string) {
	log.Debug().Msg("running automated docker cleaner")

	result := PruneResult{
		Host: host,
	}

	pruneConfig, err := s.store.GetConfig(host)
	if err != nil {
		s.log.Err(err).Msg("failed to get docker config")
		result.Err = err.Error()
	}

	if !pruneConfig.Enabled {
		return
	}

	cli, err := s.cli(host)
	if err != nil {
		result.Err = err.Error()
		return
	}

	s.Prune(ctx, &pruneConfig, cli.Client, &result)

	err = s.store.AddResult(&result)
	if err != nil {
		s.log.Err(err).Msg("Failed to add result for cleaner")
		return
	}
}

func (s *Service) Prune(
	ctx context.Context,
	opts *PruneConfig,
	cli *client.Client,
	result *PruneResult,
) {
	if opts.Containers {
		result.Containers = s.pruneContainers(ctx, cli)
	}

	if opts.Images {
		result.Images = s.pruneImages(ctx, cli)
	}

	if opts.BuildCache {
		result.BuildCache = s.pruneBuildCache(ctx, cli)
	}

	if opts.Networks {
		result.Networks = s.pruneNetworks(ctx, cli)
	}

	if opts.Volumes {
		result.Volumes = s.pruneVolumes(ctx, cli)
	}
}

func (s *Service) pruneVolumes(ctx context.Context, cli *client.Client) OpResult {
	prune, err := cli.VolumePrune(ctx, client.VolumePruneOptions{
		All: true,
	})
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

	return res
}

func (s *Service) pruneNetworks(ctx context.Context, cli *client.Client) OpResult {
	networkReport, err := cli.NetworkPrune(ctx, client.NetworkPruneOptions{})

	var res OpResult
	if err != nil {
		res.Err = err.Error()
	} else {
		res.Success = fmt.Sprintf("Deleted Networks: %d", len(networkReport.Report.NetworksDeleted))
	}

	return res
}

func (s *Service) pruneBuildCache(ctx context.Context, cli *client.Client) OpResult {
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

	return res
}

func (s *Service) pruneImages(ctx context.Context, cli *client.Client) OpResult {
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

	return res
}

func (s *Service) pruneContainers(ctx context.Context, cli *client.Client) OpResult {
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

	return res
}
