package main

import (
	"io"
	"log"
	"os"

	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/cleaner"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/host"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/internal/ssh"

	"ariga.io/atlas-provider-gorm/gormschema"
)

func main() {
	stmts, err := gormschema.
		New("sqlite").
		Load(
			&auth.User{},
			&auth.Session{},
			&host.FolderAlias{},
			&info.VersionHistory{},
			&config.UserConfig{},
			&cleaner.PruneConfig{},
			&cleaner.PruneResult{},
			&ssh.KeyConfig{},
			&ssh.MachineOptions{},
			&host.Config{},
			&host.FolderAlias{},
		)
	if err != nil {
		log.Fatalf("failed to load Gorm schema: %v\n", err)
	}

	_, err = io.WriteString(os.Stdout, stmts)
	if err != nil {
		log.Fatal(err)
	}
}
