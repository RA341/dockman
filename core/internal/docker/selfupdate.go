package docker

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/docker/compose/v5/pkg/api"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/api/types/mount"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

const (
	// selfUpdateContainerName is the fixed name of the throwaway helper so it can
	// be found and cleaned up on the next Dockman startup.
	selfUpdateContainerName = "dockman-self-update"
	// selfUpdateHelperImage carries a docker CLI + compose plugin.
	selfUpdateHelperImage = "docker:cli"
	// dockmanContainerLabel is set on the Dockman image (see pkg/docker/Dockerfile).
	dockmanContainerLabel = "dockman.container"
)

// SelfUpdate pulls the latest Dockman image and recreates the Dockman container.
//
// A container cannot recreate itself while running (stopping itself kills the
// process doing the work), so Dockman launches a short-lived, DETACHED helper
// container that runs `docker compose up -d` for the Dockman service and then
// exits. The helper outlives Dockman during the swap. It is left in place after
// it finishes (so its logs stay inspectable) and is removed on the next
// successful Dockman startup by CleanupSelfUpdateHelper.
func SelfUpdate(ctx context.Context, dkSrv *Service) error {
	cli := dkSrv.Container.Cli()

	self, err := findSelfContainer(ctx, cli)
	if err != nil {
		return err
	}

	composeFile := self.Labels[api.ConfigFilesLabel]
	service := self.Labels[api.ServiceLabel]
	project := self.Labels[api.ProjectLabel]
	if composeFile == "" || service == "" {
		return fmt.Errorf("the Dockman container is not managed by docker compose " +
			"(no compose labels found), self-update is unavailable")
	}

	// Remove a leftover helper from a previous run, if any.
	cleanupSelfUpdateHelper(ctx, cli)

	if err = pullImage(ctx, cli, selfUpdateHelperImage); err != nil {
		return fmt.Errorf("failed to pull helper image %s: %w", selfUpdateHelperImage, err)
	}

	composeDir := filepath.Dir(composeFile)
	// Mount the compose dir's parent so both the compose file and a parent-level
	// env file (e.g. `env_file: ../.env`) are visible to the helper. Guard against
	// mounting the host root.
	mountDir := filepath.Dir(composeDir)
	if mountDir == "/" || mountDir == "." || mountDir == "" {
		mountDir = composeDir
	}

	// The helper talks to the daemon over the raw docker socket (not Dockman's
	// proxy) and recreates ONLY the Dockman service: --no-deps so sidecars such
	// as a socket proxy are never touched, --force-recreate to guarantee a fresh
	// container on the pulled image. A parent-level `../.env` is passed
	// explicitly since compose only auto-loads a .env from the project directory.
	// Identity is passed in via env, resolved by Dockman from its own container.
	const script = `set -e
sleep 3
cd "$DK_COMPOSE_DIR"
ENVFLAG=""
[ -f ../.env ] && ENVFLAG="--env-file ../.env"
PROJ=""
[ -n "$DK_PROJECT" ] && PROJ="-p $DK_PROJECT"
echo "Updating Dockman ($DK_SERVICE)..."
docker compose $ENVFLAG $PROJ -f "$DK_COMPOSE_FILE" up -d --pull always --build --no-deps --force-recreate "$DK_SERVICE"`

	created, err := cli.ContainerCreate(ctx, client.ContainerCreateOptions{
		Name: selfUpdateContainerName,
		Config: &container.Config{
			Image:      selfUpdateHelperImage,
			Entrypoint: []string{"sh"},
			Cmd:        []string{"-c", script},
			Env: []string{
				"DK_COMPOSE_FILE=" + composeFile,
				"DK_COMPOSE_DIR=" + composeDir,
				"DK_PROJECT=" + project,
				"DK_SERVICE=" + service,
			},
			// Never let Dockman mistake the helper for itself.
			Labels: map[string]string{dockmanContainerLabel: "false"},
		},
		HostConfig: &container.HostConfig{
			Mounts: []mount.Mount{
				{Type: mount.TypeBind, Source: "/var/run/docker.sock", Target: "/var/run/docker.sock"},
				{Type: mount.TypeBind, Source: mountDir, Target: mountDir},
			},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to create self-update helper: %w", err)
	}

	if _, err = cli.ContainerStart(ctx, created.ID, client.ContainerStartOptions{}); err != nil {
		return fmt.Errorf("failed to start self-update helper: %w", err)
	}

	log.Info().Str("service", service).Str("composeFile", composeFile).
		Msg("Dockman self-update helper launched; Dockman will restart shortly")
	return nil
}

// CleanupSelfUpdateHelper removes a leftover self-update helper container if one
// is still around. Safe to call on every startup; a no-op when nothing exists.
func CleanupSelfUpdateHelper(ctx context.Context, cli *client.Client) {
	cleanupSelfUpdateHelper(ctx, cli)
}

func cleanupSelfUpdateHelper(ctx context.Context, cli *client.Client) {
	if _, err := cli.ContainerRemove(ctx, selfUpdateContainerName, client.ContainerRemoveOptions{
		Force: true,
	}); err != nil {
		log.Debug().Err(err).Msg("no self-update helper container to clean up")
	}
}

// findSelfContainer locates the running Dockman container via its image label,
// preferring the one whose id matches this process's hostname.
func findSelfContainer(ctx context.Context, cli *client.Client) (container.Summary, error) {
	list, err := cli.ContainerList(ctx, client.ContainerListOptions{All: true})
	if err != nil {
		return container.Summary{}, err
	}

	hostname, _ := os.Hostname()
	var fallback *container.Summary
	for i := range list.Items {
		c := list.Items[i]
		if c.Labels[dockmanContainerLabel] != "true" {
			continue
		}
		if hostname != "" && strings.HasPrefix(c.ID, hostname) {
			return c, nil
		}
		if fallback == nil {
			cpy := c
			fallback = &cpy
		}
	}
	if fallback != nil {
		return *fallback, nil
	}
	return container.Summary{}, fmt.Errorf("could not find the Dockman container (label %s=true)", dockmanContainerLabel)
}

func pullImage(ctx context.Context, cli *client.Client, image string) error {
	progress, err := cli.ImagePull(ctx, image, client.ImagePullOptions{})
	if err != nil {
		return err
	}
	return progress.Wait(ctx)
}
