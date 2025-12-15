package files

import "gorm.io/gorm"

// Store hostname finds where the client is running remote/local
type Store interface {
	Get(alias string) (FolderAlias, error)
	AddAlias(alias string, path string) error
	RemoveAlias(alias string) error
	EditAlias(id uint, alias *FolderAlias) error
	List(host string) ([]FolderAlias, error)
}

type FolderAlias struct {
	gorm.Model
	Alias    string `gorm:"unique"`
	Fullpath string `gorm:"unique"`
}
