package files

import "gorm.io/gorm"

type Store interface {
	Get(alias string) (string, error)
	AddAlias(alias string, path string) error
	RemoveAlias(alias string) error
	List() ([]LocationAliases, error)
}

type LocationAliases struct {
	gorm.Model
	Alias    string `gorm:"unique"`
	Fullpath string `gorm:"unique"`
}
