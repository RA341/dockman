package main

import (
	"fmt"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/pkg/args"
)

var conf UpdaterConfig

const envPrefix = "DOCKMAN_UPDATER"

type UpdaterConfig struct {
	ComposeRoot string               `config:"flag=cr,env=COMPOSE_ROOT,default=/compose,usage=Root directory for compose files"`
	Logger      config.Logger        `config:""`
	Updater     config.UpdaterConfig `config:""`
}

func loadConfig() error {
	err := args.ParseAndReadFlags(&conf, envPrefix)
	if err != nil {
		return fmt.Errorf("unable to parse struct: %w", err)
	}

	if conf.Updater.DockmanImageBase == "" {
		return fmt.Errorf("no updater image specified")
	}

	args.PrettyPrint(conf, envPrefix)
	return nil
}
