package docker

import (
	"context"
	"fmt"
	"github.com/compose-spec/compose-go/v2/cli"
	"github.com/compose-spec/compose-go/v2/types"
	"github.com/docker/cli/cli/command"
	"github.com/docker/cli/cli/flags"
	"github.com/docker/compose/v2/pkg/api"
	"github.com/docker/compose/v2/pkg/compose"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/rs/zerolog/log"
	"io"
	"maps"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
)

// reference: https://github.com/portainer/portainer/blob/develop/pkg/libstack/compose/composeplugin.go

type ComposeService struct {
	composeRoot      *string
	updateBaseImage  *string
	containerService *ContainerService
	syncer           Syncer
}

func NewComposeService(composeRoot, baseImage *string, client *ContainerService, syncer Syncer) *ComposeService {
	return &ComposeService{
		composeRoot:      composeRoot,
		updateBaseImage:  baseImage,
		containerService: client,
		syncer:           syncer,
	}
}

func (s *ComposeService) Up(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	if err := s.syncer.Sync(ctx, project); err != nil {
		return err
	}

	upOpts := api.UpOptions{
		Create: api.CreateOptions{
			Build:                &api.BuildOptions{Services: services},
			Services:             services,
			RemoveOrphans:        false,
			Recreate:             api.RecreateForce, // Force recreation of the specified services
			RecreateDependencies: api.RecreateNever, // Do not recreate dependencies
			Inherit:              true,
			AssumeYes:            true,
		},
		Start: api.StartOptions{
			//OnExit:   api.CascadeStop,
			Services: services,
		},
	}

	if err := composeClient.Up(ctx, project, upOpts); err != nil {
		return fmt.Errorf("compose up operation failed: %w", err)
	}

	return nil
}

func (s *ComposeService) Down(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	downOpts := api.DownOptions{
		Services: services,
	}
	if err := composeClient.Down(ctx, project.Name, downOpts); err != nil {
		return fmt.Errorf("compose down operation failed: %w", err)
	}
	return nil
}

func (s *ComposeService) Stop(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	stopOpts := api.StopOptions{
		Services: services,
	}
	if err := composeClient.Stop(ctx, project.Name, stopOpts); err != nil {
		return fmt.Errorf("compose stop operation failed: %w", err)
	}
	return nil
}

func (s *ComposeService) Restart(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	// A restart might involve changes to the compose file, so we sync first.
	if err := s.syncer.Sync(ctx, project); err != nil {
		return err
	}

	restartOpts := api.RestartOptions{
		Services: services,
	}
	if err := composeClient.Restart(ctx, project.Name, restartOpts); err != nil {
		return fmt.Errorf("compose restart operation failed: %w", err)
	}
	return nil
}

func (s *ComposeService) Pull(ctx context.Context, project *types.Project, composeClient api.Service) error {
	pullOpts := api.PullOptions{}
	if err := composeClient.Pull(ctx, project, pullOpts); err != nil {
		return fmt.Errorf("compose pull operation failed: %w", err)
	}
	return nil
}

func (s *ComposeService) Update(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	beforeImages, err := s.getProjectImageDigests(ctx, project)
	if err != nil {
		return fmt.Errorf("failed to get image info before pull: %w", err)
	}

	if err = s.Pull(ctx, project, composeClient); err != nil {
		return err
	}

	afterImages, err := s.getProjectImageDigests(ctx, project)
	if err != nil {
		return fmt.Errorf("failed to get image info after pull: %w", err)
	}

	// Compare digests to see if anything changed.
	if reflect.DeepEqual(beforeImages, afterImages) {
		log.Info().Str("stack", project.Name).Msg("No new images were downloaded, stack is up to date")
		return nil
	}

	log.Info().Str("stack", project.Name).Msg("New images were downloaded, updating stack...")
	// If images changed, run Up to recreate the containers with the new images.
	if err = s.Up(ctx, project, composeClient, services...); err != nil {
		return err
	}

	return nil
}

// ListStack The `all` parameter controls whether to show stopped containers.
func (s *ComposeService) ListStack(ctx context.Context, project *types.Project, all bool) ([]container.Summary, error) {
	containerFilters := filters.NewArgs()
	projectLabel := fmt.Sprintf("%s=%s", api.ProjectLabel, project.Name)
	containerFilters.Add("label", projectLabel)

	result, err := s.containerService.ListContainers(ctx, container.ListOptions{
		All:     all,
		Filters: containerFilters,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers for project '%s': %w", project.Name, err)
	}

	return result, nil
}

func (s *ComposeService) StatStack(ctx context.Context, project *types.Project) ([]ContainerStats, error) {
	// Get the list of running containers for the stack.
	stackList, err := s.ListStack(ctx, project, false) // `false` for only running
	if err != nil {
		return nil, err
	}

	result := s.containerService.GetStatsFromContainerList(ctx, stackList)
	return result, nil
}

func (s *ComposeService) getProjectImageDigests(ctx context.Context, project *types.Project) (map[string]string, error) {
	digests := make(map[string]string)

	for serviceName, service := range project.Services {
		if service.Image == "" {
			continue
		}

		imageInspect, err := s.containerService.daemon.ImageInspect(ctx, service.Image)
		if err != nil {
			// Image might not exist locally yet
			digests[serviceName] = ""
			continue
		}

		// Use RepoDigests if available, otherwise use the image ID
		if len(imageInspect.RepoDigests) > 0 {
			digests[serviceName] = imageInspect.RepoDigests[0]
		} else {
			digests[serviceName] = imageInspect.ID
		}
	}

	return digests, nil
}

func (s *ComposeService) LoadComposeClient(outputStream io.Writer, inputStream io.ReadCloser) (api.Service, error) {
	dockerCli, err := command.NewDockerCli(
		command.WithAPIClient(s.containerService.daemon),
		command.WithCombinedStreams(outputStream),
		command.WithInputStream(inputStream),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create cli client to docker for compose: %w", err)
	}

	clientOpts := &flags.ClientOptions{}
	if err = dockerCli.Initialize(clientOpts); err != nil {
		return nil, err
	}

	return compose.NewComposeService(dockerCli), nil
}

func (s *ComposeService) LoadProject(ctx context.Context, filename string) (*types.Project, error) {
	filename = filepath.Join(*s.composeRoot, filename)
	// will be the parent dir of the compose file else equal to compose root
	workingDir := filepath.Dir(filename)

	options, err := cli.NewProjectOptions(
		[]string{filename},
		// important maintain this order to load .env properly
		// compose-root -> global .env -> os envs -> sub dir .envs
		cli.WithWorkingDirectory(*s.composeRoot),
		cli.WithEnvFiles(),
		cli.WithOsEnv,
		cli.WithDotEnv,
		cli.WithDefaultProfiles(),
		cli.WithWorkingDirectory(workingDir),
		cli.WithDotEnv,
		cli.WithResolvedPaths(true),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create new project: %w", err)
	}

	project, err := options.LoadProject(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load project: %w", err)
	}

	addServiceLabels(project)
	// Ensure service environment variables
	project, err = project.WithServicesEnvironmentResolved(true)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve services environment: %w", err)
	}

	return project.WithoutUnnecessaryResources(), nil
}

// filters out dockman containers from project, prevents dockman from updating itself
// if dockmanServices is nil, it means no dockman containers were found in the compose file
func (s *ComposeService) withoutDockman(project *types.Project, services ...string) (withoutDockman []string, dockmanServices []string) {
	if _, ok := s.syncer.(*SFTPSyncer); ok {
		// If sftp client exists, it's a remote machine. Do not filter.
		return services, nil
	}

	// Find the name of the service running the "dockman" image.
	for name, conf := range project.Services {
		if strings.HasPrefix(conf.Image, *s.updateBaseImage) {
			dockmanServices = append(dockmanServices, name)
			log.Info().Msg("Found dockman service to filter from action")
			log.Debug().Str("image", conf.Image).Str("service-name", name).
				Msg("This service will be excluded from the final list.")
		}
	}

	// If no service is using the dockman image, there's nothing to filter.
	if len(dockmanServices) == 0 {
		return services, nil
	}

	// dockman exists filter it out

	// Determine which list of services to filter.
	targetServices := services

	// If the user did not provide a specific list of services,
	// use all services from the project as the target.
	if len(services) == 0 {
		targetServices = slices.Collect(maps.Keys(project.Services))
	}

	// Remove the dockman service from the target list and return the result.
	return slices.DeleteFunc(targetServices, func(serviceName string) bool {
		return slices.Contains(dockmanServices, serviceName)
	}), dockmanServices
}

func addServiceLabels(project *types.Project) {
	for i, s := range project.Services {
		s.CustomLabels = map[string]string{
			api.ProjectLabel:     project.Name,
			api.ServiceLabel:     s.Name,
			api.VersionLabel:     api.ComposeVersion,
			api.WorkingDirLabel:  "/",
			api.ConfigFilesLabel: strings.Join(project.ComposeFiles, ","),
			api.OneoffLabel:      "False", // default, will be overridden by `run` command
		}

		project.Services[i] = s
	}
}
