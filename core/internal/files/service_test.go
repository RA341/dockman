package files

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"testing"
	"time"
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

func CreateRandomDirStructure(maxDepth int) (string, error) {
	rootDir := filepath.Join(os.TempDir(), fmt.Sprintf("random_dir_%d", time.Now().Unix()))

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
