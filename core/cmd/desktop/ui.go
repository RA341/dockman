package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

//go:embed dist
var frontendDir embed.FS

func setupEmbeddedFrontend() (fs.FS, error) {
	subFS, err := fs.Sub(frontendDir, "dist")
	if err != nil {
		return nil, fmt.Errorf("error loading frontend directory: %w", err)
	}
	return subFS, nil
}

func setupElectronExecPath() (executablePath string, workingDir string, err error) {
	exec, err := os.Executable()
	if err != nil {
		return "", "", fmt.Errorf("error getting working directory: %w", err)
	}

	wd := filepath.Dir(exec)

	const electronDir = "linux-unpacked"
	workingDir = filepath.Join(wd, electronDir)
	const ElectronExecutable = "dockman"
	executablePath = filepath.Join(workingDir, ElectronExecutable)

	if _, err = os.Stat(executablePath); err != nil {
		return "", "", fmt.Errorf("could not find electron executable: %w", err)
	}

	return executablePath, workingDir, nil
}
