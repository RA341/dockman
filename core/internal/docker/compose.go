package docker

import (
	"context"
	"fmt"
	"io"
	"maps"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/compose-spec/compose-go/v2/cli"
	"github.com/compose-spec/compose-go/v2/types"
	"github.com/docker/cli/cli/command"
	"github.com/docker/cli/cli/flags"
	"github.com/docker/compose/v2/pkg/api"
	"github.com/docker/compose/v2/pkg/compose"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/rs/zerolog/log"
)

// reference: https://github.com/portainer/portainer/blob/develop/pkg/libstack/compose/composeplugin.go

type ComposeService struct {
	containerService *ContainerService
	*dependencies
}

func NewComposeService(u *dependencies, container *ContainerService) *ComposeService {
	return &ComposeService{
		containerService: container,
		dependencies:     u,
	}
}

func (s *ComposeService) ComposeUp(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	if err := s.syncer.Sync(ctx, project); err != nil {
		return err
	}

	upOpts := api.UpOptions{
		Create: api.CreateOptions{
			Build:    &api.BuildOptions{Services: services},
			Services: services,

			// todo todo these params need to change for updating dockman
			RemoveOrphans: true, //  todo this false when updating dockman
			//Recreate:             api.RecreateForce, // Force recreation of the specified services
			//RecreateDependencies: api.RecreateNever, // Do not recreate dependencies

			Inherit:   true,
			AssumeYes: true,
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

func (s *ComposeService) ComposeDown(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	downOpts := api.DownOptions{
		Services: services,
	}
	if err := composeClient.Down(ctx, project.Name, downOpts); err != nil {
		return fmt.Errorf("compose down operation failed: %w", err)
	}
	return nil
}

func (s *ComposeService) ComposeStop(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	stopOpts := api.StopOptions{
		Services: services,
	}
	if err := composeClient.Stop(ctx, project.Name, stopOpts); err != nil {
		return fmt.Errorf("compose stop operation failed: %w", err)
	}
	return nil
}

func (s *ComposeService) ComposeRestart(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
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

func (s *ComposeService) ComposePull(ctx context.Context, project *types.Project, composeClient api.Service) error {
	pullOpts := api.PullOptions{}
	if err := composeClient.Pull(ctx, project, pullOpts); err != nil {
		return fmt.Errorf("compose pull operation failed: %w", err)
	}
	return nil
}

func (s *ComposeService) ComposeUpdate(ctx context.Context, project *types.Project, composeClient api.Service, services ...string) error {
	beforeImages, err := s.getProjectImageDigests(ctx, project)
	if err != nil {
		return fmt.Errorf("failed to get image info before pull: %w", err)
	}

	if err = s.ComposePull(ctx, project, composeClient); err != nil {
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
	// If images changed, run ComposeUp to recreate the containers with the new images.
	if err = s.ComposeUp(ctx, project, composeClient, services...); err != nil {
		return err
	}

	return nil
}

// ComposeList The `all` parameter controls whether to show stopped containers.
func (s *ComposeService) ComposeList(ctx context.Context, project *types.Project, all bool) ([]container.Summary, error) {
	containerFilters := filters.NewArgs()
	projectLabel := fmt.Sprintf("%s=%s", api.ProjectLabel, project.Name)
	containerFilters.Add("label", projectLabel)

	result, err := s.daemon.ContainerList(ctx, container.ListOptions{
		All:     all,
		Filters: containerFilters,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list containers for project '%s': %w", project.Name, err)
	}

	return result, nil
}

func (s *ComposeService) ComposeStats(ctx context.Context, project *types.Project) ([]ContainerStats, error) {
	// Get the list of running containers for the stack.
	stackList, err := s.ComposeList(ctx, project, false) // `false` for only running
	if err != nil {
		return nil, err
	}

	result := s.containerService.containerGetStatsFromList(ctx, stackList)
	return result, nil
}

func (s *ComposeService) getProjectImageDigests(ctx context.Context, project *types.Project) (map[string]string, error) {
	digests := make(map[string]string)

	for serviceName, service := range project.Services {
		if service.Image == "" {
			continue
		}

		imageInspect, err := s.daemon.ImageInspect(ctx, service.Image)
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
		command.WithAPIClient(s.daemon),
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

func (s *ComposeService) ComposeValidate(ctx context.Context, shortName string) []error {
	var errs []error

	project, err := s.LoadProject(ctx, shortName)
	if err != nil {
		return append(errs, err)
	}

	runningContainers, err := s.containerService.ContainersList(ctx)
	if err != nil {
		return append(errs, err)
	}

	for svcName, svc := range project.Services {
		for _, portConfig := range svc.Ports {
			published, err := strconv.Atoi(portConfig.Published)
			if err != nil {
				errs = append(errs, fmt.Errorf("invalid port %q in service %s: %w", portConfig.Published, svcName, err))
				continue
			}

			// check running Containers using this port
			conflicts := s.findConflictingContainers(runningContainers, svcName, uint16(published))
			for _, c := range conflicts {
				errs = append(errs, fmt.Errorf(
					"service %q wants port %d, but container %q (id=%s) is already using it",
					svcName, published, c.Names[0], c.ID[:12],
				))
			}
		}
	}

	return errs
}

// findConflictingContainers returns containers using the given port but not matching the service name
func (s *ComposeService) findConflictingContainers(containers []container.Summary, serviceName string, port uint16) []container.Summary {
	var matches []container.Summary
	for _, c := range containers {
		for _, p := range c.Ports {
			if p.PublicPort == port {
				// container names have leading "/" -> strip when comparing
				containerName := c.Names[0]
				if len(containerName) > 0 && containerName[0] == '/' {
					containerName = containerName[1:]
				}

				serviceLabel := c.Labels[api.ServiceLabel]
				if serviceLabel != serviceName {
					matches = append(matches, c)
				}
			}
		}
	}

	return matches
}

func (s *ComposeService) LoadProject(ctx context.Context, shortName string) (*types.Project, error) {
	fullPath := filepath.Join(s.composeRoot, shortName)
	// will be the parent dir of the compose file else equal to compose root
	workingDir := filepath.Dir(fullPath)

	var finalEnv []string
	for _, file := range []string{
		// Global .env
		filepath.Join(s.composeRoot, ".env"),
		// Subdirectory .env (will override global)
		filepath.Join(workingDir, ".env"),
	} {
		if fileutil.FileExists(file) {
			finalEnv = append(finalEnv, file)
		}
	}

	options, err := cli.NewProjectOptions(
		[]string{fullPath},
		// important maintain this order to load .env properly
		// highest 										lowest
		// working-dir .env <- compose root .env <- os envs
		cli.WithEnvFiles(finalEnv...),
		cli.WithDotEnv,
		cli.WithOsEnv,
		// compose operations will take place in working dir
		cli.WithWorkingDirectory(workingDir),
		// other shit
		cli.WithDefaultProfiles(),
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

// todo move to config flag
const dockmanImage = "ghcr.io/ra341/dockman"

func (s *ComposeService) withoutDockman(project *types.Project, services ...string) []string {
	// If sftp client exists, it's a remote machine. Do not filter.
	// todo
	//if isRemoteDockman := .daemon.DaemonHost() != nil; isRemoteDockman {
	//	return services
	//}

	// Find the name of the service running the "dockman" image.
	var dockmanServiceName string
	for name, conf := range project.Services {
		if strings.HasPrefix(conf.Image, dockmanImage) {
			dockmanServiceName = name
			log.Info().Msg("Found dockman service to filter from action")
			log.Debug().Str("image", conf.Image).Str("service-name", name).
				Msg("This service will be excluded from the final list.")
			break // Found it, no need to keep searching
		}
	}

	// If no service is using the dockman image, there's nothing to filter.
	if dockmanServiceName == "" {
		if len(services) == 0 {
			// empty list implies all services, since no other services were explicitly passed
			return []string{}
		}
		return services
	}

	// Determine which list of services to filter.
	targetServices := services
	// If the user did not provide a specific list of services,
	// use all services from the project as the target.
	if len(services) == 0 {
		targetServices = slices.Collect(maps.Keys(project.Services))
	}

	// Remove the dockman service from the target list and return the result.
	return slices.DeleteFunc(targetServices, func(serviceName string) bool {
		return serviceName == dockmanServiceName
	})
}

func addServiceLabels(project *types.Project) {
	for i, s := range project.Services {
		s.CustomLabels = map[string]string{
			api.ServiceLabel:     s.Name,
			api.ProjectLabel:     project.Name,
			api.VersionLabel:     api.ComposeVersion,
			api.ConfigFilesLabel: strings.Join(project.ComposeFiles, ","),
			api.OneoffLabel:      "False",
		}

		project.Services[i] = s
	}
}
