package main

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"os/exec"

	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg/argos"
	"github.com/rs/zerolog"
	"golang.org/x/sync/errgroup"

	"github.com/getlantern/systray"
	log2 "github.com/rs/zerolog/log"
)

var log *zerolog.Logger

func init() {
	app.InitMeta(info.FlavourDesktop)
	logger := log2.With().Str("desktop", "").Logger()
	log = &logger
}

func main() {
	exitIfAlreadyRunning()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	subFS, err := setupEmbeddedFrontend()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to setup embedded frontend filesystem")
	}
	executable, workingDir, err := setupElectronExecPath()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to find executable path")
	}

	setupEnvs()

	// 3. Start Systray in its own goroutine (it blocks, but we use onReady)
	// We pass 'cancel' so the tray can shut down the whole app
	go systray.Run(
		func() {
			onReady(cancel)
		},
		onExit,
	)

	g, ctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		app.StartServer(config.WithUIFS(subFS), config.WithCtx(ctx))
		return nil
	})

	g.Go(func() error {
		defer cancel()
		return startDesktopUI(ctx, executable, workingDir)
	})

	g.Go(func() error {
		return setupSocketHandler(ctx)
	})

	if err := g.Wait(); err != nil {
		log.Error().Err(err).Msg("App execution error")
	}

	fmt.Println("Shutdown complete goodbye...")
}

func onReady(cancel context.CancelFunc) {
	file, err := frontendDir.ReadFile("dist/dockman.svg")
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load icon")
	}

	systray.SetIcon(file)
	systray.AddMenuItem("Dockman Desktop", "")
	systray.AddSeparator()

	mQuit := systray.AddMenuItem("Quit", "Quit the whole app")
	//uiQuit := systray.AddMenuItem("Quit UI", "Quit the ui")

	go func() {
		select {
		case <-mQuit.ClickedCh:
			systray.Quit()
			cancel()
			//case <-uiQuit.ClickedCh:
			//	log.Printf("exiting ui")
		}
	}()
}

func onExit() {
}

func startDesktopUI(ctx context.Context, fullpath string, wd string) error {
	cmd := exec.CommandContext(ctx, fullpath)
	cmd.Dir = wd
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Run()
	if err != nil && ctx.Err() == nil {
		log.Error().Err(err).Msg("UI exited unexpectedly")
		return err
	}
	return nil
}

func startCoreServer(ctx context.Context, subFS fs.FS) {
	app.StartServer(
		config.WithUIFS(subFS),
		config.WithCtx(ctx),
	)
}

func setupEnvs() {
	prefixer := argos.Prefixer(config.EnvPrefix)
	envMap := map[string]string{
		"LOG_LEVEL":   "debug",
		"LOG_VERBOSE": "true",
		"CONFIG":      "./config",
		//"COMPOSE_ROOT": "./compose",
	}
	for k, v := range envMap {
		_ = os.Setenv(prefixer(k), v)
	}
}
