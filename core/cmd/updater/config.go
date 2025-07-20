package main

import (
	"fmt"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/pkg/args"
)

var conf Config

const envPrefix = "DOCKMAN_UPDATER"

type Config struct {
	composeRoot string `config:"flag=cr,env=COMPOSE_ROOT,default=/compose,usage=Root directory for compose files"`
	logger      config.Logger
	updater     config.UpdaterConfig
}

func LoadConfig() error {
	err := args.ParseAndReadFlags(&conf, envPrefix)
	if err != nil {
		return fmt.Errorf("unable to parse struct: %w", err)
	}

	if conf.updater.DockmanImageBase == "" {
		return fmt.Errorf("no updater image specified")
	}

	args.PrettyPrint(&conf, envPrefix)
	return nil
}
