package fileutil

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/rs/zerolog/log"
)

func CreateSampleFile(filepath, content string) error {
	file, err := OpenFile(filepath)
	if err != nil {
		return fmt.Errorf("error creating dummy file: %s", err)
	}
	defer Close(file)

	_, err = file.Write([]byte(content))
	if err != nil {
		return fmt.Errorf("error writing dummy file: %s", err)
	}

	return nil
}

func OpenFile(filename string) (*os.File, error) {
	return os.OpenFile(filename, os.O_RDWR|os.O_CREATE, os.ModePerm)
}

func FileExists(filename string) bool {
	_, err := os.Stat(filename)
	return !os.IsNotExist(err)
}

func StatFileIfExists(filename string) os.FileInfo {
	stat, err := os.Stat(filename)
	if err != nil {
		return nil
	}
	return stat
}

func CloseIfErr(err error, c io.Closer) {
	if err != nil {
		Close(c)
	}
}

func Close(rw io.Closer) {
	err := rw.Close()
	if err != nil && !errors.Is(err, io.EOF) {
		log.Warn().Err(err).Msg("Error occurred while closing io.Closer")
	}
}

func CopyFolder(sourceDir, targetDir string, ignoreDir string) error {
	return walkFolder(sourceDir, targetDir, ignoreDir, copyFile)
}

// HardLinkFolder creates hard links of all files from source folder to target folder
// and maintains the original UID/GID
func HardLinkFolder(sourceDir, targetDir string) error {
	return walkFolder(sourceDir, targetDir, "", hardlinkFile)
}

func walkFolder(sourceDir, targetDir, dir string, actionFunc func(oldPath string, newPath string, mode fs.FileMode) error) error {
	if sourceDir == dir {
		// skip file
		return nil
	}

	// Check if source directory exists
	sourceStat, err := os.Stat(sourceDir)
	if err != nil {
		return fmt.Errorf("source directory error: %w", err)
	}

	// Create target directory if it doesn't exist
	err = os.MkdirAll(targetDir, os.ModePerm)
	if err != nil {
		return fmt.Errorf("failed to create target directory: %w", err)
	}

	// Handle based on whether source is file or directory
	if !sourceStat.IsDir() {
		// For single file, create the parent directory if needed
		sourceFile := filepath.Base(sourceDir)
		targetDir = fmt.Sprintf("%s/%s", targetDir, sourceFile)

		// Create hard link for the file
		if err := actionFunc(sourceDir, targetDir, sourceStat.Mode()); err != nil {
			return err
		}

		return nil
	}

	// Walk through the source directory
	return filepath.WalkDir(sourceDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Get file info including system info (UID/GID)
		info, err := d.Info()
		if err != nil {
			return fmt.Errorf("failed to get file info: %w", err)
		}

		// Get relative path
		relPath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return fmt.Errorf("failed to get relative path: %w", err)
		}

		// Get target path
		targetPath := filepath.Join(targetDir, relPath)

		// If it's a directory, create it in target with proper ownership
		if d.IsDir() {
			if err := os.MkdirAll(targetPath, os.ModePerm); err != nil {
				return fmt.Errorf("failed to create directory %s: %w", targetPath, err)
			}

			return nil
		}

		// Create hard link for files
		err = actionFunc(path, targetPath, info.Mode())
		if err != nil {
			return err
		}

		return nil
	})
}

func copyFile(src, dest string, mode fs.FileMode) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("failed to open source file %s: %w", src, err)
	}
	defer func(sourceFile *os.File) {
		_ = sourceFile.Close()
	}(sourceFile)

	// Get source file info for permissions
	sourceInfo, err := sourceFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat source file %s: %w", src, err)
	}

	// Create the destination file for writing.
	// If it exists, it will be truncated.
	destinationFile, err := os.OpenFile(dest, os.O_RDWR|os.O_CREATE|os.O_TRUNC, sourceInfo.Mode())
	if err != nil {
		return fmt.Errorf("failed to create destination file %s: %w", dest, err)
	}
	defer func(destinationFile *os.File) {
		_ = destinationFile.Close()
	}(destinationFile)

	// Copy the contents from source to destination
	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return fmt.Errorf("failed to copy data from %s to %s: %w", src, dest, err)
	}

	// Ensure all data is written to stable storage
	err = destinationFile.Sync()
	if err != nil {
		return fmt.Errorf("failed to sync destination file %s: %w", dest, err)
	}

	return nil
}

// hardlinkFile creates a hard link with proper ownership and permissions
func hardlinkFile(src, dest string, mode fs.FileMode) error {
	// Ensure the target directory exists
	targetDir := filepath.Dir(dest)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return err
	}

	// Remove existing file if it exists
	if err := os.Remove(dest); err != nil && !os.IsNotExist(err) {
		return err
	}

	// Create the hard link
	if err := os.Link(src, dest); err != nil {
		return err
	}

	if err := os.Chmod(dest, mode); err != nil {
		return fmt.Errorf("failed to set permissions: %w", err)
	}

	return nil
}
