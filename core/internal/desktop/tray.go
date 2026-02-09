package desktop

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"runtime"
	"sync"
	"sync/atomic"

	"fyne.io/systray"
	"github.com/RA341/dockman/internal/app"
	"github.com/RA341/dockman/internal/config"
	"github.com/rs/zerolog/log"
)

type Desktop struct {
	conf *config.AppConfig
	opts []config.AppOpt

	ctx    context.Context
	cancel context.CancelFunc

	wg            sync.WaitGroup
	uiRunning     atomic.Bool
	serverRunning atomic.Bool
	fsInf         fs.FS
}

func NewDesktop(fsPath fs.FS, opts ...config.AppOpt) Desktop {
	return Desktop{
		opts:  opts,
		fsInf: fsPath,
	}
}

func (t *Desktop) Start() {
	t.startServices()
	systray.Run(
		func() {
			t.onReady()
		},
		t.onExit,
	)
}

func (t *Desktop) startServices() {
	// hold until functions clean up
	t.wg.Wait()

	// then reset context
	ctx, cancel := context.WithCancel(context.Background())
	t.ctx = ctx
	t.cancel = cancel

	t.wg.Go(t.startCore)
	t.wg.Go(t.startUI)
}

func (t *Desktop) startCore() {
	if t.serverRunning.Load() {
		log.Info().Msg("Server is already running")
		return
	}

	log.Info().Msg("Starting server...")

	defer func() {
		log.Warn().Msg("Server stopped")
		t.serverRunning.Store(false)
	}()
	t.serverRunning.Store(true)

	finalOpts := append(
		t.opts,
		config.WithCtx(t.ctx),
	)
	dockmanApp := app.NewApp(finalOpts...)
	t.conf = dockmanApp.Config

	app.NewServer(dockmanApp)
}

// StartUI wrapper for external access
func (t *Desktop) StartUI() {
	go t.startUI()
}

func (t *Desktop) startUI() {
	if t.uiRunning.Load() {
		log.Info().Msg("UI is running")
		return
	}

	log.Info().Msg("Starting UI")
	defer func() {
		t.uiRunning.Store(false)
	}()
	t.uiRunning.Store(true)

	//if t.conf.disableUI {
	//	log.Info().Msg("UI is disabled in config")
	//	return
	//}

	exePath := "ui/ui"
	if runtime.GOOS == "windows" {
		exePath += ".exe"
	}

	err := NewUI(t.ctx, exePath)
	if err != nil {
		if errors.Is(t.ctx.Err(), context.Canceled) {
			log.Warn().Msg("Process stopped by user")
			return
		}

		ShowErr(fmt.Sprintf("Failed to start UI: %v", err))
	}
}

func (t *Desktop) onReady() {
	all := t.loadIcon()

	systray.SetIcon(all)
	systray.SetTitle("Dockman")
	systray.SetTooltip("Dockman")
	
	mUI := systray.AddMenuItem("Open UI", "Start the UI")
	mServer := systray.AddMenuItem("Restart", "Restart the app")
	mQuit := systray.AddMenuItem("Quit", "Quit the whole app")

	go func() {
		for {
			select {
			case <-mServer.ClickedCh:
				t.cancel()
				t.startServices()
			case <-mUI.ClickedCh:
				t.StartUI()
			case <-mQuit.ClickedCh:
				t.cancel()
				systray.Quit()
			}
		}
	}()
}

func (t *Desktop) onExit() {
	t.cancel()
}

func (t *Desktop) loadIcon() []byte {
	uifs := t.fsInf
	if uifs == nil {
		log.Warn().Msg("UIFS configuration is missing")
		return nil
	}

	open, err := uifs.Open("dockman.png")
	if err != nil {
		ShowErr("Could not open favicon.svg")
		os.Exit(1)
	}

	all, err := io.ReadAll(open)
	if err != nil {
		ShowErr("Could not read favicon.svg bytes")
		os.Exit(1)
	}

	return all
}
