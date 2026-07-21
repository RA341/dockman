package files

import (
	"bytes"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/RA341/dockman/internal/dockyaml"
	"github.com/RA341/dockman/internal/host/filesystem"
	"github.com/stretchr/testify/require"
)

func TestSaveUsesCreateCompatibleWriteMode(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	srv := New(func(host, alias string) (filesystem.FileSystem, error) {
		require.Equal(t, "remote", host)
		require.Equal(t, "compose", alias)
		return filesystem.NewLocal(root), nil
	}, nil)

	// Editor saves use create=false. The destination should still be opened
	// with CREATE so SFTP servers that require WRITE|CREATE|TRUNC accept it.
	err := srv.Save("compose/new-file.yml", "remote", false, bytes.NewBufferString("services: {}\n"))
	require.NoError(t, err)

	contents, err := os.ReadFile(filepath.Join(root, "new-file.yml"))
	require.NoError(t, err)
	require.Equal(t, "services: {}\n", string(contents))

	err = srv.Save("compose/new-file.yml", "remote", false, bytes.NewBufferString("services:\n  app: {}\n"))
	require.NoError(t, err)

	contents, err = os.ReadFile(filepath.Join(root, "new-file.yml"))
	require.NoError(t, err)
	require.Equal(t, "services:\n  app: {}\n", string(contents))
}

func TestList(t *testing.T) {
	// todo
	//structure, err := CreateRandomDirStructure(5)
	//require.NoErrorf(t, err, "Error creating random folder structure")
	//defer os.RemoveAll(structure)
	//
	//fileSrv := New("../../", "", 1000, 1000, func() string {
	//	return docker.LocalClient
	//})
	//
	//list, err := fileSrv.List("")
	//require.NoErrorf(t, err, "Error listing files")
	//
	//t.Log(list)
}

func TestTemplateRead(t *testing.T) {
	root := "./tmp/compose"
	root, err := filepath.Abs(root)
	require.NoError(t, err)

	lfs := filesystem.NewLocal(root)

	srv := New(func(host, alias string) (filesystem.FileSystem, error) {
		return lfs, nil
	}, nil)

	tmpls, err := srv.GetTemplates("compose", "test")
	require.NoError(t, err)

	for _, tmpl := range tmpls {
		for ke := range tmpl.vars {
			delete(tmpl.vars, ke)
			prefix := strings.TrimPrefix(ke, ".")
			tmpl.vars[prefix] = ".dyn" + ke
		}

		err := srv.WriteTemplate("test", "compose/base", &tmpl)
		require.NoError(t, err)
		break
	}
}

func sortNames(srv *Service, entries []Entry) []string {
	slices.SortFunc(entries, func(a, b Entry) int {
		return srv.sortFiles(&a, &b, "local")
	})
	names := make([]string, len(entries))
	for i, e := range entries {
		names[i] = e.fullpath
	}
	return names
}

func dirEntry(name string) Entry  { return Entry{fullpath: name, isDir: true} }
func fileEntry(name string) Entry { return Entry{fullpath: name, isDir: false} }

// TestSortFoldersFirst covers the VS Code-style ordering: folders first, then
// files, each case-insensitive, with dotfiles floating to the top of their own
// group rather than forming a separate group above the directories.
func TestSortFoldersFirst(t *testing.T) {
	srv := &Service{dockYml: func(string) *dockyaml.DockmanYaml { return &dockyaml.DockmanYaml{} }}

	// Same set as the bytebot repo root, shuffled.
	input := []Entry{
		fileEntry("README.md"), dirEntry("docker"), fileEntry(".gitignore"), dirEntry("static"),
		dirEntry(".github"), fileEntry("LICENSE"), dirEntry("helm"), dirEntry(".git"),
		dirEntry("packages"), fileEntry(".prettierignore"), dirEntry("docs"),
	}

	want := []string{
		// directories first (dotfolders float to the top), case-insensitive
		".git", ".github", "docker", "docs", "helm", "packages", "static",
		// then files (dotfiles float to the top), case-insensitive
		".gitignore", ".prettierignore", "LICENSE", "README.md",
	}
	require.Equal(t, want, sortNames(srv, input))
}

// TestSortComposePinnedAndCase covers the Dockman-specific extras kept on top
// of the VS Code ordering: pinned files win outright, compose/yaml files
// surface first within the files group, and case is ignored ("Backups" < "data").
func TestSortComposePinnedAndCase(t *testing.T) {
	srv := &Service{dockYml: func(string) *dockyaml.DockmanYaml {
		return &dockyaml.DockmanYaml{PinnedFiles: map[string]int{"notes.md": 0}}
	}}

	input := []Entry{
		fileEntry("app.env"), dirEntry("data"), fileEntry("values.yaml"), dirEntry("Backups"),
		fileEntry("compose.yaml"), fileEntry("notes.md"), fileEntry(".env"),
	}

	want := []string{
		"notes.md",           // pinned wins over everything
		"Backups", "data",    // folders, case-insensitive
		"compose.yaml",       // files: compose first
		"values.yaml",        // then other yaml
		".env", "app.env",    // then remaining files, case-insensitive (dot floats)
	}
	require.Equal(t, want, sortNames(srv, input))
}

func CreateRandomDirStructure(rootDir string, maxDepth int) (string, error) {
	err := os.MkdirAll(rootDir, 0755)
	if err != nil {
		return "", err
	}

	numFiles := rand.Intn(11) + 5

	for i := 0; i < numFiles; i++ {
		depth := rand.Intn(maxDepth + 1)

		dirPath := rootDir
		for d := 0; d < depth; d++ {
			dirPath = filepath.Join(dirPath, fmt.Sprintf("dir_%d", rand.Intn(100)))
		}

		err = os.MkdirAll(dirPath, 0755)
		if err != nil {
			return rootDir, err
		}

		fileName := fmt.Sprintf("file_%d.txt", rand.Intn(1000))
		filePath := filepath.Join(dirPath, fileName)

		content := fmt.Sprintf("Random file created at depth %d\n", depth)
		err = os.WriteFile(filePath, []byte(content), 0644)
		if err != nil {
			return rootDir, err
		}
	}

	return rootDir, nil
}
