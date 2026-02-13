package files

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/RA341/dockman/internal/host/filesystem"
	"github.com/stretchr/testify/require"
)

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
