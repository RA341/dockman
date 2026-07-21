package compose

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"strings"

	"github.com/creack/pty"
	"golang.org/x/crypto/ssh"
)

// InteractiveShell is a PTY-backed shell: reads return terminal output,
// writes feed keystrokes, Resize follows the client's window.
type InteractiveShell interface {
	io.ReadWriteCloser
	Resize(cols, rows uint16) error
}

// ShellRunner is implemented by runners that can open an interactive shell
// in the same context compose and docker commands execute in.
type ShellRunner interface {
	StartShell(ctx context.Context, wd string, cols, rows uint16) (InteractiveShell, error)
}

// StartShell opens an interactive shell on this host. With a filename the
// shell starts in that compose file's directory, otherwise in the runner
// user's home.
func (c *Service) StartShell(ctx context.Context, filename string, cols, rows uint16) (InteractiveShell, error) {
	runner, ok := c.runner.(ShellRunner)
	if !ok {
		return nil, fmt.Errorf("interactive shell is not supported on this host")
	}

	wd := ""
	if filename != "" {
		fileParts, err := c.parser(filename, c.hostname)
		if err != nil {
			return nil, fmt.Errorf("unable to resolve %q: %w", filename, err)
		}
		wd = path.Dir(fileParts.Fs.Join(fileParts.Fs.Root(), fileParts.Relpath))
	}

	return runner.StartShell(ctx, wd, cols, rows)
}

// local: a PTY in the dockman container — the exact context local compose
// and docker commands run in

func (l *LocalRunner) StartShell(ctx context.Context, wd string, cols, rows uint16) (InteractiveShell, error) {
	shellBin := "/bin/sh"
	if p, err := exec.LookPath("bash"); err == nil {
		shellBin = p
	}

	if wd == "" {
		if home, err := os.UserHomeDir(); err == nil {
			wd = home
		}
	}

	cmd := exec.CommandContext(ctx, shellBin)
	cmd.Dir = wd
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, fmt.Errorf("unable to start shell: %w", err)
	}

	return &localShell{ptmx: ptmx, cmd: cmd}, nil
}

type localShell struct {
	ptmx *os.File
	cmd  *exec.Cmd
}

func (s *localShell) Read(p []byte) (int, error)  { return s.ptmx.Read(p) }
func (s *localShell) Write(p []byte) (int, error) { return s.ptmx.Write(p) }

func (s *localShell) Resize(cols, rows uint16) error {
	return pty.Setsize(s.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

func (s *localShell) Close() error {
	err := s.ptmx.Close()
	if s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
	}
	_ = s.cmd.Wait()
	return err
}

// remote: an ssh session with a requested PTY on the configured host

func (r *RemoteRunner) StartShell(ctx context.Context, wd string, cols, rows uint16) (InteractiveShell, error) {
	session, err := r.cli.NewSession()
	if err != nil {
		return nil, fmt.Errorf("unable to create ssh session: %w", err)
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", int(rows), int(cols), modes); err != nil {
		_ = session.Close()
		return nil, fmt.Errorf("unable to request pty: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		_ = session.Close()
		return nil, err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = session.Close()
		return nil, err
	}

	// with a PTY the remote's stderr is folded into the terminal stream, so
	// stdout alone carries everything
	if wd != "" {
		err = session.Start(fmt.Sprintf("cd %s && exec ${SHELL:-sh} -l", shellQuote(wd)))
	} else {
		err = session.Shell()
	}
	if err != nil {
		_ = session.Close()
		return nil, fmt.Errorf("unable to start remote shell: %w", err)
	}

	sh := &remoteShell{session: session, stdin: stdin, stdout: stdout}
	go func() {
		<-ctx.Done()
		_ = sh.Close()
	}()
	return sh, nil
}

type remoteShell struct {
	session *ssh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
}

func (s *remoteShell) Read(p []byte) (int, error)  { return s.stdout.Read(p) }
func (s *remoteShell) Write(p []byte) (int, error) { return s.stdin.Write(p) }

func (s *remoteShell) Resize(cols, rows uint16) error {
	return s.session.WindowChange(int(rows), int(cols))
}

func (s *remoteShell) Close() error {
	_ = s.stdin.Close()
	return s.session.Close()
}

// shellQuote single-quotes a path for a remote sh command line
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
