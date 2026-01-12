package config

import (
	"context"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/RA341/dockman/pkg/argos"
	"github.com/RA341/dockman/pkg/fileutil"
)

type Service struct {
	store             Store
	updateUpdaterFunc func()
}

func NewService(store Store, updaterFunc func()) *Service {
	return &Service{
		store:             store,
		updateUpdaterFunc: updaterFunc,
	}
}

func (s *Service) GetConfig() (*UserConfig, error) {
	return s.store.GetConfig()
}

func (s *Service) SaveConfig(conf *UserConfig, updaterUpdater bool) error {
	err := s.store.SetConfig(conf)
	if err != nil {
		return err
	}

	if updaterUpdater {
		s.updateUpdaterFunc()
	}

	return nil
}

func Load(opts ...ServerOpt) (*AppConfig, error) {
	config, err := parseStruct()
	if err != nil {
		return nil, err
	}

	for _, o := range opts {
		o(config)
	}
	defaultIfNotSet(config)

	argos.PrettyPrint(config, EnvPrefix)
	return config, nil
}

func parseStruct() (*AppConfig, error) {
	conf := &AppConfig{}
	if err := argos.Scan(conf, EnvPrefix); err != nil {
		return nil, err
	}
	flag.Parse()

	pathsToResolve := []*string{
		&conf.ConfigDir,
		&conf.ComposeRoot,
	}
	for _, p := range pathsToResolve {
		absPath, err := filepath.Abs(*p)
		if err != nil {
			return nil, fmt.Errorf("failed to get abs path for %s: %w", *p, err)
		}
		*p = absPath

		if err = os.MkdirAll(absPath, 0777); err != nil {
			return nil, err
		}
	}

	return conf, nil
}

// final checks
func defaultIfNotSet(config *AppConfig) {
	uiPath := config.UIPath
	if uiPath != "" {
		if file, err := WithUIFromFile(uiPath); err == nil {
			config.UIFS = file
		}
	}

	if len(strings.TrimSpace(config.AllowedOrigins)) == 0 {
		config.AllowedOrigins = "*" // allow all origins
	}

	if config.Port == 0 {
		config.Port = 8866
	}

	if config.LocalAddr == "0.0.0.0" {
		ip, err := getLocalIP()
		if err == nil {
			config.LocalAddr = ip
		}
	}

	if config.ServerContext == nil {
		config.ServerContext = context.Background()
	}
}

func getLocalIP() (string, error) {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "", err
	}
	defer fileutil.Close(conn)

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String(), nil
}
