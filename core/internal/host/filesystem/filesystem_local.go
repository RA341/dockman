package filesystem

import (
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// LocalFileSystem implements files.FileSystem for local fs
type LocalFileSystem struct {
	root string
}

func NewLocal(root string) FileSystem {
	return &LocalFileSystem{root: root}
}

func (l *LocalFileSystem) Root() string {
	return l.root
}

func (l *LocalFileSystem) MkdirAll(path string, perm os.FileMode) error {
	return os.MkdirAll(l.fullPath(path), perm)
}

func (l *LocalFileSystem) Abs(path string) (string, error) {
	return l.fullPath(path), nil
}

func (l *LocalFileSystem) ReadDir(name string) ([]fs.DirEntry, error) {
	return os.ReadDir(l.fullPath(name))
}

func (l *LocalFileSystem) OpenFile(filename string, flag int, perm fs.FileMode) (io.ReadWriteCloser, error) {
	return os.OpenFile(l.fullPath(filename), flag, perm)
}

func (l *LocalFileSystem) Join(elem ...string) string {
	return filepath.Join(elem...)
}

func (l *LocalFileSystem) LoadFile(filename string) (io.ReadSeekCloser, time.Time, error) {
	file, err := os.OpenFile(l.fullPath(filename), os.O_RDONLY, os.ModePerm)
	if err != nil {
		return nil, time.Time{}, err
	}
	info, err := file.Stat()
	if err != nil {
		return nil, time.Time{}, err
	}
	return file, info.ModTime(), nil
}

func (l *LocalFileSystem) Stat(name string) (os.FileInfo, error) {
	path := l.fullPath(name)
	return os.Stat(path)
}

func (l *LocalFileSystem) RemoveAll(path string) error {
	return os.RemoveAll(l.fullPath(path))
}

func (l *LocalFileSystem) Rename(oldName string, newName string) error {
	return os.Rename(l.fullPath(oldName), l.fullPath(newName))
}

func (l *LocalFileSystem) ReadFile(path string) ([]byte, error) {
	return os.ReadFile(l.fullPath(path))
}

func (l *LocalFileSystem) WalkDir(path string, f func(path string, d fs.DirEntry, err error) error) error {
	return filepath.WalkDir(l.fullPath(path), f)
}

func (l *LocalFileSystem) fullPath(name string) string {
	clean := l.Join(l.root, filepath.Clean(name))
	if !strings.HasPrefix(clean, l.root) {
		// todo maybe err its annoying
		//return "", fmt.Errorf("security violation: path %s is outside root %s", name, l.root)
		return l.root
	}
	return clean
}
