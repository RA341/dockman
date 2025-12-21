package files

import (
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

type GormStore struct {
	db *gorm.DB
}

func NewGormStore(db *gorm.DB) *GormStore {
	err := db.AutoMigrate(&FolderAlias{})
	if err != nil {
		log.Fatal().Err(err).Msg("failed to migrate FolderAlias store")
	}
	return &GormStore{db: db}
}

func (g GormStore) Get(alias string) (FolderAlias, error) {
	var al FolderAlias
	err := g.db.
		Where("alias = ?", alias).
		First(&al).Error
	return al, err
}

func (g GormStore) AddAlias(alias string, path string) error {
	fileLocation := FolderAlias{
		Alias:    alias,
		Fullpath: path,
	}
	return g.db.Create(&fileLocation).Error
}

func (g GormStore) RemoveAlias(alias string) error {
	return g.db.Unscoped().
		Where("alias = ?", alias).
		Delete(&FolderAlias{}).Error
}

func (g GormStore) EditAlias(id uint, alias *FolderAlias) error {
	alias.ID = id
	return g.db.Save(&alias).Error
}

func (g GormStore) List(host string) ([]FolderAlias, error) {
	var locations []FolderAlias
	err := g.db.
		Where("alias LIKE ?", host+"%"). // starts with 'host'
		Find(&locations).Error

	return locations, err
}
