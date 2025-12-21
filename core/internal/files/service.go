package files

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/files/filesystem"
	"github.com/RA341/dockman/pkg/fileutil"

	"github.com/gabriel-vasile/mimetype"
	"github.com/pkg/sftp"
	"github.com/rs/zerolog/log"
	"github.com/sahilm/fuzzy"
)

type ActiveMachineFolderProvider func() string
type ActiveFS func(client, root string) (filesystem.FileSystem, error)
type SFTPProvider func(client string) (*sftp.Client, error)

type Service struct {
	config *config.FilePerms
	store  Store
	GetFS  ActiveFS
	dy     *ServiceDockmanYaml
}

// RootAlias default file location alias for compose root
const RootAlias = "compose"

func FormatAlias(alias string, host string) string {
	return fmt.Sprintf("%s/%s", host, alias)
}

func New(
	store Store,
	getSSH SFTPProvider,
	dy *ServiceDockmanYaml,
	localComposeRoot string,
	config *config.FilePerms,
) *Service {
	alias := FormatAlias(RootAlias, container.LocalClient)
	val, err := store.Get(alias)
	if err != nil {
		err = store.AddAlias(alias, localComposeRoot)
	} else {
		val.Fullpath = localComposeRoot
		err = store.EditAlias(val.ID, &val)
	}
	if err != nil {
		log.Fatal().Err(err).
			Str("alias", RootAlias).
			Msg("could not setup alias for local compose root")
	}

	var activeFs ActiveFS = func(client, root string) (filesystem.FileSystem, error) {
		if client == container.LocalClient {
			return filesystem.NewLocal(root), nil
		}
		mach, err := getSSH(client)
		if err != nil {
			return nil, err
		}
		return filesystem.NewSftp(mach, root), nil
	}
	srv := &Service{
		config: config,
		store:  store,
		GetFS:  activeFs,
		dy:     dy,
	}

	log.Debug().Msg("File service loaded successfully")
	return srv
}

type Entry struct {
	fullpath string
	isDir    bool
	children []Entry
}

func (s *Service) List(path string, hostname string) ([]Entry, error) {
	cliFs, relpath, err := s.LoadFs(path, hostname)
	if err != nil {
		return nil, err
	}

	topLevelEntries, err := cliFs.ReadDir(relpath)
	if err != nil {
		return nil, fmt.Errorf("failed to list files in compose root: %v", err)
	}

	result := make([]Entry, 0, len(topLevelEntries))
	for _, entry := range topLevelEntries {
		fullRelpath := filepath.Join(relpath, entry.Name())
		displayPath := filepath.Join(path, entry.Name())

		isDir := entry.IsDir()

		ele := Entry{
			fullpath: displayPath,
			isDir:    isDir,
		}

		if isDir {
			children, err := s.listFiles(cliFs, fullRelpath, displayPath)
			if err != nil {
				return nil, err
			}
			ele.children = children
		}

		result = append(result, ele)
	}

	conf := s.dy.GetDockmanYaml()
	slices.SortFunc(result, func(a, b Entry) int {
		return conf.sortFiles(&a, &b)
	})

	return result, nil
}

func (s *Service) listFiles(cliFs filesystem.FileSystem, relDirpath string, displayPath string) ([]Entry, error) {
	subEntries, err := cliFs.ReadDir(relDirpath)
	if err != nil {
		return nil, err
	}

	filesInSubDir := make([]Entry, 0, len(subEntries))
	for _, subEntry := range subEntries {
		join := filepath.Join(displayPath, subEntry.Name())
		filesInSubDir = append(filesInSubDir,
			Entry{
				fullpath: join,
				isDir:    subEntry.IsDir(),
				children: []Entry{},
			},
		)
	}

	// sort subfiles
	conf := s.dy.GetDockmanYaml()
	slices.SortFunc(filesInSubDir, func(a, b Entry) int {
		return conf.sortFiles(&a, &b)
	})

	return filesInSubDir, nil
}

func (s *Service) Create(filename string, dir bool, hostname string) error {
	cliFs, filename, err := s.LoadFs(filename, hostname)
	if err != nil {
		return err
	}

	if dir {
		return cliFs.MkdirAll(filename, os.ModePerm)
	}

	baseDir := filepath.Dir(filename)
	if err = cliFs.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	file, err := cliFs.OpenFile(
		filename,
		os.O_RDWR|os.O_CREATE,
		os.ModePerm,
	)
	if err != nil {
		return err
	}
	fileutil.Close(file)

	return nil
}

func (s *Service) Exists(filename string, hostname string) error {
	cliFs, filename, err := s.LoadFs(filename, hostname)
	if err != nil {
		return err
	}

	stat, err := cliFs.Stat(filename)
	if err != nil {
		return err
	}
	if stat.IsDir() {
		return fmt.Errorf("%s is a directory, cannot be opened", filename)
	}

	return nil
}

func (s *Service) Delete(filename string, hostname string) error {
	sfCli, fullpath, err := s.LoadFs(filename, hostname)
	if err != nil {
		return err
	}
	return sfCli.RemoveAll(fullpath)
}

// Rename todo refactor this
func (s *Service) Rename(oldFileName, newFilename, hostname string) error {
	cliFs, oldFullPath, err := s.LoadFs(oldFileName, hostname)
	if err != nil {
		return err
	}

	_, newFullPath, err := s.LoadFs(newFilename, hostname)
	if err != nil {
		return err
	}

	oldFileName = filepath.ToSlash(oldFullPath)
	newFilename = filepath.ToSlash(newFullPath)

	return cliFs.Rename(oldFileName, newFilename)
}

func (s *Service) Save(filename, hostname string, create bool, source io.Reader) error {
	sfCli, filename, err := s.LoadFs(filename, hostname)
	if err != nil {
		return err
	}

	flag := os.O_RDWR | os.O_TRUNC
	if create {
		flag |= os.O_CREATE
	}

	dest, err := sfCli.OpenFile(filename, flag, os.ModePerm)
	if err != nil {
		return err
	}
	defer fileutil.Close(dest)

	_, err = io.Copy(dest, source)
	return err
}

func (s *Service) getFileContents(filename, hostname string) ([]byte, error) {
	fsCli, fullpath, err := s.LoadFs(filename, hostname)
	if err != nil {
		return nil, err
	}
	file, err := fsCli.ReadFile(fullpath)
	if err != nil {
		return nil, err
	}

	return file, err
}

func (s *Service) LoadFilePath(filename, hostname string) (io.ReadSeekCloser, time.Time, error) {
	cliFs, relpath, err := s.LoadFs(filename, hostname)
	if err != nil {
		return nil, time.Time{}, err
	}

	file, t, err := cliFs.LoadFile(relpath)
	if err != nil {
		return nil, time.Time{}, err
	}

	err = CheckFileType(file)
	if err != nil {
		// file cannot be opened close it before return the err
		fileutil.Close(file)
		return nil, time.Time{}, err
	}

	// reset seek pointer after checking trghe file mime
	_, err = file.Seek(0, io.SeekStart)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("failed to seek: %w", err)
	}

	return file, t, err
}

func CheckFileType(reader io.Reader) error {
	mtype, err := mimetype.DetectReader(reader)
	if err != nil {
		return err
	}

	// Almost all text formats (json, yaml, txt)
	// inherit from "text/plain"
	isText := false
	for m := mtype; m != nil; m = m.Parent() {
		if m.Is("text/plain") {
			return nil
		}
	}

	// Explicit check for SQLite
	if mtype.String() == "application/x-sqlite3" {
		return fmt.Errorf("SQLite not allowed")
	}

	if !isText {
		return fmt.Errorf("binary files not allowed")
	}

	return nil
}

// LoadAll todo refactor too many returns
func (s *Service) LoadAll(filename string, hostname string) (fs filesystem.FileSystem, relpath string, root string, err error) {
	filename, pathAlias, err := s.extractMeta(filename)
	if err != nil {
		return nil, "", "", err
	}

	alias, err := s.store.Get(FormatAlias(pathAlias, hostname))
	if err != nil {
		return nil, "", "", fmt.Errorf("could not find path for alias %s", pathAlias)
	}

	fsCli, err := s.GetFS(hostname, alias.Fullpath)
	if err != nil {
		return nil, "", "", err
	}

	return fsCli, filename, alias.Fullpath, nil
}

// LoadFs FS gets the correct client -> alias -> path
func (s *Service) LoadFs(filename string, hostname string) (fs filesystem.FileSystem, relpath string, err error) {
	fsCli, relpath, _, err := s.LoadAll(filename, hostname)
	if err != nil {
		return nil, "", err
	}
	return fsCli, relpath, nil
}

func (s *Service) extractMeta(filename string) (relpath string, pathAlias string, err error) {
	filename = filepath.Clean(filename) + "/" // empty trailing "/" is stripped by clean
	parts := strings.SplitN(filename, "/", 2)
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid filename: %s", filename)
	}
	pathAlias = parts[0]
	relpath = filepath.Clean(parts[1])

	return relpath, pathAlias, nil
}

func (s *Service) Format(filename string, hostname string) ([]byte, error) {
	sfCLi, filename, err := s.LoadFs(filename, hostname)
	if err != nil {
		return nil, err
	}

	contents, err := sfCLi.ReadFile(filename)
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

func (s *Service) listAll(dirPath string, hostname string) ([]string, error) {
	fsCli, rel, root, err := s.LoadAll(dirPath, hostname)
	if err != nil {
		return nil, err
	}

	var filez []string
	err = fsCli.WalkDir(rel, func(path string, d fs.DirEntry, err error) error {
		left := strings.TrimPrefix(path, root)
		left = strings.TrimPrefix(left, string(filepath.Separator))
		if left != "" {
			filez = append(filez, left)
		}
		return nil
	})

	return filez, err
}
