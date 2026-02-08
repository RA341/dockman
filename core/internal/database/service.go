package database

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"path/filepath"

	"github.com/pressly/goose/v3"
	"github.com/rs/zerolog/log"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

//go:embed migrations/sqlite/*.sql
var migrationDir embed.FS

const migrationPath = "migrations/sqlite"

const dockmanDB = "dockman.db"

func New(basepath string, devMode bool) *gorm.DB {
	gormDB, err := connect(basepath, devMode)
	if err != nil {
		log.Fatal().Err(err).Msg("Unable to connect to database")
	}
	return gormDB
}

func connect(basepath string, devMode bool) (*gorm.DB, error) {
	basepath = filepath.Join(basepath, dockmanDB)
	dbpath, err := filepath.Abs(basepath)
	if err != nil {
		return nil, fmt.Errorf("unable to get abs path of %s: %w", basepath, err)
	}

	// use SQLite WAL mode
	connectionStr := dbpath + "?_journal_mode=WAL&_busy_timeout=5000"
	sqlDB, err := sql.Open("sqlite3", connectionStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open raw sqlite connection: %w", err)
	}
	log.Info().Str("path", dbpath).Msg("Connected to database")

	if err := migrate(sqlDB, migrationDir, migrationPath); err != nil {
		return nil, fmt.Errorf("migration failed: %w", err)
	}

	conf := &gorm.Config{
		Logger:      logger.Default.LogMode(logger.Silent),
		PrepareStmt: true,
	}
	if devMode {
		//conf.Logger = logger.Default.LogMode(logger.Info)
	}

	db, err := gorm.Open(sqlite.Dialector{Conn: sqlDB}, conf)
	if err != nil {
		return nil, fmt.Errorf("failed to open Gorm connection: %w", err)
	}

	return db, nil
}

func migrate(db *sql.DB, migrationDir fs.FS, migrationPath string) error {
	goose.SetBaseFS(migrationDir)

	gzlog := GooseZerolog{}
	goose.SetLogger(gzlog)

	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}

	log.Info().Msg("Checking for database migrations...")

	if err := goose.Up(db, migrationPath); err != nil {
		return err
	}

	return nil
}

type GooseZerolog struct{}

func (g GooseZerolog) Fatalf(format string, v ...interface{}) {
	log.Fatal().Msgf(format, v...)
}

func (g GooseZerolog) Printf(format string, v ...interface{}) {
	log.Info().Msgf(format, v...)
}
