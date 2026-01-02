package host

import (
	"github.com/RA341/dockman/internal/database"
	"gorm.io/gorm"
)

type gormStore struct {
	db *gorm.DB
}

func NewStore(db *gorm.DB) Store {
	database.Migrate(db, &Config{})
	return &gormStore{db: db}
}

// Get retrieves a config by its Name field, preloading associations
func (s *gormStore) Get(name string) (Config, error) {
	var conf Config
	err := s.db.
		Preload("SSHOptions").
		Preload("FolderAliases").
		Where("name = ?", name).
		First(&conf).Error
	return conf, err
}

// Add inserts a new Config and its associations into the database
func (s *gormStore) Add(conf *Config) error {
	return s.db.Create(conf).Error
}

// Delete removes the config (Soft Delete due to gorm.Model)
func (s *gormStore) Delete(conf *Config) error {
	return s.db.Unscoped().Delete(conf).Error
}

// Update updates the existing config.
func (s *gormStore) Update(conf *Config) error {
	return s.db.Session(&gorm.Session{FullSaveAssociations: true}).Save(conf).Error
}

func (s *gormStore) ListEnabled() ([]Config, error) {
	var configs []Config
	err := s.db.
		Where("enable = ?", true).
		Preload("SSHOptions").
		Preload("FolderAliases").
		Order("created_at ASC").
		Find(&configs).Error
	return configs, err
}

// List returns all host configurations with their preloaded associations
func (s *gormStore) List() ([]Config, error) {
	var configs []Config
	err := s.db.
		Preload("SSHOptions").
		Preload("FolderAliases").
		Order("created_at ASC").
		Find(&configs).Error
	return configs, err
}
