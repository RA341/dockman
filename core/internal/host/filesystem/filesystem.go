package filesystem

import (
	"io"
	"io/fs"
	"os"
	"time"
)

type FileSystem interface {
	Root() string

	MkdirAll(path string, perm os.FileMode) error
	ReadDir(path string) ([]fs.DirEntry, error)
	OpenFile(filename string, flag int, perm fs.FileMode) (io.ReadWriteCloser, error)
	LoadFile(filename string) (io.ReadSeekCloser, time.Time, error)
	Stat(root string) (os.FileInfo, error)
	RemoveAll(fullpath string) error
	Rename(oldPath string, newPath string) error
	ReadFile(fullpath string) ([]byte, error)
	WalkDir(root string, f func(path string, d fs.DirEntry, err error) error) error
	Abs(path string) (string, error)
	Join(elem ...string) string
}
