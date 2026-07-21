package filesystem

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"strings"
	"time"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/pkg/sftp"
)

// SftpFileSystem implements FileSystem for ssh connections
type SftpFileSystem struct {
	client *sftp.Client
	root   string
}

func (s *SftpFileSystem) Abs(path string) (string, error) {
	return s.fullPath(path)
}

func NewSftp(client *sftp.Client, root string) *SftpFileSystem {
	return &SftpFileSystem{
		client: client,
		root:   root,
	}
}

func (s *SftpFileSystem) Root() string {
	return s.root
}

func (s *SftpFileSystem) MkdirAll(path string, perm os.FileMode) error {
	full, err := s.fullPath(path)
	if err != nil {
		return err
	}
	return s.client.MkdirAll(full)
}

func (s *SftpFileSystem) ReadDir(path string) ([]fs.DirEntry, error) {
	client := s.client
	full, err := s.fullPath(path)
	if err != nil {
		return nil, err
	}
	dirs, err := client.ReadDir(full)
	if err != nil {
		return nil, err
	}

	entries := make([]fs.DirEntry, len(dirs))
	for i, info := range dirs {
		entries[i] = fs.FileInfoToDirEntry(info)
	}
	return entries, nil
}

func (s *SftpFileSystem) OpenFile(filename string, flag int, perm fs.FileMode) (io.ReadWriteCloser, error) {
	full, err := s.fullPath(filename)
	if err != nil {
		return nil, err
	}
	return s.client.OpenFile(full, flag)
}

func (s *SftpFileSystem) Join(elem ...string) string {
	return s.client.Join(elem...)
}

func (s *SftpFileSystem) LoadFile(filename string) (io.ReadSeekCloser, time.Time, error) {
	full, err := s.fullPath(filename)
	if err != nil {
		return nil, time.Time{}, err
	}
	file, err := s.client.OpenFile(full, os.O_RDONLY)
	if err != nil {
		return nil, time.Time{}, err
	}

	stat, err := file.Stat()
	if err != nil {
		return nil, time.Time{}, err
	}
	return file, stat.ModTime(), nil
}

func (s *SftpFileSystem) Stat(filename string) (os.FileInfo, error) {
	full, err := s.fullPath(filename)
	if err != nil {
		return nil, err
	}
	return s.client.Stat(full)
}

func (s *SftpFileSystem) RemoveAll(name string) error {
	full, err := s.fullPath(name)
	if err != nil {
		return err
	}
	realRoot, err := s.client.RealPath(path.Clean(filepathToSlash(s.root)))
	if err != nil {
		return fmt.Errorf("resolve SFTP root %q: %w", s.root, err)
	}
	if path.Clean(full) == path.Clean(realRoot) {
		return fmt.Errorf("refusing to remove filesystem root: %w", ErrPathOutsideRoot)
	}
	return s.client.RemoveAll(full)
}

func (s *SftpFileSystem) Rename(name string, filename string) error {
	oldFull, err := s.fullPath(name)
	if err != nil {
		return err
	}
	newFull, err := s.fullPath(filename)
	if err != nil {
		return err
	}
	return s.client.Rename(oldFull, newFull)
}

func (s *SftpFileSystem) ReadFile(fullpath string) ([]byte, error) {
	full, err := s.fullPath(fullpath)
	if err != nil {
		return nil, err
	}
	open, err := s.client.Open(full)
	if err != nil {
		return nil, err
	}
	defer fileutil.Close(open)
	return io.ReadAll(open)
}

func (s *SftpFileSystem) WalkDir(root string, fn func(path string, d fs.DirEntry, err error) error) error {
	full, err := s.fullPath(root)
	if err != nil {
		return err
	}
	walker := s.client.Walk(full)
	for walker.Step() {
		err := walker.Err()
		path := walker.Path()
		info := walker.Stat()
		var entry fs.DirEntry
		if info != nil {
			entry = fs.FileInfoToDirEntry(info)
		}
		userErr := fn(path, entry, err)
		if errors.Is(userErr, fs.SkipDir) {
			walker.SkipDir()
			continue
		}
		if userErr != nil {
			return userErr
		}
	}
	return nil
}

func (s *SftpFileSystem) fullPath(name string) (string, error) {
	root := path.Clean(filepathToSlash(s.root))
	clean := path.Clean(filepathToSlash(name))
	if path.IsAbs(clean) {
		var ok bool
		clean, ok = remoteRelative(root, clean)
		if !ok {
			return "", fmt.Errorf("%w: %q", ErrPathOutsideRoot, name)
		}
	}
	if clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("%w: %q", ErrPathOutsideRoot, name)
	}
	candidate := path.Join(root, clean)

	// Resolve existing paths (or the closest existing parent for creations)
	// server-side. This prevents a symlink below the configured root from
	// redirecting SFTP operations elsewhere on the remote host.
	realRoot, err := s.client.RealPath(root)
	if err != nil {
		return "", fmt.Errorf("resolve SFTP root %q: %w", root, err)
	}
	realCandidate, err := s.realPathOrParent(candidate)
	if err != nil {
		return "", err
	}
	if !remotePathWithin(realRoot, realCandidate) {
		return "", fmt.Errorf("%w: %q", ErrPathOutsideRoot, name)
	}
	return realCandidate, nil
}

func (s *SftpFileSystem) realPathOrParent(candidate string) (string, error) {
	current := candidate
	var missing []string
	for {
		resolved, err := s.client.RealPath(current)
		if err == nil {
			for i := len(missing) - 1; i >= 0; i-- {
				resolved = path.Join(resolved, missing[i])
			}
			return resolved, nil
		}
		if !os.IsNotExist(err) {
			return "", fmt.Errorf("resolve SFTP path %q: %w", candidate, err)
		}
		parent := path.Dir(current)
		if parent == current {
			return "", fmt.Errorf("resolve SFTP path %q: %w", candidate, err)
		}
		missing = append(missing, path.Base(current))
		current = parent
	}
}

func remotePathWithin(root, candidate string) bool {
	_, ok := remoteRelative(path.Clean(root), path.Clean(candidate))
	return ok
}

func remoteRelative(root, candidate string) (string, bool) {
	root = path.Clean(root)
	candidate = path.Clean(candidate)
	if candidate == root {
		return ".", true
	}
	if root == "/" && strings.HasPrefix(candidate, "/") {
		return strings.TrimPrefix(candidate, "/"), true
	}
	prefix := root + "/"
	if strings.HasPrefix(candidate, prefix) {
		return strings.TrimPrefix(candidate, prefix), true
	}
	return "", false
}

func filepathToSlash(value string) string {
	return strings.ReplaceAll(value, "\\", "/")
}
