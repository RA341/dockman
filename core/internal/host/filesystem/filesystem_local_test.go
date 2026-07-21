package filesystem

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalFileSystemConfinesPathsAndSymlinks(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "compose")
	sibling := filepath.Join(parent, "compose-secret")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(sibling, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sibling, "secret"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	fsys := NewLocal(root)
	for _, escaped := range []string{"../compose-secret/secret", filepath.Join(sibling, "secret")} {
		if _, err := fsys.ReadFile(escaped); !errors.Is(err, ErrPathOutsideRoot) {
			t.Fatalf("ReadFile(%q) error = %v, want ErrPathOutsideRoot", escaped, err)
		}
	}

	if err := os.Symlink(sibling, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	if _, err := fsys.ReadFile("escape/secret"); err == nil {
		t.Fatal("ReadFile followed a symlink outside the configured root")
	}
}

func TestLocalFileSystemAllowsRootedAndRelativePaths(t *testing.T) {
	root := t.TempDir()
	fsys := NewLocal(root)
	if err := fsys.MkdirAll("stack", 0o755); err != nil {
		t.Fatal(err)
	}
	file, err := fsys.OpenFile(filepath.Join(root, "stack", "compose.yml"), os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = file.Write([]byte("services: {}")); err != nil {
		t.Fatal(err)
	}
	if err = file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err = fsys.ReadFile("stack/compose.yml"); err != nil {
		t.Fatal(err)
	}
}

func TestLocalFileSystemRefusesRootRemoval(t *testing.T) {
	fsys := NewLocal(t.TempDir())
	if err := fsys.RemoveAll("."); !errors.Is(err, ErrPathOutsideRoot) {
		t.Fatalf("RemoveAll(.) error = %v, want ErrPathOutsideRoot", err)
	}
}
