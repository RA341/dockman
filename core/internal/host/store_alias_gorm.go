package host

import (
	"github.com/RA341/dockman/internal/database"
	"gorm.io/gorm"
)

type GormStore struct {
	db *gorm.DB
}

// NewAliasStore creates a new instance of the store
func NewAliasStore(db *gorm.DB) AliasStore {
	database.Migrate(db, &FolderAlias{})
	return &GormStore{db: db}
}

// Get finds a specific alias for a specific host
func (g *GormStore) Get(hostId uint, alias string) (FolderAlias, error) {
	var al FolderAlias
	err := g.db.
		Where("config_id = ? AND alias = ?", hostId, alias).
		First(&al).Error
	return al, err
}

// AddAlias creates a new folder alias record
func (g *GormStore) AddAlias(hostId uint, alias string, path string) error {
	newAlias := FolderAlias{
		ConfigID: hostId,
		Alias:    alias,
		Fullpath: path,
	}
	// GORM will return an error if the uniqueIndex (ConfigID + Alias) is violated
	return g.db.Create(&newAlias).Error
}

// RemoveAlias deletes an alias (Soft Delete because of gorm.Model)
func (g *GormStore) RemoveAlias(hostId uint, alias string) error {
	return g.db.Unscoped().
		Where("config_id = ? AND alias = ?", hostId, alias).
		Delete(&FolderAlias{}).Error
}

// EditAlias updates an existing alias record.
// It ensures that the record with the provided 'id' actually belongs to 'hostId'.
func (g *GormStore) EditAlias(hostId uint, id uint, updatedData *FolderAlias) error {
	return g.db.Model(&FolderAlias{}).
		Where("id = ? AND config_id = ?", id, hostId).
		Updates(map[string]interface{}{
			"Alias":    updatedData.Alias,
			"Fullpath": updatedData.Fullpath,
		}).Error
}

// List retrieves all aliases associated with a specific host
func (g *GormStore) List(hostId uint) ([]FolderAlias, error) {
	var aliases []FolderAlias
	err := g.db.
		Where("config_id = ?", hostId).
		Find(&aliases).Error
	return aliases, err
}
