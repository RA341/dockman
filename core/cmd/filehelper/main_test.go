package main

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestCleanRootUsesDot(t *testing.T) {
	if actual := clean("/"); actual != "." {
		t.Fatalf("clean(/) = %q; want .", actual)
	}
}

func TestChownRejectsInvalidIDs(t *testing.T) {
	directory := t.TempDir()
	root, err := os.OpenRoot(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if err = chown(root, ".", "-1", "0", false); err == nil {
		t.Fatal("chown accepted a negative uid")
	}
	if err = chown(root, ".", "owner", "0", false); err == nil {
		t.Fatal("chown accepted a non-numeric uid")
	}
}

func TestChownRecursivelyAcceptsCurrentOwnership(t *testing.T) {
	directory := t.TempDir()
	if err := os.Mkdir(filepath.Join(directory, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "nested", "file"), []byte("dockman"), 0o600); err != nil {
		t.Fatal(err)
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	if err = chown(root, "nested", strconv.Itoa(os.Getuid()), strconv.Itoa(os.Getgid()), true); err != nil {
		t.Fatal(err)
	}
}
