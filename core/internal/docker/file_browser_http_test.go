package docker

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"testing"

	"github.com/moby/moby/api/types/container"
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

func TestContainerPathReadOnlyUsesMostSpecificMount(t *testing.T) {
	mounts := []container.MountPoint{
		{Destination: "/config", RW: true},
		{Destination: "/config/secrets", RW: false},
	}
	for _, test := range []struct {
		path     string
		readOnly bool
	}{
		{path: "/", readOnly: true},
		{path: "/etc", readOnly: true},
		{path: "/config", readOnly: false},
		{path: "/config/app/file.yml", readOnly: false},
		{path: "/configuration", readOnly: true},
		{path: "/config/secrets/token", readOnly: true},
	} {
		if actual := containerPathReadOnly(true, mounts, test.path); actual != test.readOnly {
			t.Errorf("containerPathReadOnly(%q) = %v; want %v", test.path, actual, test.readOnly)
		}
	}
}

func TestContainerPathReadOnlyHonorsReadOnlyMountOnWritableRoot(t *testing.T) {
	mounts := []container.MountPoint{{Destination: "/immutable", RW: false}}
	if containerPathReadOnly(false, mounts, "/var/lib") {
		t.Fatal("writable root path reported read-only")
	}
	if !containerPathReadOnly(false, mounts, "/immutable/data") {
		t.Fatal("read-only mount path reported writable")
	}
}

func TestHelperDestinationsPreferRequestedWritableMount(t *testing.T) {
	mounts := []container.MountPoint{{Destination: "/config", RW: true}, {Destination: "/cache", RW: true}}
	actual := helperDestinations(true, mounts, "/config/app")
	if len(actual) != 1 || actual[0] != "/config" {
		t.Fatalf("helper destinations = %#v; want requested mount first", actual)
	}
	for _, destination := range actual {
		if destination == "/tmp" || destination == "/run" || destination == "/" {
			t.Fatalf("helper destinations include read-only root path %q: %#v", destination, actual)
		}
	}
}

func TestUnavailableBrowserEntryKeepsNameWithoutInventingMetadata(t *testing.T) {
	entry := unavailableBrowserEntry("ptmx")
	if entry.Name != "ptmx" || entry.Type != "other" || entry.Size != -1 || entry.Modified != "" || entry.UID != nil || entry.GID != nil {
		t.Fatalf("unexpected unavailable entry: %#v", entry)
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

func TestParseArchiveFileListReturnsImmediateChildren(t *testing.T) {
	var source bytes.Buffer
	tw := tar.NewWriter(&source)
	for _, header := range []*tar.Header{
		{Name: "app", Typeflag: tar.TypeDir, Mode: 0o755},
		{Name: "app/config.yml", Typeflag: tar.TypeReg, Mode: 0o640, Size: 3},
		{Name: "app/data", Typeflag: tar.TypeDir, Mode: 0o750},
		{Name: "app/data/nested.txt", Typeflag: tar.TypeReg, Mode: 0o600, Size: 6},
	} {
		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if header.Size > 0 {
			if _, err := tw.Write(make([]byte, header.Size)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	encoded, err := parseArchiveFileList(&source, "/config/app")
	if err != nil {
		t.Fatal(err)
	}
	var response struct {
		Entries []browserEntry `json:"entries"`
	}
	if err = json.Unmarshal(encoded, &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Entries) != 2 {
		t.Fatalf("got %#v; want two immediate children", response.Entries)
	}
	names := map[string]bool{}
	for _, entry := range response.Entries {
		names[entry.Name] = true
	}
	if !names["config.yml"] || !names["data"] || names["nested.txt"] {
		t.Fatalf("unexpected immediate children: %#v", response.Entries)
	}
}
