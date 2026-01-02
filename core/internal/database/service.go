package database

import (
	"fmt"
	"path/filepath"
	"reflect"

	"github.com/rs/zerolog/log"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const dockmanDB = "dockman.db"

func New(basepath string, devMode bool) *gorm.DB {
	gormDB, err := connect(basepath, devMode)
	if err != nil {
		log.Fatal().Err(err).Msg("Unable to connect to database")
	}
	return gormDB
}

func getStructName(table interface{}) string {
	t := reflect.TypeOf(table)
	if t.Kind() == reflect.Ptr {
		return t.Elem().Name()
	}
	return t.Name()
}

func Migrate(db *gorm.DB, table ...interface{}) {
	err := db.AutoMigrate(table...)
	if err != nil {
		base := log.Fatal().Err(err)
		for _, t := range table {
			base.Str("table", getStructName(t))
		}
		base.Msg("failed to auto-migrate table(s)")
	}
}

func connect(basepath string, devMode bool) (*gorm.DB, error) {
	basepath = filepath.Join(basepath, dockmanDB)
	dbpath, err := filepath.Abs(basepath)
	if err != nil {
		return nil, fmt.Errorf("unable to get abs path of %s: %w", basepath, err)
	}

	// Configure SQLite to use WAL mode
	connectionStr := dbpath + "?_journal_mode=WAL&_busy_timeout=5000"
	conn := sqlite.Open(connectionStr)
	conf := &gorm.Config{
		Logger:      logger.Default.LogMode(logger.Silent),
		PrepareStmt: true,
	}
	if devMode {
		conf = &gorm.Config{
			//Logger:      logger.Default.LogMode(logger.Info),
			PrepareStmt: true,
		}
	}

	db, err := gorm.Open(conn, conf)
	if err != nil {
		return nil, err
	}

	log.Info().Str("path", dbpath).Msg("Connected to database")
	return db, nil
}
