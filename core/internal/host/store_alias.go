package host

import "gorm.io/gorm"

// AliasStore hostname finds where the client is running remote/local
type AliasStore interface {
	Get(hostId uint, alias string) (FolderAlias, error)
	AddAlias(hostId uint, alias string, path string) error
	RemoveAlias(hostId uint, alias string) error
	EditAlias(hostId uint, id uint, alias *FolderAlias) error
	List(hostId uint) ([]FolderAlias, error)
}

type FolderAlias struct {
	gorm.Model
	// ConfigID is part of both unique indexes
	ConfigID uint `gorm:"uniqueIndex:idx_config_alias;uniqueIndex:idx_config_path"`

	// Alias is unique per ConfigID
	Alias string `gorm:"uniqueIndex:idx_config_alias"`

	// Fullpath is unique per ConfigID
	Fullpath string `gorm:"uniqueIndex:idx_config_path"`
}

func (*FolderAlias) TableName() string {
	return "folder_aliases_2"
}
