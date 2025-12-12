package files

import (
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

type GormStore struct {
	db *gorm.DB
}

func NewGormStore(db *gorm.DB) *GormStore {
	err := db.AutoMigrate(&LocationAliases{})
	if err != nil {
		log.Fatal().Err(err).Msg("failed to migrate LocationAliases store")
	}
	return &GormStore{db: db}
}

func (g GormStore) Get(alias string) (string, error) {
	var al LocationAliases
	// todo select only fullpath
	return al.Fullpath, g.db.Where("alias = ?", alias).Find(&al).Error
}

func (g GormStore) AddAlias(alias string, path string) error {
	fileLocation := LocationAliases{
		Alias:    alias,
		Fullpath: path,
	}
	return g.db.Create(&fileLocation).Error
}

func (g GormStore) RemoveAlias(alias string) error {
	// Hard delete using Unscoped()
	return g.db.Unscoped().Where("alias = ?", alias).Delete(&LocationAliases{}).Error
}

func (g GormStore) List() ([]LocationAliases, error) {
	var locations []LocationAliases
	err := g.db.Find(&locations).Error
	return locations, err
}
