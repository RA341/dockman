package docker

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"io"
	"testing"
)

func TestCleanBrowserPathRejectsTraversal(t *testing.T) {
	for _, value := range []string{"../etc", "/var/../etc", `..\etc`} {
		if _, err := cleanBrowserPath(value); err == nil {
			t.Fatalf("cleanBrowserPath(%q) accepted parent traversal", value)
		}
	}
	for input, expected := range map[string]string{"": "/", "/etc//nginx/": "/etc/nginx", "var/log": "/var/log"} {
		actual, err := cleanBrowserPath(input)
		if err != nil || actual != expected {
			t.Fatalf("cleanBrowserPath(%q) = %q, %v; want %q", input, actual, err, expected)
		}
	}
}

func TestCleanBrowserNameRejectsPaths(t *testing.T) {
	for _, value := range []string{"", ".", "..", "dir/file", `dir\file`, "bad\x00name"} {
		if _, err := cleanBrowserName(value); err == nil {
			t.Fatalf("cleanBrowserName(%q) accepted an invalid name", value)
		}
	}
	if actual, err := cleanBrowserName("compose.yml"); err != nil || actual != "compose.yml" {
		t.Fatalf("cleanBrowserName returned %q, %v", actual, err)
	}
}

func TestTarToZipPreservesFile(t *testing.T) {
	var source bytes.Buffer
	tw := tar.NewWriter(&source)
	content := []byte("dockman")
	if err := tw.WriteHeader(&tar.Header{Name: "folder/test.txt", Mode: 0o640, Size: int64(len(content))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}

	var destination bytes.Buffer
	if err := tarToZip(&destination, &source); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(destination.Bytes()), int64(destination.Len()))
	if err != nil {
		t.Fatal(err)
	}
	if len(zr.File) != 1 || zr.File[0].Name != "folder/test.txt" {
		t.Fatalf("unexpected ZIP entries: %#v", zr.File)
	}
	file, err := zr.File[0].Open()
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	actual, err := io.ReadAll(file)
	if err != nil || !bytes.Equal(actual, content) {
		t.Fatalf("ZIP content = %q, %v", actual, err)
	}
}
