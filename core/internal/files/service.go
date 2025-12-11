package files

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"dario.cat/mergo"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/goccy/go-yaml"
	"github.com/rs/zerolog/log"
)

type ActiveMachineFolderProvider func() string

type Service struct {
	machineFolder ActiveMachineFolderProvider
	composeRoot   func() string
	dockYamlPath  string
	guid          int
	puid          int

	lastModTime time.Time
	cachedYaml  *DockmanYaml
}

func New(
	composeRoot, dockYaml string,
	puid, guid int,
	machineFolder ActiveMachineFolderProvider,
) *Service {
	if !filepath.IsAbs(composeRoot) {
		var err error
		composeRoot, err = filepath.Abs(composeRoot)
		if err != nil {
			log.Fatal().Str("path", composeRoot).Msg("Err getting abs path for composeRoot")
		}
	}

	err := os.MkdirAll(composeRoot, 0755)
	if err != nil {
		log.Fatal().Err(err).
			Str("compose-root", composeRoot).
			Msg("failed to create compose root folder")
	}

	prov := func() string {
		mach := machineFolder()
		if mach == container.LocalClient {
			// return normal compose root for local client
			return composeRoot
		}
		return filepath.Join(composeRoot, git.DockmanRemoteFolder, mach)
	}

	srv := &Service{
		composeRoot:   prov,
		guid:          guid,
		puid:          puid,
		machineFolder: machineFolder,
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

	log.Debug().Msg("File service loaded successfully")
	return srv
}

type Entry struct {
	fullpath string
	isDir    bool
	children []Entry
}

var ignoredFiles = []string{".git", git.DockmanRemoteFolder}

func (s *Service) List(relpath string) ([]Entry, error) {
	pathWithRoot := s.WithRoot(relpath)

	topLevelEntries, err := os.ReadDir(pathWithRoot)
	if err != nil {
		return nil, fmt.Errorf("failed to list files in compose root: %v", err)
	}

	eg := sync.WaitGroup{}
	entriesLen := len(topLevelEntries)
	subDirChan := make(chan Entry, entriesLen)

	for _, entry := range topLevelEntries {
		entryName := entry.Name()
		if slices.Contains(ignoredFiles, entryName) {
			continue
		}

		isDir := entry.IsDir()
		eg.Go(func() {
			fullPath := filepath.Join(pathWithRoot, entryName)
			relFullPath := filepath.Join(relpath, entryName)

			e := Entry{
				fullpath: relFullPath,
				isDir:    isDir,
			}

			if isDir {
				files, err := s.listFiles(fullPath, relFullPath)
				if err != nil {
					log.Warn().Err(err).Str("path", fullPath).Msg("error listing subdir")
					return
				}

				e.children = files
			}

			subDirChan <- e
		})
	}

	go func() {
		eg.Wait()
		close(subDirChan)
	}()

	result := make([]Entry, 0, entriesLen)
	for item := range subDirChan {
		result = append(result, item)
	}

	config := s.GetDockmanYaml()
	slices.SortFunc(result, func(a, b Entry) int {
		return config.sortFiles(&a, &b)
	})

	return result, nil
}

func (s *Service) listFiles(fullPath string, relPath string) ([]Entry, error) {
	subEntries, err := os.ReadDir(fullPath)
	if err != nil {
		return nil, err
	}

	filesInSubDir := make([]Entry, 0, len(subEntries))
	for _, subEntry := range subEntries {
		filesInSubDir = append(filesInSubDir, Entry{
			fullpath: filepath.Join(relPath, subEntry.Name()),
			isDir:    subEntry.IsDir(),
			children: []Entry{},
		})
	}

	// sort subfiles
	config := s.GetDockmanYaml()
	slices.SortFunc(filesInSubDir, func(a, b Entry) int {
		return config.sortFiles(&a, &b)
	})

	return filesInSubDir, nil
}

func (s *Service) Create(filename string, dir bool) error {
	filename = s.WithRoot(filename)
	if dir {
		return os.MkdirAll(filename, os.ModePerm)
	}

	baseDir := filepath.Dir(filename)
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	f, err := openFile(filename)
	if err != nil {
		return err
	}
	fileutil.Close(f)

	return nil
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

func (s *Service) Exists(filename string) error {
	stat, err := os.Stat(s.WithRoot(filename))
	if err != nil {
		return err
	}
	if stat.IsDir() {
		return fmt.Errorf("%s is a directory, cannot be opened", filename)
	}

	return nil
}

func (s *Service) Delete(fileName string) error {
	fullpath := s.WithRoot(fileName)
	if err := os.RemoveAll(fullpath); err != nil {
		return err
	}

	return nil
}

func (s *Service) Rename(oldFileName, newFilename string) error {
	oldFullPath := s.WithRoot(filepath.ToSlash(filepath.Clean(oldFileName)))
	newFullPath := s.WithRoot(filepath.ToSlash(filepath.Clean(newFilename)))

	err := os.Rename(oldFullPath, newFullPath)
	if err != nil {
		return err
	}

	return nil
}

func (s *Service) Save(filename string, destWriter io.Reader) error {
	filename = s.WithRoot(filename)
	read, err := io.ReadAll(destWriter)
	if err != nil {
		return err
	}

	if err = os.WriteFile(filename, read, os.ModePerm); err != nil {
		return err
	}
	return nil
}

func (s *Service) getFileContents(filename string) ([]byte, error) {
	file, err := os.ReadFile(s.WithRoot(filepath.ToSlash(filename)))
	if err != nil {
		return nil, err
	}
	return file, nil
}

func (s *Service) LoadFilePath(filename string) (string, error) {
	filename = filepath.Clean(filename)
	return s.WithRoot(filename), nil
}

// WithRoot joins s.composeRoot() with filename
func (s *Service) WithRoot(filename string) string {
	filename = filepath.Clean(filename)
	return filepath.Join(s.composeRoot(), filename)
}

func (s *Service) Format(filename string) ([]byte, error) {
	path := s.WithRoot(filename)
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("unable to read file %w", err)
	}

	ext := filepath.Ext(filename)
	formatter, ok := availableFormatters[ext]
	if ok {
		return formatter(contents)
	}

	return contents, nil
}

func openFile(filename string) (*os.File, error) {
	return os.OpenFile(filename, os.O_RDWR|os.O_CREATE, os.ModePerm)
}

func (s *Service) Close() error {
	return nil
}
