package compose

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
)

// RunDockerCommand executes a user-provided docker CLI command line on this
// host through the same runner compose uses (local exec or ssh), streaming
// its combined output. Only the docker binary is allowed.
func (c *Service) RunDockerCommand(ctx context.Context, rawCommand string, stream io.Writer) error {
	args, err := splitCommandLine(rawCommand)
	if err != nil {
		return err
	}
	if len(args) == 0 || args[0] != "docker" {
		return fmt.Errorf("only docker commands are allowed, e.g. docker run --rm nginx:alpine")
	}

	if stream != nil {
		if _, err = stream.Write([]byte(green(strings.Join(args, " ")))); err != nil {
			return fmt.Errorf("could not write to stream: %w", err)
		}
	}

	errWriter := new(bytes.Buffer)
	if err = c.runner.Run(ctx, args, ".", stream, errWriter); err != nil {
		if errWriter.Len() > 0 {
			return fmt.Errorf("%s", errWriter.String())
		}
		return err
	}
	return nil
}

// splitCommandLine splits a command line into arguments, honoring single
// quotes, double quotes and backslash escapes (outside single quotes)
func splitCommandLine(input string) ([]string, error) {
	var args []string
	var current strings.Builder
	inArg := false

	const (
		modePlain = iota
		modeSingle
		modeDouble
	)
	mode := modePlain

	flush := func() {
		if inArg {
			args = append(args, current.String())
			current.Reset()
			inArg = false
		}
	}

	runes := []rune(input)
	for i := 0; i < len(runes); i++ {
		ch := runes[i]
		switch mode {
		case modeSingle:
			if ch == '\'' {
				mode = modePlain
			} else {
				current.WriteRune(ch)
			}
		case modeDouble:
			if ch == '"' {
				mode = modePlain
			} else if ch == '\\' && i+1 < len(runes) && (runes[i+1] == '"' || runes[i+1] == '\\') {
				i++
				current.WriteRune(runes[i])
			} else {
				current.WriteRune(ch)
			}
		default:
			switch {
			case ch == ' ' || ch == '\t' || ch == '\n':
				flush()
			case ch == '\'':
				mode = modeSingle
				inArg = true
			case ch == '"':
				mode = modeDouble
				inArg = true
			case ch == '\\' && i+1 < len(runes):
				i++
				current.WriteRune(runes[i])
				inArg = true
			default:
				current.WriteRune(ch)
				inArg = true
			}
		}
	}
	if mode != modePlain {
		return nil, fmt.Errorf("unbalanced quote in command")
	}
	flush()
	return args, nil
}

// PullImage pulls an image through the host's docker CLI in the compose
// runner context, so registry credentials (docker login, credential
// helpers) apply exactly as they do for compose — a bare daemon API pull
// is unauthenticated and fails on private registries.
func (c *Service) PullImage(ctx context.Context, imageTag string, out io.Writer) error {
	errWriter := new(bytes.Buffer)
	if err := c.runner.Run(ctx, []string{"docker", "pull", imageTag}, ".", out, errWriter); err != nil {
		if errWriter.Len() > 0 {
			return fmt.Errorf("%s", strings.TrimSpace(errWriter.String()))
		}
		return err
	}
	return nil
}
