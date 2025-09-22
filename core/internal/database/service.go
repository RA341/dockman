package database

import (
	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/database/impl"
	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/rs/zerolog/log"
)

type Service struct {
	SshKeyDB      ssh.KeyManager
	MachineDB     ssh.MachineManager
	InfoDB        *impl.VersionDB
	UserConfigDB  *impl.UserConfigDB
	ImageUpdateDB *impl.ImageUpdateDB
	AuthDb        *impl.AuthDB
}

func NewService(basepath string) *Service {
	gormDB, err := connect(basepath)
	if err != nil {
		log.Fatal().Err(err).Msg("Unable to connect to database")
	}

	// todo make model migration with unified with impl inits
	tables := []interface{}{
		&ssh.MachineOptions{},
		&ssh.KeyConfig{},
		&info.VersionHistory{},
		&config.UserConfig{},
		&docker.ImageUpdate{},
		&auth.User{},
	}
	if err = gormDB.AutoMigrate(tables...); err != nil {
		log.Fatal().Err(err).Msg("failed to auto migrate DB")
	}

	userMan := impl.NewUserConfigDB(gormDB)
	keyman := impl.NewKeyManagerDB(gormDB)
	macMan := impl.NewMachineManagerDB(gormDB)
	verMan := impl.NewVersionHistoryManager(gormDB)
	imgMan := impl.NewImageUpdateDB(gormDB)
	authDb := impl.NewAuthDB(gormDB)

	return &Service{
		SshKeyDB:      keyman,
		MachineDB:     macMan,
		InfoDB:        verMan,
		UserConfigDB:  userMan,
		ImageUpdateDB: imgMan,
		AuthDb:        authDb,
	}
}

func (s *Service) Close() error {
	return nil
}
