package files

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

type ServiceDockmanYaml struct {
	dockYamlPath string
	composeRoot  ActiveMachineFolderProvider

	lastModTime time.Time
	cachedYaml  *DockmanYaml
}

func NewDockmanYaml(dockYaml string, composeRoot ActiveMachineFolderProvider) *ServiceDockmanYaml {
	srv := &ServiceDockmanYaml{
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

func (s *ServiceDockmanYaml) WithRoot(path string) string {
	path = filepath.Clean(path)
	return filepath.Join(s.composeRoot(), path)
}

func (s *ServiceDockmanYaml) GetDockmanYaml() *DockmanYaml {
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

func (d *DockmanYaml) sortFiles(a, b *Entry) int {
	ra := d.getSortRank(a)
	rb := d.getSortRank(b)

	if ra < rb {
		return -1
	}
	if ra > rb {
		return 1
	}
	return strings.Compare(a.fullpath, b.fullpath)
}

// getSortRank determines priority: dotfiles, directories, then files by getFileSortRank
func (d *DockmanYaml) getSortRank(entry *Entry) int {
	base := filepath.Base(entry.fullpath)
	// -1: pinned files (highest priority)
	if priority, ok := d.PinnedFiles[base]; ok {
		// potential bug, but if someone is manually writing the order of 100000 files i say get a life
		// -999 > -12 in this context, pretty stupid but i cant be bothered to fix this mathematically
		return priority - 100_000
	}

	// 0: dotfiles (highest priority)
	if strings.HasPrefix(base, ".") {
		return 1
	}

	// Check if it's a directory (has subfiles)
	if entry.isDir {
		return 2
	}

	// 2+: normal files, ranked by getFileSortRank
	return 3 + d.getFileSortRank(entry.fullpath)
}

// getFileSortRank assigns priority within normal files
func (d *DockmanYaml) getFileSortRank(filename string) int {
	base := filepath.Base(filename)
	// Priority 0: docker-compose files
	if strings.HasSuffix(base, "compose.yaml") || strings.HasSuffix(base, "compose.yml") {
		return 0
	}
	// Priority 1: other yaml/yml
	if strings.HasSuffix(base, ".yaml") || strings.HasSuffix(base, ".yml") {
		return 1
	}
	// Priority 2: everything else
	return 2
}
