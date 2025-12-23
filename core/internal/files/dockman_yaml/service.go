package dockman_yaml

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"dario.cat/mergo"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/goccy/go-yaml"
	"github.com/rs/zerolog/log"
)

type RootFolderProvider func() string

type Service struct {
	dockYamlPath string
	composeRoot  RootFolderProvider

	lastModTime time.Time
	cachedYaml  *DockmanYaml
}

func NewDockmanYaml(dockYaml string, composeRoot RootFolderProvider) *Service {
	srv := &Service{
		composeRoot: composeRoot,
	}

	if dockYaml != "" {
		if strings.HasPrefix(dockYaml, "/") {
			// Absolute path provided
			// e.g /home/zaphodb/conf/.dockman.db
			srv.dockYamlPath = dockYaml
		} else {
			// Relative path; attach compose root
			// e.g. dockman/.dockman.yml
			srv.dockYamlPath = srv.WithRoot(dockYaml)
		}
	}

	return srv
}

func (s *Service) WithRoot(path string) string {
	path = filepath.Clean(path)
	return filepath.Join(s.composeRoot(), path)
}

func (s *Service) GetDockmanYaml() *DockmanYaml {
	filenames := []string{dockmanYamlFileYml, dockmanYamlFileYaml}
	var finalPath string
	var stat os.FileInfo

	// Determine which file to use
	if s.dockYamlPath != "" {
		stat = fileutil.StatFileIfExists(s.dockYamlPath)
		if stat != nil {
			finalPath = s.dockYamlPath
		}
	} else {
		for _, filename := range filenames {
			path := s.WithRoot(filename)
			stat = fileutil.StatFileIfExists(path)
			if stat != nil {
				finalPath = path
				break
			}
		}
	}

	// If no file is found, return a default config
	if stat == nil {
		// log.Warn().Msg("unable to find a dockman yaml file, using defaults")
		return &defaultDockmanYaml
	}

	// Check if the file has been modified since last read
	if !stat.ModTime().After(s.lastModTime) && s.cachedYaml != nil {
		//log.Debug().Msg("Returning cached version")
		return s.cachedYaml
	}

	// File is new or has been modified, load it
	file, err := os.ReadFile(finalPath)
	if err != nil {
		// log.Warn().Err(err).Str("path", finalPath).Msg("failed to read dockman yaml")
		return &defaultDockmanYaml
	}

	// Start with defaults, then merge the loaded config
	config := defaultDockmanYaml
	var override DockmanYaml
	if err := yaml.Unmarshal(file, &override); err != nil {
		log.Warn().Err(err).Msg("failed to parse dockman yaml")
		return &config
	}

	if err = mergo.Merge(&config, &override, mergo.WithOverride); err != nil {
		log.Warn().Err(err).Msg("failed to merge dockman yaml configs")
		return &defaultDockmanYaml
	}

	s.lastModTime = stat.ModTime()
	s.cachedYaml = &config

	//log.Debug().Msg("Returning fresh version")
	return s.cachedYaml
}
