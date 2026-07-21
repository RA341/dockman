// filehelper is a small, static companion copied into managed containers.
// It deliberately accepts argv values (never shell source) and confines every
// operation beneath an os.Root so symlinks and traversal cannot escape it.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type entry struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Size        int64  `json:"size"`
	Mode        string `json:"mode"`
	Permissions string `json:"permissions"`
	Modified    string `json:"modified"`
	UID         uint32 `json:"uid"`
	GID         uint32 `json:"gid"`
	LinkTarget  string `json:"linkTarget,omitempty"`
}

func main() {
	args := os.Args[1:]
	if len(args) == 1 && args[0] == "hold" {
		select {}
	}
	if len(args) > 0 && args[0] == "--unlink" {
		_ = os.Remove(os.Args[0])
		args = args[1:]
	}
	if len(args) < 3 || args[0] != "--root" {
		fatal("usage: filehelper --root ROOT command [arguments]")
	}
	root, err := os.OpenRoot(args[1])
	if err != nil {
		fatalErr(err)
	}
	defer root.Close()

	commandArgs := args[3:]
	switch args[2] {
	case "list":
		requireArgs(commandArgs, 1)
		err = list(root, commandArgs[0])
	case "create-file":
		requireArgs(commandArgs, 1)
		var f *os.File
		f, err = root.OpenFile(clean(commandArgs[0]), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if f != nil {
			err = errors.Join(err, f.Close())
		}
	case "create-folder":
		requireArgs(commandArgs, 1)
		err = root.Mkdir(clean(commandArgs[0]), 0o755)
	case "rename":
		requireArgs(commandArgs, 2)
		err = root.Rename(clean(commandArgs[0]), clean(commandArgs[1]))
	case "delete":
		requireArgs(commandArgs, 1)
		name := clean(commandArgs[0])
		if name == "." {
			fatal("refusing to delete the browser root")
		}
		err = root.RemoveAll(name)
	case "chmod":
		requireArgs(commandArgs, 3)
		err = chmod(root, commandArgs[0], commandArgs[1], commandArgs[2] == "true")
	default:
		fatal("unsupported operation")
	}
	if err != nil {
		fatalErr(err)
	}
}

func clean(value string) string {
	if strings.IndexByte(value, 0) >= 0 {
		fatal("path contains a NUL byte")
	}
	for _, part := range strings.Split(strings.ReplaceAll(value, "\\", "/"), "/") {
		if part == ".." {
			fatal("parent traversal is not allowed")
		}
	}
	return strings.TrimPrefix(path.Clean("/"+value), "/")
}

func list(root *os.Root, raw string) error {
	name := clean(raw)
	dir, err := root.Open(name)
	if err != nil {
		return err
	}
	defer dir.Close()
	items, err := dir.ReadDir(-1)
	if err != nil {
		return err
	}
	out := make([]entry, 0, len(items))
	for _, item := range items {
		info, infoErr := item.Info()
		if infoErr != nil {
			return infoErr
		}
		kind := "file"
		switch {
		case info.IsDir():
			kind = "directory"
		case info.Mode()&os.ModeSymlink != 0:
			kind = "symlink"
		case !info.Mode().IsRegular():
			kind = "other"
		}
		uid, gid := uint32(0), uint32(0)
		if stat, ok := info.Sys().(*syscall.Stat_t); ok {
			uid, gid = stat.Uid, stat.Gid
		}
		var target string
		if kind == "symlink" {
			target, _ = root.Readlink(path.Join(name, item.Name()))
		}
		out = append(out, entry{
			Name: item.Name(), Type: kind, Size: info.Size(), Mode: fmt.Sprintf("%03o", info.Mode().Perm()),
			Permissions: info.Mode().String(), Modified: info.ModTime().UTC().Format(time.RFC3339Nano),
			UID: uid, GID: gid, LinkTarget: target,
		})
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		Path    string  `json:"path"`
		Entries []entry `json:"entries"`
	}{Path: "/" + strings.TrimPrefix(name, "."), Entries: out})
}

func chmod(root *os.Root, rawPath, rawMode string, recursive bool) error {
	mode64, err := strconv.ParseUint(rawMode, 8, 32)
	if err != nil || mode64 > 0o7777 {
		return fmt.Errorf("invalid octal mode %q", rawMode)
	}
	name := clean(rawPath)
	mode := fs.FileMode(mode64)
	if !recursive {
		return root.Chmod(name, mode)
	}
	return fs.WalkDir(root.FS(), name, func(current string, item fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if item.Type()&os.ModeSymlink != 0 {
			return nil
		}
		return root.Chmod(current, mode)
	})
}

func requireArgs(args []string, count int) {
	if len(args) != count {
		fatal("invalid argument count")
	}
}

func fatal(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(2)
}

func fatalErr(err error) { fatal(err.Error()) }
