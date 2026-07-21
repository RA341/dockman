package filesystem

import (
	"fmt"
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
	rel, err := l.relativePath(path)
	if err != nil {
		return err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return err
	}
	defer root.Close()
	return root.MkdirAll(rel, perm)
}

func (l *LocalFileSystem) Abs(path string) (string, error) {
	rel, err := l.relativePath(path)
	if err != nil {
		return "", err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return "", err
	}
	defer root.Close()
	if _, err = root.Stat(rel); err != nil {
		return "", err
	}
	return filepath.Join(l.root, rel), nil
}

func (l *LocalFileSystem) ReadDir(name string) ([]fs.DirEntry, error) {
	rel, err := l.relativePath(name)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return fs.ReadDir(root.FS(), filepath.ToSlash(rel))
}

func (l *LocalFileSystem) OpenFile(filename string, flag int, perm fs.FileMode) (io.ReadWriteCloser, error) {
	rel, err := l.relativePath(filename)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return root.OpenFile(rel, flag, perm)
}

func (l *LocalFileSystem) Join(elem ...string) string {
	return filepath.Join(elem...)
}

func (l *LocalFileSystem) LoadFile(filename string) (io.ReadSeekCloser, time.Time, error) {
	rel, err := l.relativePath(filename)
	if err != nil {
		return nil, time.Time{}, err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer root.Close()
	file, err := root.OpenFile(rel, os.O_RDONLY, os.ModePerm)
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
	rel, err := l.relativePath(name)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return root.Stat(rel)
}

func (l *LocalFileSystem) RemoveAll(path string) error {
	rel, err := l.relativePath(path)
	if err != nil {
		return err
	}
	if rel == "." {
		return fmt.Errorf("refusing to remove filesystem root: %w", ErrPathOutsideRoot)
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return err
	}
	defer root.Close()
	return root.RemoveAll(rel)
}

func (l *LocalFileSystem) Rename(oldName string, newName string) error {
	oldRel, err := l.relativePath(oldName)
	if err != nil {
		return err
	}
	newRel, err := l.relativePath(newName)
	if err != nil {
		return err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return err
	}
	defer root.Close()
	return root.Rename(oldRel, newRel)
}

func (l *LocalFileSystem) ReadFile(path string) ([]byte, error) {
	rel, err := l.relativePath(path)
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	return root.ReadFile(rel)
}

func (l *LocalFileSystem) WalkDir(name string, f func(path string, d fs.DirEntry, err error) error) error {
	rel, err := l.relativePath(name)
	if err != nil {
		return err
	}
	root, err := os.OpenRoot(l.root)
	if err != nil {
		return err
	}
	defer root.Close()
	return fs.WalkDir(root.FS(), filepath.ToSlash(rel), func(path string, d fs.DirEntry, walkErr error) error {
		return f(filepath.Join(l.root, filepath.FromSlash(path)), d, walkErr)
	})
}

func (l *LocalFileSystem) relativePath(name string) (string, error) {
	root := filepath.Clean(l.root)
	clean := filepath.Clean(name)
	if filepath.IsAbs(clean) {
		var err error
		clean, err = filepath.Rel(root, clean)
		if err != nil {
			return "", fmt.Errorf("resolve %q from %q: %w", name, root, err)
		}
	}
	if clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("%w: %q", ErrPathOutsideRoot, name)
	}
	return clean, nil
}
