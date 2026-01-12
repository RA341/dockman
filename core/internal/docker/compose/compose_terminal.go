package compose

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"path/filepath"
	"slices"
	"strings"

	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/host/filesystem"

	"github.com/fatih/color"
	container2 "github.com/moby/moby/api/types/container"
	"golang.org/x/crypto/ssh"
)

// installed alone
const composeStandalone = "docker-compose"

// installed via docker compose
const composePlugin = "docker compose"

type Host struct {
	Fs      filesystem.FileSystem
	Relpath string
}

type FilenameParser func(filename string, host string) (Host, error)

type Service struct {
	TTY      bool
	cont     *container.Service
	parser   FilenameParser
	runner   CmdRunner
	hostname string
}

func NewComposeTerminal(
	hostname string,
	cont *container.Service,
	getFs FilenameParser,
	cli *ssh.Client,
	// TTY bool,
) *Service {
	var runner CmdRunner
	if cli == nil {
		runner = NewLocalRunner()
	} else {
		runner = NewRemoteRunner(cli)
	}

	return &Service{
		TTY:      true,
		cont:     cont,
		parser:   getFs,
		runner:   runner,
		hostname: hostname,
	}
}

// checks if tty is enabled or not and sets the appropriate --progress flag
// todo load TTY from rpc instead of struct wide
func (c *Service) progressOut() string {
	if c.TTY {
		return "--progress=tty"
	}
	return "--progress=plain"
}

func (c *Service) version(ctx context.Context) ([]string, error) {
	errWriter := bytes.Buffer{}

	split := strings.Split(composePlugin, " ")
	err := c.runner.Run(
		ctx,
		[]string{split[0], split[1], "version"},
		"",
		nil,
		&errWriter,
	)
	if err == nil {
		return []string{split[0], split[1]}, nil
	}

	err = c.runner.Run(
		ctx,
		[]string{composeStandalone, "version"},
		"",
		nil,
		&errWriter,
	)
	if err == nil {
		return []string{composeStandalone}, nil
	}

	return nil, fmt.Errorf(
		"could not determine compose binary location tried %s and %s\nerr:%s",
		composeStandalone,
		composePlugin,
		errWriter.String(),
	)
}

type WithCmd func(curCmds []string) []string

func (c *Service) withCmd(
	ctx context.Context,
	filename string,
	stream io.Writer,
	addCmd WithCmd,
	services []string,
) error {
	fileParts, err := c.parser(filename, c.hostname)
	if err != nil {
		return err
	}

	binary, err := c.version(ctx)
	if err != nil {
		return err
	}

	envs := loadEnvFile(fileParts.Fs, fileParts.Relpath)

	// docker compose --envfile=... -f some/file/path/compose.yml --progress=<val>
	fullCmd := append(
		append(binary, envs...),
		c.progressOut(),
		"-f", fileParts.Relpath,
	)

	fullCmd = addCmd(fullCmd)
	fullCmd = append(fullCmd, services...)

	var cleanCmd = make([]string, 0, len(fullCmd))
	var sb strings.Builder
	for _, cmd := range fullCmd {
		cl := strings.TrimSpace(cmd)
		if cl == "" {
			continue
		}

		cleanCmd = append(cleanCmd, cl)
		sb.WriteString(cl + " ")
	}

	if stream != nil {
		_, err = stream.Write([]byte(green(sb.String())))
		if err != nil {
			return fmt.Errorf("could not write to stream: %w", err)
		}
	}

	errWriter := new(bytes.Buffer)
	err = c.runner.Run(ctx, cleanCmd, fileParts.Fs.Root(), stream, errWriter)
	if err != nil {
		return fmt.Errorf("%s", errWriter.String())
	}
	return nil
}

const envFileName = ".env"

func loadEnvFile(fs filesystem.FileSystem, filename string) []string {
	// remove leading '/' if left it will break filepath.dir
	filename = strings.TrimPrefix(filename, "/")
	var envPaths []string

	// some/relative/path/compose.yml
	start := filename
	for start != "." { // "." will return for empty
		// some/relative
		start = filepath.Dir(start) // some/relative/path
		// some/relative/path/.env
		envPath := fs.Join(start, envFileName)
		_, err := fs.Stat(envPath)
		if err == nil {
			absEnvPath := fs.Join(fs.Root(), envPath)
			envPaths = append(envPaths, "--env-file="+absEnvPath)
		}
	}

	// envs (lower) outer -> (higher) inner
	slices.Reverse(envPaths)

	return envPaths
}

var green = color.New(color.BgGreen).SprintlnFunc()

func (c *Service) Up(
	ctx context.Context,
	filename string,
	io io.Writer,
	services ...string,
) error {
	return c.withCmd(
		ctx, filename, io,
		func(cmdList []string) []string {
			return append(cmdList,
				"up", "-d", "-y",
				"--build", "--remove-orphans",
			)
		},
		services,
	)
}

func (c *Service) Down(
	ctx context.Context,
	filename string,
	io io.Writer,
	services ...string,
) error {
	return c.withCmd(ctx, filename, io,
		func(cmdList []string) []string {
			return append(cmdList,
				"down", "--remove-orphans",
			)
		},
		services,
	)
}

func (c *Service) Start(
	ctx context.Context,
	filename string,
	io io.Writer,
	services ...string,
) error {
	return c.withCmd(
		ctx, filename, io,
		func(cmdList []string) []string {
			return append(cmdList, "start", "--wait")
		},
		services,
	)
}

func (c *Service) Stop(
	ctx context.Context,
	filename string,
	io io.Writer,
	services ...string,
) error {
	return c.withCmd(ctx, filename, io,
		func(cmdList []string) []string {
			return append(cmdList, "stop")
		},
		services,
	)
}

func (c *Service) Pull(
	ctx context.Context,
	filename string,
	io io.Writer,
	services ...string,
) error {
	return c.withCmd(
		ctx, filename, io,
		func(cmdList []string) []string {
			return append(
				cmdList,
				"pull",
				"--ignore-buildable", "--include-deps", "--ignore-pull-failures",
				"--policy", "always",
			)
		},
		services,
	)
}

func (c *Service) Restart(
	ctx context.Context,
	filename string,
	io io.Writer,
	services ...string,
) error {
	return c.withCmd(ctx, filename, io,
		func(cmdList []string) []string {
			return append(
				cmdList, "restart",
			)
		},
		services,
	)
}

func (c *Service) Update(
	ctx context.Context,
	filename string,
	io io.Writer,
	services ...string,
) error {
	err := c.Pull(ctx, filename, io, services...)
	if err != nil {
		return err
	}
	return c.Up(ctx, filename, io, services...)
}

func (c *Service) List(ctx context.Context, filename string) ([]container2.Summary, error) {
	lines, err := c.listIds(ctx, filename)
	if err != nil {
		return nil, err
	}
	return c.cont.ContainerListByIDs(ctx, lines...)
}

func (c *Service) Stats(ctx context.Context, filename string) ([]container.Stats, error) {
	lines, err := c.listIds(ctx, filename)
	if err != nil {
		return nil, err
	}
	ds, err := c.cont.ContainerListByIDs(ctx, lines...)
	if err != nil {
		return nil, err
	}

	return c.cont.ContainerGetStatsFromList(ctx, ds), nil
}

func (c *Service) listIds(ctx context.Context, filename string) ([]string, error) {
	sb := new(bytes.Buffer)
	err := c.withCmd(ctx, filename, sb,
		func(cmdList []string) []string {
			return append(
				cmdList,
				"ps", "-a", "--format", "{{.ID}}",
			)
		},
		[]string{},
	)
	if err != nil {
		return nil, err
	}

	output := sb.String()
	lines := strings.Split(output, "\n")
	return lines, err
}

func (c *Service) Validate(ctx context.Context, filename string) []error {
	buf := new(bytes.Buffer)
	err := c.withCmd(ctx, filename, buf,
		func(cmdList []string) []string {
			return append(
				cmdList, "config",
			)
		},
		[]string{},
	)
	if err == nil {
		return []error{}
	}

	s := buf.String()
	fileErr := fmt.Errorf("failed to validate compose file: %s", s)
	// todo more validations

	return []error{fileErr}
}

// todo validate ports
//	var errs []error
//
//	project, err := s.LoadProject(ctx, shortName)
//	if err != nil {
//		return append(errs, err)
//	}
//
//	runningContainers, err := s.cont.ContainersList(ctx)
//	if err != nil {
//		return append(errs, err)
//	}
//
//	for svcName, svc := range project.Services {
//		for _, portConfig := range svc.Ports {
//			published, err := strconv.Atoi(portConfig.Published)
//			if err != nil {
//				errs = append(errs, fmt.Errorf("invalid port %q in service %s: %w", portConfig.Published, svcName, err))
//				continue
//			}
//
//			// check running Containers using this port
//			conflicts := s.findConflictingContainers(runningContainers, svcName, uint16(published))
//			for _, c := range conflicts {
//				errs = append(errs, fmt.Errorf(
//					"service %q wants port %d, but container %q (id=%s) is already using it",
//					svcName, published, c.Names[0], c.ID[:12],
//				))
//			}
//		}
//	}
//
//	return errs
//}
//
//// findConflictingContainers returns containers using the given port but not matching the service name
//func (s *Service) findConflictingContainers(containers []container.Summary, serviceName string, port uint16) []container.Summary {
//	var matches []container.Summary
//	for _, c := range containers {
//		for _, p := range c.Ports {
//			if p.PublicPort == port {
//				// container names have leading "/" -> strip when comparing
//				containerName := c.Names[0]
//				if len(containerName) > 0 && containerName[0] == '/' {
//					containerName = containerName[1:]
//				}
//
//				serviceLabel := c.Labels[api.ServiceLabel]
//				if serviceLabel != serviceName {
//					matches = append(matches, c)
//				}
//			}
//		}
//	}
//
//	return matches
//}
//}

//func (s *Service) LoadProject(ctx context.Context, resourcePath string) (*types.Project, error) {
//	// fsCli is a file system
//	fsCli, relpath, err := s.getFs(resourcePath)
//	if err != nil {
//		return nil, err
//	}
//	// will be the parent dir of the compose file else equal to compose root
//	workingDir := filepath.Dir(relpath)
//
//	var finalEnv []string
//	for _, file := range []string{
//		// Global .env
//		// todo
//		//filepath.Join("s.ComposeRoot", ".env"),
//		// Subdirectory .env (will override global)
//		filepath.Join(filename, ".env"),
//	} {
//		if fileutil.FileExists(file) {
//			finalEnv = append(finalEnv, file)
//		}
//	}
//
//	fsLoader := FSResourceLoader{
//		Fs: fsCli,
//	}
//
//	options, err := cli.NewProjectOptions(
//		[]string{relpath},
//		cli.WithLoadOptions(
//			func(options *loader.Options) {
//				options.ResourceLoaders = []loader.ResourceLoader{&fsLoader}
//			}),
//		// important maintain this order to load .env properly
//		// highest 										lowest
//		// working-dir .env <- compose root .env <- os envs
//		cli.WithEnvFiles(finalEnv...),
//		cli.WithDotEnv,
//		cli.WithOsEnv,
//		// compose operations will take place in working dir
//		cli.WithWorkingDirectory(workingDir),
//		// other shit
//		cli.WithDefaultProfiles(),
//		cli.WithResolvedPaths(true),
//	)
//	if err != nil {
//		return nil, fmt.Errorf("failed to create new project: %w", err)
//	}
//
//	project, err := options.LoadProject(ctx)
//	if err != nil {
//		return nil, fmt.Errorf("failed to load project: %w", err)
//	}
//
//	addServiceLabels(project)
//	// Ensure service environment variables
//	project, err = project.WithServicesEnvironmentResolved(true)
//	if err != nil {
//		return nil, fmt.Errorf("failed to resolve services environment: %w", err)
//	}
//
//	return project.WithoutUnnecessaryResources(), nil
//}
