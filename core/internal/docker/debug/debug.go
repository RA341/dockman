package debug

import (
	"context"
	"fmt"
	"io"
	"strings"

	containerSrv "github.com/RA341/dockman/internal/docker/container"
	"github.com/google/uuid"
	"github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
)

// Service Dockman debug service exec into any container
// with whatever tools you would need
//
// inspired by https://iximiuz.com/en/posts/docker-debug-slim-containers/
type Service struct {
	cont *containerSrv.Service
}

func New(cont *containerSrv.Service) *Service {
	return &Service{
		cont: cont,
	}
}

func (s *Service) Cli() *client.Client {
	return s.cont.Client
}

// CleanupFn type aliased so that we can add more params/return values if needed
type CleanupFn func()

func (s *Service) ExecDebugContainer(
	ctx context.Context,
	containerID string,
	debuggerImage string,
	imgPullWriter io.Writer,
	debuggerEntryCmd string,
) (resp client.HijackedResponse, cleanup CleanupFn, err error) {
	err = s.cont.ImagePull(ctx, debuggerImage, imgPullWriter)
	if err != nil {
		return client.HijackedResponse{}, cleanup, fmt.Errorf("unable to pull debugger image: %w", err)
	}

	target, err := s.Cli().ContainerInspect(ctx, containerID, client.ContainerInspectOptions{})
	if err != nil {
		return client.HijackedResponse{}, nil, fmt.Errorf("unable to inspect debugger container: %w", err)
	}

	serviceName := fmt.Sprintf("container:%s", target.Container.Name)
	//hostConfig := &container.HostConfig{
	//	Privileged: true,
	//	AutoRemove: true,
	//}

	//containerConfig := &container.Config{
	//	Image: image,
	//	Cmd: []string{
	//		"/bin/sh",
	//	},
	//	OpenStdin: true,
	//	Tty:       true,
	//}

	targetPID := 1
	if target.Container.HostConfig.PidMode.IsHost() {
		targetPID = target.Container.State.Pid
	}

	runId := uuid.New().String()
	script := renderChrootEntrypoint(
		runId,
		targetPID,
		strings.Contains(debuggerImage, "nixery"),
		[]string{debuggerEntryCmd},
	)

	debuggerContainer, err := s.Cli().ContainerCreate(
		ctx,
		client.ContainerCreateOptions{
			Name: fmt.Sprintf("dockman-debug-%s", runId),
			Config: &container.Config{
				Image:        debuggerImage,
				Entrypoint:   []string{"sh"},
				Cmd:          []string{"-c", script},
				Tty:          true,
				OpenStdin:    true,
				AttachStdin:  true,
				AttachStdout: true,
				AttachStderr: true,
				//User:         opts.user,
			},
			HostConfig: &container.HostConfig{
				Privileged: true, // target.HostConfig.Privileged || opts.privileged,
				//CapAdd:     target.HostConfig.CapAdd,
				//CapDrop:    target.HostConfig.CapDrop,

				AutoRemove: true,

				PidMode:     container.PidMode(serviceName),
				NetworkMode: container.NetworkMode(serviceName),

				//Init: ptr(false),
			},
			NetworkingConfig: nil,
			Platform:         nil,
		},
	)
	if err != nil {
		return client.HijackedResponse{}, cleanup, fmt.Errorf("unable to create debug container: %w", err)
	}

	debuggerContId := debuggerContainer.ID
	_, err = s.Cli().ContainerStart(ctx, debuggerContId, client.ContainerStartOptions{})
	if err != nil {
		return resp, cleanup, fmt.Errorf("unable to start debug container: %w", err)
	}

	//s.Cli().ContainerWait(ctx, create.ID, container.WaitConditionNotRunning)

	attach, err := s.Cli().ContainerAttach(ctx, debuggerContId, client.ContainerAttachOptions{
		Stream: true,
		Stdin:  true,
		Stdout: true,
		Stderr: true,
	})
	if err != nil {
		return resp, cleanup, fmt.Errorf("unable to attach debug container: %w", err)
	}

	//execConfig := container.ExecOptions{
	//	AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
	//	Privileged: true,
	//	Cmd: []string{
	//		"/bin/sh",
	//		"-c",
	//	},
	//}
	//resp, err := srv.Cli().ContainerAttach(
	//	ctx,
	//	execResp.ID,
	//	container.ExecAttachOptions{Tty: true},
	//)
	//if err != nil {
	//	log.Fatal(err)
	//}

	cleanup = func() {
		log.Debug().Str("name", debuggerContainer.ID).Msg("removing debug container")

		_, err = s.Cli().ContainerRemove(ctx, debuggerContId, client.ContainerRemoveOptions{
			RemoveVolumes: true,
			RemoveLinks:   true,
			Force:         true,
		})
		if err != nil {
			log.Warn().Err(err).Str("id", debuggerContId).Msg("unable to remove debug container")
			return
		}
	}

	return attach.HijackedResponse, cleanup, nil
}

func renderChrootEntrypoint(runID string, targetPID int, isNix bool, cmd []string) string {
	shellCmd := "sh"
	if len(cmd) > 0 {
		for i, a := range cmd {
			if strings.ContainsAny(a, " \t\n\r") {
				cmd[i] = `"` + a + `"`
			}
		}
		shellCmd = "sh -c \"" + strings.Join(cmd, " ") + "\""
	}

	script := fmt.Sprintf(`
set -eu

CURRENT_PID=$(sh -c 'echo $PPID')

%[1]s
ln -s /proc/${CURRENT_PID}/root/ /proc/%[2]d/root/.dkmn-%[3]s

export DKMN_ROOTFS=/.dkmn-%[3]s

cat > /.dkmn-entrypoint.sh <<'EOF'
#!/bin/sh
export PATH=$PATH:$DKMN_ROOTFS/bin:$DKMN_ROOTFS/usr/bin:$DKMN_ROOTFS/sbin:$DKMN_ROOTFS/usr/sbin:$DKMN_ROOTFS/usr/local/bin:$DKMN_ROOTFS/usr/local/sbin

chroot /proc/%[2]d/root %[4]s
EOF

exec sh /.dkmn-entrypoint.sh
`,
		func() string {
			if isNix {
				return fmt.Sprintf(`CURRENT_NIX_INODE=$(stat -c '%%i' /nix)
TARGET_NIX_INODE=$(stat -c '%%i' /proc/%d/root/nix 2>/dev/null || echo 0)
if [ ${CURRENT_NIX_INODE} -ne ${TARGET_NIX_INODE} ]; then
 rm -rf /proc/%d/root/nix
 ln -s /proc/${CURRENT_PID}/root/nix /proc/%d/root/nix
fi`, targetPID, targetPID, targetPID)
			}
			return ""
		}(),
		targetPID,
		runID,
		shellCmd,
	)

	return script
}

// reference from
//func runDebuggerDocker(ctx context.Context, cli cliutil.CLI, opts *options) error {
//	dkcli, err := client.New()
//	if err != nil {
//		return err
//	}
//
//	target, err := dkcli.ContainerInspect(ctx, opts.target)
//	if err != nil {
//		return err
//	}
//	if target.State == nil || !target.State.Running {
//		return errTargetNotRunning
//	}
//
//	platform := opts.platform
//	if len(platform) == 0 {
//		platform = target.Platform
//	}
//
//	imageExists, err := imageExistsLocally(ctx, client, opts.image, platform)
//	if err != nil {
//		return err
//	}
//	if !imageExists {
//		cli.PrintAux("Pulling debugger image...\n")
//		if err := dkcli.ImagePullEx(ctx, opts.image, types.ImagePullOptions{
//			Platform: platform,
//		}); err != nil {
//			return errCannotPull(opts.image, err)
//		}
//	}
//
//	runID := uuid.ShortID()
//	nsMode := "container:" + target.ID
//	targetPID := 1
//	if target.HostConfig.PidMode.IsHost() {
//		targetPID = target.State.Pid
//	}
//
//	resp, err := dkcli.ContainerCreate(
//		ctx,
//		&container.Config{
//			Image:      opts.image,
//			Entrypoint: []string{"sh"},
//			Cmd: []string{"-c", debuggerEntrypoint(
//				cli, runID, targetPID, opts.image, opts.cmd, isRootUser(opts.user),
//			)},
//			Tty:          opts.tty,
//			OpenStdin:    opts.stdin,
//			AttachStdin:  opts.stdin,
//			AttachStdout: true,
//			AttachStderr: true,
//			User:         opts.user,
//		},
//		&container.HostConfig{
//			Privileged: target.HostConfig.Privileged || opts.privileged,
//			CapAdd:     target.HostConfig.CapAdd,
//			CapDrop:    target.HostConfig.CapDrop,
//
//			AutoRemove: opts.autoRemove,
//
//			NetworkMode: container.NetworkMode(nsMode),
//			PidMode:     container.PidMode(nsMode),
//			// UTSMode:     container.UTSMode(nsMode),  <-- stopped working in Docker 1.23 for some reason
//			// TODO: CgroupnsMode: container.CgroupnsMode(nsMode),
//			// TODO: IpcMode:      container.IpcMode(nsMode)
//			// TODO: UsernsMode:   container.UsernsMode(target)
//
//			Init: ptr(false),
//		},
//		nil,
//		nil,
//		debuggerName(opts.name, runID),
//	)
//	if err != nil {
//		return errCannotCreate(err)
//	}
//
//	if !opts.detach {
//		close, err := attachDebugger(ctx, cli, client, opts, resp.ID)
//		if err != nil {
//			return fmt.Errorf("cannot attach to debugger container: %w", err)
//		}
//		defer close()
//	}
//
//	if err := dkcli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
//		return fmt.Errorf("cannot start debugger container: %w", err)
//	}
//
//	if !opts.detach {
//		if opts.tty && cli.OutputStream().IsTerminal() {
//			tty.StartResizing(ctx, cli.OutputStream(), client, resp.ID)
//		}
//
//		statusCh, errCh := dkcli.ContainerWait(ctx, resp.ID, container.WaitConditionNotRunning)
//		select {
//		case err := <-errCh:
//			if err != nil {
//				return fmt.Errorf("waiting debugger container failed: %w", err)
//			}
//		case <-statusCh:
//		}
//	}
//
//	return nil
//}
