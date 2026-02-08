package cleaner

import (
	"time"

	"gorm.io/gorm"
)

const configID = 1

type PruneResult struct {
	gorm.Model
	// machine on which it was cleaned
	Host string
	Err  string

	Volumes    OpResult `gorm:"embedded;embeddedPrefix:volumes_"`
	Networks   OpResult `gorm:"embedded;embeddedPrefix:networks_"`
	Images     OpResult `gorm:"embedded;embeddedPrefix:images_"`
	Containers OpResult `gorm:"embedded;embeddedPrefix:containers_"`
	BuildCache OpResult `gorm:"embedded;embeddedPrefix:build_cache_"`
}

type PruneConfig struct {
	gorm.Model
	Enabled  bool
	Interval time.Duration
	Host     string `gorm:"uniqueIndex"`

	Volumes    bool
	Networks   bool
	Images     bool
	Containers bool
	BuildCache bool
}

type OpResult struct {
	Success string
	Err     string
}

func (r OpResult) Val() string {
	if r.Err != "" {
		return r.Err
	}

	return r.Success
}

type Store interface {
	GetEnabled() ([]PruneConfig, error)
	GetConfig(string) (PruneConfig, error)
	UpdateConfig(*PruneConfig) error
	InitConfig() error

	AddResult(*PruneResult) error
	ListResult(host string) ([]PruneResult, error)
	DeleteResult(id int) error
}
