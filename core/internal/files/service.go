package files

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/git"
	"github.com/RA341/dockman/pkg/fileutil"

	"github.com/rs/zerolog/log"
	"github.com/sahilm/fuzzy"
)

type ActiveMachineFolderProvider func() string

type Service struct {
	config *config.FilePerms
	store  Store

	// for compose files
	composeRoot ActiveMachineFolderProvider
	dy          *ServiceDockmanYaml
}

func New(
	store Store,
	composeRootProvider ActiveMachineFolderProvider,
	dy *ServiceDockmanYaml,
	config *config.FilePerms,
) *Service {
	srv := &Service{
		config:      config,
		store:       store,
		composeRoot: composeRootProvider,
		dy:          dy,
	}

	log.Debug().Msg("File service loaded successfully")
	return srv
}

type Entry struct {
	fullpath string
	isDir    bool
	children []Entry
}

var ignoredFiles = []string{git.DockmanRemoteFolder}

func (s *Service) List(relpath string, alias string) ([]Entry, error) {
	pathWithRoot, err := s.WithRoot(relpath, alias)
	if err != nil {
		return nil, err
	}

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

	conf := s.dy.GetDockmanYaml()
	slices.SortFunc(result, func(a, b Entry) int {
		return conf.sortFiles(&a, &b)
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
	conf := s.dy.GetDockmanYaml()
	slices.SortFunc(filesInSubDir, func(a, b Entry) int {
		return conf.sortFiles(&a, &b)
	})

	return filesInSubDir, nil
}

func (s *Service) Create(filename string, alias string, dir bool) error {
	filename, err := s.WithRoot(filename, alias)
	if err != nil {
		return err
	}

	if dir {
		return os.MkdirAll(filename, os.ModePerm)
	}

	baseDir := filepath.Dir(filename)
	if err = os.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	f, err := openFile(filename)
	if err != nil {
		return err
	}
	fileutil.Close(f)

	return nil
}

func (s *Service) Exists(filename string, alias string) error {
	root, err := s.WithRoot(filename, alias)
	if err != nil {
		return err
	}

	stat, err := os.Stat(root)
	if err != nil {
		return err
	}
	if stat.IsDir() {
		return fmt.Errorf("%s is a directory, cannot be opened", filename)
	}

	return nil
}

func (s *Service) Delete(fileName string, alias string) error {
	fullpath, err := s.WithRoot(fileName, alias)
	if err != nil {
		return err
	}

	if err = os.RemoveAll(fullpath); err != nil {
		return err
	}

	return nil
}

func (s *Service) Rename(oldFileName, newFilename string, alias string) error {
	oldFullPath, err := s.rootWithSlash(oldFileName, alias)
	if err != nil {
		return err
	}

	newFullPath, err := s.rootWithSlash(newFilename, alias)
	if err != nil {
		return err
	}

	err = os.Rename(oldFullPath, newFullPath)
	if err != nil {
		return err
	}

	return nil
}

func (s *Service) Save(filename string, alias string, source io.Reader) error {
	filename, err := s.WithRoot(filename, alias)
	if err != nil {
		return err
	}

	dest, err := os.OpenFile(filename, os.O_RDWR|os.O_TRUNC, os.ModePerm)
	if err != nil {
		return err
	}
	defer fileutil.Close(dest)

	_, err = io.Copy(dest, source)
	return err
}

func (s *Service) getFileContents(filename string, alias string) ([]byte, error) {
	root, err := s.rootWithSlash(filename, alias)
	if err != nil {
		return nil, err
	}
	file, err := os.ReadFile(root)
	if err != nil {
		return nil, err
	}
	return file, nil
}

func (s *Service) rootWithSlash(filename string, alias string) (string, error) {
	root, err := s.WithRoot(filepath.ToSlash(filename), alias)
	if err != nil {
		return "", nil
	}
	return root, err
}

func (s *Service) LoadFilePath(filename string, alias string) (string, error) {
	filename = filepath.Clean(filename)
	return s.WithRoot(filename, alias)
}

// WithRoot joins s.composeRoot() with filename
func (s *Service) WithRoot(filename, rootAlias string) (string, error) {
	filename = filepath.Clean(filename)
	if rootAlias == "" {
		// use compose locations
		return filepath.Join(s.composeRoot(), filename), nil
	}

	// use other dir
	root, err := s.getOtherRoot(rootAlias)
	if err != nil {
		return "", err
	}
	return filepath.Join(root, filename), nil
}

// for other locations
func (s *Service) getOtherRoot(alias string) (string, error) {
	return s.store.Get(alias)
}

func (s *Service) Format(filename string, alias string) ([]byte, error) {
	path, err := s.WithRoot(filename, alias)
	if err != nil {
		return nil, err
	}

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

type SearchResult struct {
	Value   string
	Indexes []int
}

func (s *Service) search(query string, allPaths []string) []SearchResult {
	limit := s.dy.GetDockmanYaml().SearchLimit

	matches := fuzzy.Find(query, allPaths)

	if len(matches) < limit {
		limit = len(matches)
	}
	results := make([]SearchResult, limit)
	for i := 0; i < limit; i++ {
		results[i] = SearchResult{
			Value:   matches[i].Str,
			Indexes: matches[i].MatchedIndexes,
		}
	}

	return results
}

func (s *Service) listAll(alias string) ([]string, error) {
	root, err := s.WithRoot("", alias)
	if err != nil {
		return []string{}, err
	}

	var filez []string
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		left := strings.TrimPrefix(path, root)
		left = strings.TrimPrefix(left, string(filepath.Separator))
		if left != "" {
			filez = append(filez, left)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return filez, nil
}
