package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// https://iximiuz.com/en/posts/docker-debug-slim-containers/

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var containerID string

func wsHandler(w http.ResponseWriter, r *http.Request) {
	ws, _ := upgrader.Upgrade(w, r, nil)
	defer ws.Close()

	runId := uuid.New().String()
	script := renderChrootEntrypoint(runId, 1, false, []string{"/bin/sh"})

	debugContainerID := createDebugContainer(containerID)
	execConfig := container.ExecOptions{
		AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true,
		Cmd: []string{
			"/bin/sh",
			"-c",
			script,
		},
	}

	ctx := context.Background()
	execResp, err := clu.ContainerExecCreate(ctx, debugContainerID, execConfig)
	if err != nil {
		log.Fatal(err)
	}

	resp, err := clu.ContainerExecAttach(ctx, execResp.ID, container.ExecAttachOptions{Tty: true})
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Close()

	go func() {
		// Simple buffer to copy data
		buf := make([]byte, 1024)
		for {
			n, err := resp.Reader.Read(buf)
			if err != nil {
				break
			}
			ws.WriteMessage(websocket.TextMessage, buf[:n])
		}
	}()

	// 6. Stream WebSocket Input -> Docker
	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}
		resp.Conn.Write(msg)
	}
}

func createDebugContainer(containerID string) string {
	serviceName := fmt.Sprintf("container:%s", containerID)
	hostConfig := &container.HostConfig{
		Privileged:  true,
		AutoRemove:  true,
		PidMode:     container.PidMode(serviceName),
		NetworkMode: container.NetworkMode(serviceName),
	}

	containerConfig := &container.Config{
		Image: "busybox",
		Cmd: []string{
			"/bin/sh",
		},
		OpenStdin: true,
		Tty:       true,
	}

	ctx := context.Background()

	create, err := clu.ContainerCreate(ctx,
		containerConfig,
		hostConfig,
		nil, nil,
		fmt.Sprintf("debug-%s", containerID))
	if err != nil {
		log.Fatal(err)
	}

	err = clu.ContainerStart(ctx, create.ID, container.StartOptions{})
	if err != nil {
		log.Fatal(err)
	}

	return create.ID
}

var clu *client.Client

func main() {
	var err error
	clu, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatal(fmt.Errorf("unable to create docker client: %w", err))
	}

	//ctx := context.Background()
	//resp, err := clu.ContainerCreate(ctx, &container.Config{
	//	Image: "postgres:alpine",
	//	Env:   []string{"POSTGRES_PASSWORD=mysecretpassword"},
	//}, nil, nil, nil, "")
	//if err != nil {
	//	log.Fatal(fmt.Errorf("unable to create docker container: %w", err))
	//}
	//defer clu.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})

	containerID = "666173e27d3159876e70bd740a7577997453bc3381d660f59f35db001db76067"

	//err = clu.ContainerStart(ctx, resp.ID, container.StartOptions{})
	//if err != nil {
	//	log.Fatal(fmt.Errorf("unable to start docker container: %w", err))
	//}

	http.HandleFunc("/exec", wsHandler)
	err = http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(fmt.Errorf("unable to start http server: %w", err))
	}
}

// renderChrootEntrypoint creates the same script cdebug creates.
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

	script := fmt.Sprintf(`set -eu

CURRENT_PID=$(sh -c 'echo $PPID')

%[1]s
ln -s /proc/${CURRENT_PID}/root/ /proc/%[2]d/root/.cdebug-%[3]s

export CDEBUG_ROOTFS=/.cdebug-%[3]s

cat > /.cdebug-entrypoint.sh <<'EOF'
#!/bin/sh
export PATH=$PATH:$CDEBUG_ROOTFS/bin:$CDEBUG_ROOTFS/usr/bin:$CDEBUG_ROOTFS/sbin:$CDEBUG_ROOTFS/usr/sbin:$CDEBUG_ROOTFS/usr/local/bin:$CDEBUG_ROOTFS/usr/local/sbin

chroot /proc/%[2]d/root %[4]s
EOF

exec sh /.cdebug-entrypoint.sh
`,
		// Insert nix handling if necessary:
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

//func runDebuggerDocker(ctx context.Context, cli cliutil.CLI, opts *options) error {
//	client, err := docker.NewClient(docker.Options{
//		Out:  cli.AuxStream(),
//		Host: opts.runtime,
//	})
//	if err != nil {
//		return err
//	}
//
//	target, err := client.ContainerInspect(ctx, opts.target)
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
//		if err := client.ImagePullEx(ctx, opts.image, types.ImagePullOptions{
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
//	resp, err := client.ContainerCreate(
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
//	if err := client.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
//		return fmt.Errorf("cannot start debugger container: %w", err)
//	}
//
//	if !opts.detach {
//		if opts.tty && cli.OutputStream().IsTerminal() {
//			tty.StartResizing(ctx, cli.OutputStream(), client, resp.ID)
//		}
//
//		statusCh, errCh := client.ContainerWait(ctx, resp.ID, container.WaitConditionNotRunning)
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
