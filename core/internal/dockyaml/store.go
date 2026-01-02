package dockyaml

import (
	"os"

	"gorm.io/gorm"
)

type Store interface {
	Get(host string) (*os.File, os.FileInfo, error)
	Save(host string, data []byte) error
}

type DockContent struct {
	gorm.Model

	ConfigID uint   `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Host     string `gorm:"unique"`
	Contents []byte
}
