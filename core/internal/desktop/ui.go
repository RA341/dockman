package desktop

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/rs/zerolog"
)

func NewUI(ctx context.Context, desktopExec string) error {
	executablePath, err := os.Executable()
	if err != nil {
		return err
	}

	base := filepath.Dir(executablePath)

	uiExec := filepath.Join(base, desktopExec)
	port := os.Getenv("DOCKMAN_PORT")
	cmd := exec.CommandContext(ctx, uiExec, fmt.Sprintf("--port=%s", port))

	// todo
	//uiLogger := log.Logger.With().Str("ui", "logger").Logger()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

type StdOutLogger struct {
	logger zerolog.Logger
}

func (s *StdOutLogger) Write(p []byte) (n int, err error) {
	s.logger.Info().Msg(string(p))
	return len(p), nil
}

type StdErrLogger struct {
	logger zerolog.Logger
}

func (s *StdErrLogger) Write(p []byte) (n int, err error) {
	s.logger.Error().Msg(string(p))
	return len(p), nil
}
