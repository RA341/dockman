package ssh

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/RA341/dockman/pkg/fileutil"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type SftpClient struct {
	sfCli *sftp.Client
}

func NewSFTPCli(cli *sftp.Client) *SftpClient {
	return &SftpClient{sfCli: cli}
}

func NewSFTPFromSSH(cli *ssh.Client) (*SftpClient, error) {
	sftpClient, err := sftp.NewClient(cli)
	if err != nil {
		return nil, err
	}

	return &SftpClient{sfCli: sftpClient}, nil
}

// CopyLocalToRemoteSFTP Helper function to recursively copy local files/directories via SFTP.
func (cli *SftpClient) CopyLocalToRemoteSFTP(localPath string, remotePath string) error {
	localStat, err := os.Stat(localPath)
	if err != nil {
		return fmt.Errorf("could not stat local path %s: %w", localPath, err)
	}

	if localStat.IsDir() {
		// Recursively walk the local directory
		return filepath.Walk(localPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Determine the corresponding path on the remote
			relPath, err := filepath.Rel(localPath, path)
			if err != nil {
				return fmt.Errorf("could not get relative path for %s: %w", path, err)
			}
			currentRemotePath := filepath.Join(remotePath, relPath)

			if info.IsDir() {
				// Create the directory on the remote. MkdirAll is like `mkdir -p`.
				return cli.sfCli.MkdirAll(currentRemotePath)
			}

			// It's a file, so copy it.
			return cli.CopyFileSFTP(path, currentRemotePath)
		})
	}

	// It's a single file
	return cli.CopyFileSFTP(localPath, remotePath)
}

// CopyFileSFTP A smaller helper to copy a single file.
func (cli *SftpClient) CopyFileSFTP(localFile, remoteFile string) error {
	// Ensure the remote directory exists
	remoteDir := filepath.Dir(remoteFile)
	if err := cli.sfCli.MkdirAll(remoteDir); err != nil {
		return fmt.Errorf("failed to create remote directory %s: %w", remoteDir, err)
	}

	// Open local file for reading
	srcFile, err := os.Open(localFile)
	if err != nil {
		return fmt.Errorf("failed to open local file %s: %w", localFile, err)
	}
	defer fileutil.Close(srcFile)

	// Create remote file for writing
	dstFile, err := cli.sfCli.Create(remoteFile)
	if err != nil {
		return fmt.Errorf("failed to create remote file %s: %w", remoteFile, err)
	}
	defer fileutil.Close(dstFile)

	// Copy the contents
	_, err = io.Copy(dstFile, srcFile)
	if err != nil {
		return fmt.Errorf("failed to copy content to remote file %s: %w", remoteFile, err)
	}

	// Set permissions to match local file
	info, err := os.Stat(localFile)
	if err == nil {
		err = cli.sfCli.Chmod(remoteFile, info.Mode())
		if err != nil {
			return err
		}
	}

	return nil
}
