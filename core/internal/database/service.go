package database

import (
	"reflect"

	"github.com/RA341/dockman/internal/config"
	"github.com/RA341/dockman/internal/database/impl"
	"github.com/RA341/dockman/internal/docker/updater"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

type Service struct {
	SshKeyDB      ssh.KeyManager
	MachineDB     ssh.MachineManager
	InfoDB        *impl.VersionDB
	UserConfigDB  *impl.UserConfigDB
	ImageUpdateDB *updater.ImageUpdateDB
}

func NewService(basepath string) (*gorm.DB, *Service) {
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
		&updater.ImageUpdate{},
	}
	if err = gormDB.AutoMigrate(tables...); err != nil {
		log.Fatal().Err(err).Msg("failed to auto migrate DB")
	}

	userMan := impl.NewUserConfigDB(gormDB)
	keyman := impl.NewKeyManagerDB(gormDB)
	macMan := impl.NewMachineManagerDB(gormDB)
	verMan := impl.NewVersionHistoryManager(gormDB)
	imgMan := updater.NewImageUpdateDB(gormDB)

	return gormDB, &Service{
		SshKeyDB:      keyman,
		MachineDB:     macMan,
		InfoDB:        verMan,
		UserConfigDB:  userMan,
		ImageUpdateDB: imgMan,
	}
}

func (s *Service) Close() error {
	return nil
}

func MustMigrate(db *gorm.DB, tables ...interface{}) {
	err := db.AutoMigrate(tables...)
	if err != nil {
		var tableNames []string
		for _, table := range tables {
			t := reflect.TypeOf(table)
			if t.Kind() == reflect.Ptr {
				table = append(tableNames, t.Elem().Name())
			}
		}

		log.Fatal().
			Err(err).Strs("tables", tableNames).
			Msg("failed to auto migrate tables")
	}
}
