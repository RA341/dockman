package ssh

import (
	"github.com/RA341/dockman/internal/database"
	"gorm.io/gorm"
)

// KeyManagerDB handles database operations for SSH key configurations.
type KeyManagerDB struct {
	db *gorm.DB
}

// NewGormKeyManager creates a new instance of KeyManagerDB.
func NewGormKeyManager(db *gorm.DB) *KeyManagerDB {
	database.Migrate(db, &KeyConfig{})
	return &KeyManagerDB{db: db}
}

// SaveKey inserts a new SSH key configuration or updates an existing one based on the primary key ID.
func (k KeyManagerDB) SaveKey(config KeyConfig) error {
	return k.db.Save(&config).Error
}

// GetKey retrieves a single SSH key configuration by its name.
func (k KeyManagerDB) GetKey(name string) (KeyConfig, error) {
	var config KeyConfig
	err := k.db.Where("name = ?", name).First(&config).Error
	return config, err
}

// ListKeys retrieves all SSH key configurations from the database.
func (k KeyManagerDB) ListKeys() ([]KeyConfig, error) {
	var configs []KeyConfig
	err := k.db.Find(&configs).Error
	return configs, err
}

// DeleteKey removes an SSH key configuration from the database by its name.
func (k KeyManagerDB) DeleteKey(name string) error {
	return k.db.Where("name = ?", name).Delete(&KeyConfig{}).Error
}
