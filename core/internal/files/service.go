package files

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"text/template"
	"text/template/parse"
	"time"

	"github.com/RA341/dockman/internal/dockyaml"
	"github.com/RA341/dockman/internal/files/utils"
	"github.com/RA341/dockman/internal/host/filesystem"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/gabriel-vasile/mimetype"
	"github.com/sahilm/fuzzy"
)

type FSProvider func(host, alias string) (filesystem.FileSystem, error)
type DockyamlProvider func(host string) *dockyaml.DockmanYaml

type Service struct {
	Fs             FSProvider
	dockYml        DockyamlProvider
	templateFolder string
}

func New(
	fs FSProvider,
	dockYml DockyamlProvider,
) *Service {
	return &Service{
		Fs:      fs,
		dockYml: dockYml,
		// todo load from env
		templateFolder: "templates",
	}
}

type Entry struct {
	fullpath string
	isDir    bool
	children []Entry
}

func (s *Service) List(path string, hostname string) ([]Entry, error) {
	cliFs, relpath, _, err := s.LoadFs(path, hostname)
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
			children, err := s.listFiles(cliFs, fullRelpath, displayPath, hostname)
			if err != nil {
				return nil, err
			}
			ele.children = children
		}

		result = append(result, ele)
	}

	slices.SortFunc(result, func(a, b Entry) int {
		return s.sortFiles(&a, &b, hostname)
	})

	return result, nil
}

func (s *Service) listFiles(
	cliFs filesystem.FileSystem,
	relDirpath string,
	displayPath string,
	hostname string,
) ([]Entry, error) {
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

	slices.SortFunc(filesInSubDir, func(a, b Entry) int {
		return s.sortFiles(&a, &b, hostname)
	})

	return filesInSubDir, nil
}

func (s *Service) Create(filename string, dir bool, hostname string) error {
	cliFs, filename, _, err := s.LoadFs(filename, hostname)
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

func (s *Service) Copy(source, dest, hostname string, isDir bool) error {
	if isDir {
		return fmt.Errorf("directory copying is unimplemented")
	}

	cliFs, sourceFile, _, err := s.LoadFs(source, hostname)
	if err != nil {
		return err
	}

	_, destFile, _, err := s.LoadFs(dest, hostname)
	if err != nil {
		return err
	}

	sourceReader, err := cliFs.OpenFile(sourceFile, os.O_RDONLY, os.ModePerm)
	if err != nil {
		return err
	}

	destWriter, err := cliFs.OpenFile(destFile, os.O_RDWR|os.O_TRUNC|os.O_CREATE, os.ModePerm)
	if err != nil {
		return err
	}

	_, err = io.Copy(destWriter, sourceReader)
	return err
}

func (s *Service) Exists(filename string, hostname string) error {
	cliFs, filename, _, err := s.LoadFs(filename, hostname)
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
	sfCli, fullpath, _, err := s.LoadFs(filename, hostname)
	if err != nil {
		return err
	}
	return sfCli.RemoveAll(fullpath)
}

// Rename todo refactor this
func (s *Service) Rename(oldFileName, newFilename, hostname string) error {
	cliFs, oldFullPath, _, err := s.LoadFs(oldFileName, hostname)
	if err != nil {
		return err
	}

	_, newFullPath, _, err := s.LoadFs(newFilename, hostname)
	if err != nil {
		return err
	}

	oldFileName = filepath.ToSlash(oldFullPath)
	newFilename = filepath.ToSlash(newFullPath)

	return cliFs.Rename(oldFileName, newFilename)
}

type Template struct {
	name string
	vars map[string]string
}

const TemplateFolder = "templates"

func (s *Service) WriteTemplate(hostname string, dest string, tpl *Template) error {
	fsCli, rel, _, err := s.LoadFs(tpl.name, hostname)
	if err != nil {
		return err
	}
	contents, err := fsCli.ReadFile(rel)
	if err != nil {
		return err
	}

	destFsCli, destRel, _, err := s.LoadFs(dest, hostname)
	if err != nil {
		return err
	}

	const selfName = "sd"
	vf := template.New(selfName).Funcs(s.getTmplFuncs())
	tmpl, err := vf.Parse(string(contents))
	if err != nil {
		return err
	}

	for _, subTmpl := range tmpl.Templates() {
		filename := subTmpl.Name()
		if filename == selfName {
			continue
		}

		vars := parseFilename(filename)
		newFilename := filename
		for _, replaceVal := range vars {
			newVal := tpl.vars[replaceVal]
			if newVal == "" {
				return fmt.Errorf("template variable %s is missing",
					replaceVal,
				)
			}
			newFilename = strings.Replace(filename, replaceVal, newVal, -1)
		}

		err := s.createTmplFile(
			tmpl,
			tpl.vars,
			destFsCli,
			destRel,
			filename,
			newFilename,
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) createTmplFile(
	tmpl *template.Template,
	data map[string]string,
	destFsCli filesystem.FileSystem,
	destRel string,
	tmplName string,
	filename string,
) error {
	fpath := destFsCli.Join(destRel, filename)

	err := destFsCli.MkdirAll(filepath.Dir(fpath), os.ModePerm)
	if err != nil {
		return err
	}

	file, err := destFsCli.OpenFile(fpath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, os.ModePerm)
	if err != nil {
		return err
	}
	defer fileutil.Close(file)

	return tmpl.ExecuteTemplate(file, tmplName, data)
}

func parseFilename(filename string) []string {
	var vars []string

	acc := ""
	for _, ch := range filename {
		if ch == '$' {
			if acc != "" {
				acc = acc + string(ch) // add the last $
				vars = append(vars, acc)
				acc = ""
				continue
			}

			acc = acc + string(ch)
			continue
		}
		if acc != "" {
			acc = acc + string(ch)
		}
	}

	return vars
}

// custom functions for now
func (s *Service) getTmplFuncs() template.FuncMap {
	return template.FuncMap{}
}

func (s *Service) GetTemplates(fPath string, hostname string) ([]Template, error) {
	fsCli, rel, parsedAlias, err := s.LoadFs(fPath, hostname)
	if err != nil {
		return nil, err
	}
	// always root it to alias we dont need to check sub paths
	rel = ""

	templateBase := fsCli.Join(rel, TemplateFolder)
	templates, err := fsCli.ReadDir(templateBase)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}

	var tmpls []Template

	for _, tpl := range templates {
		relBase := fsCli.Join(templateBase, tpl.Name())
		content, err := fsCli.ReadFile(relBase)
		if err != nil {
			return nil, err
		}

		trees, err := parse.Parse(
			"stack", string(content),
			"", "",
			s.getTmplFuncs(),
		)
		if err != nil {
			return nil, err
		}

		name := filepath.Join(parsedAlias, relBase)
		elems := Template{
			name: name,
			vars: make(map[string]string),
		}

		for key := range trees {
			vars := parseFilename(key)
			for _, v := range vars {
				elems.vars[v] = ""
			}

			tree := trees[key]
			// get var names in tmpl
			for _, node := range tree.Root.Nodes {
				if action, ok := node.(*parse.ActionNode); ok {
					cleanKey := strings.TrimPrefix(action.Pipe.String(), ".")
					elems.vars[cleanKey] = ""
				}
			}
		}

		tmpls = append(tmpls, elems)
	}

	return tmpls, nil
}

func (s *Service) Save(filename, hostname string, create bool, source io.Reader) error {
	sfCli, filename, _, err := s.LoadFs(filename, hostname)
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
	fsCli, fullpath, _, err := s.LoadFs(filename, hostname)
	if err != nil {
		return nil, err
	}
	file, err := fsCli.ReadFile(fullpath)
	if err != nil {
		return nil, err
	}

	return file, err
}

func (s *Service) LoadFilePath(filename, hostname string, download bool) (io.ReadSeekCloser, time.Time, error) {
	cliFs, relpath, _, err := s.LoadFs(filename, hostname)
	if err != nil {
		return nil, time.Time{}, err
	}

	if download {
		stat, err := cliFs.Stat(relpath)
		if err != nil {
			return nil, time.Time{}, err
		}

		if stat.IsDir() {
			// convert to zip
			// todo
		} else {
			return cliFs.LoadFile(relpath)
		}
	}

	file, t, err := cliFs.LoadFile(relpath)
	if err != nil {
		return nil, time.Time{}, err
	}

	err = CheckFileType(file)
	if err != nil {
		// file cannot be opened close it before return the err
		fileutil.Close(file)
		return nil, time.Time{}, errors.Join(ErrFileNotSupported, err)
	}

	// reset seek pointer after checking trghe file mime
	_, err = file.Seek(0, io.SeekStart)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("failed to seek: %w", err)
	}

	return file, t, err
}

var ErrFileNotSupported = errors.New("file type not supported")

func CheckFileType(reader io.Reader) error {
	mtype, err := mimetype.DetectReader(reader)
	if err != nil {
		return err
	}

	// Almost all text formats (json, yaml, txt)
	// inherit from "text/plain"
	// todo
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

func (s *Service) LoadAll(filename string, hostname string) (
	fs filesystem.FileSystem,
	relpath string,
	alias string,
	err error,
) {
	filename, pathAlias, err := utils.ExtractMeta(filename)
	if err != nil {
		return nil, "", "", err
	}

	fsCli, err := s.Fs(hostname, pathAlias)
	if err != nil {
		return nil, "", "", err
	}

	return fsCli, filename, pathAlias, nil
}

// LoadFs FS gets the correct client -> alias -> path
func (s *Service) LoadFs(filename string, hostname string) (fs filesystem.FileSystem, relpath string, alias string, err error) {
	fsCli, relpath, alias, err := s.LoadAll(filename, hostname)
	if err != nil {
		return nil, "", alias, err
	}
	return fsCli, relpath, alias, nil
}

func (s *Service) Format(filename string, hostname string) ([]byte, error) {
	sfCLi, filename, _, err := s.LoadFs(filename, hostname)
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

func (s *Service) search(hostname string, query string, allPaths []string) []SearchResult {
	limit := s.dockYml(hostname).SearchLimit

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

func (s *Service) listAllForSearch(dirPath string, hostname string) ([]string, error) {
	fsCli, rel, _, err := s.LoadAll(dirPath, hostname)
	if err != nil {
		return nil, err
	}

	root := fsCli.Root()

	var filez []string
	err = fsCli.WalkDir(rel, func(path string, d fs.DirEntry, err error) error {
		if d.IsDir() {
			return nil
		}

		left := strings.TrimPrefix(path, root)
		left = strings.TrimPrefix(left, string(filepath.Separator))
		if left != "" {
			filez = append(filez, left)
		}

		return nil
	})

	return filez, err
}

func (s *Service) sortFiles(a, b *Entry, host string) int {
	ra := s.getSortRank(a, host)
	rb := s.getSortRank(b, host)

	if ra < rb {
		return -1
	}
	if ra > rb {
		return 1
	}
	return strings.Compare(a.fullpath, b.fullpath)
}

// getSortRank determines priority: dotfiles, directories, then files by getFileSortRank
func (s *Service) getSortRank(entry *Entry, host string) int {
	conf := s.dockYml(host)

	base := filepath.Base(entry.fullpath)
	// -1: pinned files (highest priority)
	if priority, ok := conf.PinnedFiles[base]; ok {
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
	return 3 + s.getFileSortRank(entry.fullpath)
}

// getFileSortRank assigns priority within normal files
func (s *Service) getFileSortRank(filename string) int {
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
