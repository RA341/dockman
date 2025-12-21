package filesystem

import (
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
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
	return s.fullPath(path), nil
}

func NewSftp(client *sftp.Client, root string) *SftpFileSystem {
	return &SftpFileSystem{
		client: client,
		root:   root,
	}
}

func (s *SftpFileSystem) MkdirAll(path string, perm os.FileMode) error {
	return s.client.MkdirAll(s.fullPath(path))
}

func (s *SftpFileSystem) ReadDir(path string) ([]fs.DirEntry, error) {
	client := s.client
	dirs, err := client.ReadDir(s.fullPath(path))
	if err != nil {
		return nil, err
	}

	entries := make([]fs.DirEntry, len(dirs))
	for i, info := range dirs {
		entries[i] = fs.FileInfoToDirEntry(info)
	}
	return entries, nil
}

func (s *SftpFileSystem) OpenFile(filename string, flag int, perm fs.FileMode) (io.WriteCloser, error) {
	return s.client.OpenFile(s.fullPath(filename), flag)
}

func (s *SftpFileSystem) LoadFile(filename string) (io.ReadSeekCloser, time.Time, error) {
	file, err := s.client.OpenFile(s.fullPath(filename), os.O_RDONLY)
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
	return s.client.Stat(s.fullPath(filename))
}

func (s *SftpFileSystem) RemoveAll(path string) error {
	return s.client.RemoveAll(s.fullPath(path))
}

func (s *SftpFileSystem) Rename(name string, filename string) error {
	return s.client.Rename(name, s.fullPath(filename))
}

func (s *SftpFileSystem) ReadFile(fullpath string) ([]byte, error) {
	open, err := s.client.Open(s.fullPath(fullpath))
	if err != nil {
		return nil, err
	}
	defer fileutil.Close(open)
	return io.ReadAll(open)
}

func (s *SftpFileSystem) WalkDir(root string, fn func(path string, d fs.DirEntry, err error) error) error {
	walker := s.client.Walk(s.fullPath(root))
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

func (s *SftpFileSystem) fullPath(name string) string {
	// todo possible bug: filepath.clean using local system may fail on windows
	clean := s.client.Join(s.root, filepath.Clean(name))
	if !strings.HasPrefix(clean, s.root) {
		// todo maybe err its annoying
		//return "", fmt.Errorf("security violation: path %s is outside root %s", name, l.root)
		return s.root
	}
	return clean
}
