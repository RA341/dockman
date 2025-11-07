package git

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"testing"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/logger"
	"github.com/stretchr/testify/require"
)

func init() {
	logger.InitForTest()
}

func Test_migrator(t *testing.T) {
	//srv := NewService("test/compose2", func() {})

	err := migrator("test/compose2")
	if err != nil {
		t.Fatal(err)
	}
}

func Test_WithStagingDelay(t *testing.T) {
	root := "./tests"
	defer os.RemoveAll(root)

	err := os.MkdirAll(root, os.ModePerm)
	require.NoError(t, err)
	// Create a large garbage files to slow down git operations
	createComplexDirectoryStructure(t, root)

	_, err = newSrv(root, nil)
	require.ErrorIs(t, err, ErrStagingDelay, "new srv should fail with a complex dir structure")

	err = os.RemoveAll(root)
	require.NoError(t, err)

	err = os.MkdirAll(root, os.ModePerm)
	require.NoError(t, err)

	err = createLargeGarbageFile(t, root, fileSize10MB)

	_, err = newSrv(root, nil)
	require.NoError(t, err)
}

func createComplexDirectoryStructure(t *testing.T, root string) {
	// Define directory structure
	directories := []string{
		"data/postgres/backups",
		"data/postgres/logs",
		"data/redis/dump",
		"data/elasticsearch/nodes/0/indices",
		"volumes/app/uploads/images",
		"volumes/app/uploads/documents",
		"volumes/app/cache/sessions",
		"volumes/app/cache/templates",
		"logs/nginx/access",
		"logs/nginx/error",
		"logs/app/debug",
		"logs/app/error",
		"media/videos/processed",
		"media/videos/raw",
		"media/images/thumbnails",
		"media/images/original",
		"backups/daily",
		"backups/weekly",
		"backups/monthly",
		"tmp/uploads",
		"tmp/processing",
		"config/secrets",
		"config/templates",
		"node_modules/package1/dist",
		"node_modules/package2/src",
		"node_modules/package3/lib",
		"build/artifacts",
		"build/temp",
		"vendor/libs",
		"vendor/assets",
	}

	// File extensions and types
	fileTypes := []string{
		".log", ".dump", ".sql", ".json", ".xml", ".csv",
		".jpg", ".png", ".gif", ".mp4", ".avi", ".mkv",
		".pdf", ".doc", ".txt", ".md", ".yaml", ".conf",
		".js", ".css", ".html", ".php", ".py", ".go",
		".tar.gz", ".zip", ".bak", ".tmp", ".cache",
	}

	// Create directories and files
	for _, dir := range directories {
		fullDirPath := filepath.Join(root, dir)
		err := os.MkdirAll(fullDirPath, 0755)
		require.NoError(t, err)

		// Create 3-8 files per directory
		numFiles := rand.Intn(6) + 3
		for i := 0; i < numFiles; i++ {
			// Random filename
			baseName := generateRandomString(8, 15)
			extension := fileTypes[rand.Intn(len(fileTypes))]
			filename := fmt.Sprintf("%s%s", baseName, extension)
			filePath := filepath.Join(fullDirPath, filename)

			// Random file size between 50KB and 10MB
			minSize := 50 * 1024        // 50KB
			maxSize := 10 * 1024 * 1024 // 10MB
			fileSize := rand.Intn(maxSize-minSize) + minSize

			createRandomFile(t, filePath, fileSize)
		}
	}

	// Create some additional deeply nested structures
	deepDirs := []string{
		"deep/level1/level2/level3/level4/level5",
		"another/very/deep/nested/structure/here",
		"data/complex/hierarchy/with/many/levels",
	}

	for _, deepDir := range deepDirs {
		fullDirPath := filepath.Join(root, deepDir)
		err := os.MkdirAll(fullDirPath, 0755)
		require.NoError(t, err)

		// Create fewer but larger files in deep directories
		numFiles := rand.Intn(3) + 1
		for i := 0; i < numFiles; i++ {
			filename := fmt.Sprintf("large_file_%d.dat", i)
			filePath := filepath.Join(fullDirPath, filename)

			// Larger files in deep directories (1MB to 10MB)
			minSize := 1024 * 1024      // 1MB
			maxSize := 10 * 1024 * 1024 // 10MB
			fileSize := rand.Intn(maxSize-minSize) + minSize

			createRandomFile(t, filePath, fileSize)
		}
	}
}

func createRandomFile(t *testing.T, filePath string, size int) {
	file, err := os.Create(filePath)
	require.NoError(t, err)
	defer file.Close()

	// Write random data in chunks to avoid memory issues
	const chunkSize = 64 * 1024 // 64KB chunks
	buffer := make([]byte, chunkSize)

	bytesWritten := 0
	for bytesWritten < size {
		remainingBytes := size - bytesWritten
		currentChunkSize := chunkSize
		if remainingBytes < chunkSize {
			currentChunkSize = remainingBytes
			buffer = buffer[:currentChunkSize]
		}

		// Fill buffer with pseudo-random data
		for i := 0; i < currentChunkSize; i++ {
			buffer[i] = byte(rand.Intn(256))
		}

		n, err := file.Write(buffer)
		require.NoError(t, err)
		bytesWritten += n
	}
}

func generateRandomString(minLen, maxLen int) string {
	length := rand.Intn(maxLen-minLen) + minLen
	chars := "abcdefghijklmnopqrstuvwxyz0123456789_"
	result := make([]byte, length)

	for i := 0; i < length; i++ {
		result[i] = chars[rand.Intn(len(chars))]
	}

	return string(result)
}

const fileSize10MB = 10 * 1024 * 1024    // 100MB
const fileSize100MB = 1000 * 1024 * 1024 // 100MB

func createLargeGarbageFile(t *testing.T, root string, fileSize int) error {
	largeFile := filepath.Join(root, "large_garbage_file.bin")
	file, err := os.Create(largeFile)
	require.NoError(t, err)
	defer fileutil.Close(file)

	buffer := make([]byte, 1024*1024) // 1MB buffer

	for i := 0; i < fileSize/(1024*1024); i++ {
		// Fill buffer with pseudo-random data
		for j := range buffer {
			buffer[j] = byte(i + j)
		}
		_, err = file.Write(buffer)
		require.NoError(t, err)
	}
	return err
}

//
//func createTestRepo(t *testing.T, repoPath string) (*git.Repository, *Service) {
//	//file := files.NewService(repoPath)
//	srv := NewService(repoPath)
//
//	createAndWriteFile(t, repoPath, "README.md", "# Test Repository")
//
//	err := srv.Commit("Initial commit", "README.md")
//	require.NoError(t, err)
//
//	return srv.repo, srv
//}
//
//func createAndWriteFile(t *testing.T, repoPath, filename, content string) {
//	fullPath := filepath.Join(repoPath, filename)
//
//	// Create directory if it doesn't exist
//	dir := filepath.Dir(fullPath)
//	err := os.MkdirAll(dir, 0755)
//	require.NoError(t, err)
//
//	err = os.WriteFile(fullPath, []byte(content), 0644)
//	require.NoError(t, err)
//}
//
//// Benchmark test
//func BenchmarkService_Commit(b *testing.B) {
//	// Create temporary directory
//	tempDir, err := os.MkdirTemp("", "git-bench-*")
//	require.NoError(b, err)
//	defer os.RemoveAll(tempDir)
//
//	// Setup repository
//	repo, _ := createTestRepo(&testing.T{}, tempDir)
//	service := &Service{repo: repo}
//
//	// Create test files
//	for i := 0; i < 10; i++ {
//		filename := fmt.Sprintf("file%d.txt", i)
//		createAndWriteFile(&testing.T{}, tempDir, filename, fmt.Sprintf("content %d", i))
//	}
//
//	b.ResetTimer()
//
//	for i := 0; i < b.N; i++ {
//		// Use a different commit message for each iteration
//		commitMsg := fmt.Sprintf("Benchmark commit %d", i)
//		err := service.Commit(commitMsg, "file0.txt", "file1.txt")
//		if err != nil {
//			b.Fatal(err)
//		}
//	}
//}
//
//// Test edge cases
//func TestService_Commit_EdgeCases(t *testing.T) {
//	t.Run("commit with very long message", func(t *testing.T) {
//		tempDir, err := os.MkdirTemp("", "git-test-*")
//		require.NoError(t, err)
//		defer os.RemoveAll(tempDir)
//
//		repo, _ := createTestRepo(t, tempDir)
//		service := &Service{repo: repo}
//
//		createAndWriteFile(t, tempDir, "test.txt", "content")
//
//		longMessage := string(make([]byte, 1000)) // Very long commit message
//		for i := range longMessage {
//			longMessage = longMessage[:i] + "a" + longMessage[i+1:]
//		}
//
//		err = service.Commit(longMessage, "test.txt")
//		assert.NoError(t, err)
//	})
//
//	t.Run("commit with special characters in filename", func(t *testing.T) {
//		tempDir, err := os.MkdirTemp("", "git-test-*")
//		require.NoError(t, err)
//		defer os.RemoveAll(tempDir)
//
//		repo, _ := createTestRepo(t, tempDir)
//		service := &Service{repo: repo}
//
//		specialFile := "file with spaces & symbols!.txt"
//		createAndWriteFile(t, tempDir, specialFile, "special content")
//
//		err = service.Commit("Add special file", specialFile)
//		assert.NoError(t, err)
//	})
//}
//
//func TestService(t *testing.T) {
//	root := "gitTest"
//	abs, err := filepath.Abs(root)
//	require.NoError(t, err)
//	root = abs
//	fil := files.NewService(root, "")
//	gitc := NewService(root)
//
//	t.Cleanup(func() {
//		//err := fil.Close()
//		//require.NoError(t, err)
//		//err = os.RemoveAll(root)
//		//require.NoError(t, err)
//	})
//
//	result := GenerateFileHierarchy(3, 2)
//	for parent, child := range result {
//		err := fil.Create(parent)
//		require.NoError(t, err)
//		for _, c := range child {
//			err := fil.Create(c)
//			require.NoError(t, err)
//		}
//	}
//
//	err = gitc.Commit("tracking dockman db", ".dockman.db")
//	require.NoError(t, err)
//
//	for parent := range result {
//		err := gitc.CommitFileGroup("test-commit", parent)
//		require.NoError(t, err)
//	}
//}
//
//var (
//	adjectives = []string{"autumn", "hidden", "bitter", "misty", "silent", "empty", "dry", "dark"}
//	nouns      = []string{"waterfall", "river", "breeze", "moon", "rain", "wind", "sea", "morning"}
//	extensions = []string{".txt", ".md", ".log", ".json", ".dat", ".config"}
//)
//
//// generateRandomFileName creates a unique, random file name.
//// It ensures the generated name is not already present in the 'existingNames' map.
//func generateRandomFileName(existingNames map[string]bool) string {
//	for {
//		adj := adjectives[rand.Intn(len(adjectives))]
//		noun := nouns[rand.Intn(len(nouns))]
//		ext := extensions[rand.Intn(len(extensions))]
//		num := rand.Intn(1000)
//
//		fileName := fmt.Sprintf("%s-%s-%d%s", adj, noun, num, ext)
//
//		if !existingNames[fileName] {
//			return fileName
//		}
//	}
//}
//
//// GenerateFileHierarchy creates a map of parent files to their children.
//// nParents: The number of parent files to generate.
//// nChildren: The number of child files for each parent.
//func GenerateFileHierarchy(nParents, nChildren int) map[string][]string {
//	hierarchy := make(map[string][]string)
//	allNames := make(map[string]bool)
//
//	for i := 0; i < nParents; i++ {
//		parentName := generateRandomFileName(allNames)
//		allNames[parentName] = true
//
//		children := make([]string, nChildren)
//		for j := 0; j < nChildren; j++ {
//
//			childName := generateRandomFileName(allNames)
//			allNames[childName] = true
//			children[j] = childName
//		}
//
//		hierarchy[parentName] = children
//	}
//
//	return hierarchy
//}
