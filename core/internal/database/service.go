package database

import (
	"github.com/RA341/dockman/internal/database/impl"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/rs/zerolog/log"
)

type Service struct {
	SshKeyDB  ssh.KeyManager
	MachineDB ssh.MachineManager
	InfoDB    *impl.VersionDB
}

func NewService(basepath string) *Service {
	gormDB, err := connect(basepath)
	if err != nil {
		log.Fatal().Err(err).Msg("Unable to connect to database")
		return nil
	}

	keyman := impl.NewKeyManagerDB(gormDB)
	macMan := impl.NewMachineManagerDB(gormDB)
	verMan := impl.NewVersionHistoryManager(gormDB)

	log.Debug().Msg("DB service loaded successfully")
	return &Service{
		SshKeyDB:  keyman,
		MachineDB: macMan,
		InfoDB:    verMan,
	}
}

func (s *Service) Close() error {
	return nil
}
