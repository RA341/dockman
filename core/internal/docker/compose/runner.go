package compose

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"github.com/RA341/dockman/pkg/fileutil"
	"golang.org/x/crypto/ssh"
)

type CmdRunner interface {
	Run(
		ctx context.Context,
		cmd []string,
		wd string,
		stdIn io.Writer,
		stdErr io.Writer,
	) error
}

type LocalRunner struct{}

func NewLocalRunner() *LocalRunner {
	return &LocalRunner{}
}

func (l *LocalRunner) Run(
	ctx context.Context,
	cmd []string,
	wd string,
	out io.Writer,
	errWriter io.Writer,
) error {
	if len(cmd) < 1 {
		return fmt.Errorf("invalid command")
	}

	ins := exec.CommandContext(ctx, cmd[0], cmd[1:]...)
	ins.Dir = wd
	ins.Stdout = out
	ins.Stderr = out
	ins.Stdin = nil

	err := ins.Run()
	return err
}

type RemoteRunner struct {
	cli *ssh.Client
}

func NewRemoteRunner(cli *ssh.Client) *RemoteRunner {
	return &RemoteRunner{
		cli: cli,
	}
}

func (r *RemoteRunner) Run(
	ctx context.Context,
	cmd []string,
	wd string,
	out io.Writer,
	errWriter io.Writer,
) error {
	session, err := r.cli.NewSession()
	if err != nil {
		return fmt.Errorf("unable to create ssh session: %w", err)
	}
	defer fileutil.Close(session)

	fullCmd := fmt.Sprintf(
		"cd %s && %s",
		wd,
		strings.Join(cmd, " "),
	)

	session.Stdout = out
	session.Stderr = errWriter
	session.Stdin = nil

	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			// Force-close the session if the context is canceled
			fileutil.Close(session)
		case <-done:
		}
	}()
	close(done)

	return session.Run(fullCmd)
}
