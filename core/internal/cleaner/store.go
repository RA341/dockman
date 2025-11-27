package cleaner

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

const configID = 1

type Store interface {
	GetConfig() (PruneConfig, error)
	UpdateConfig(*PruneConfig) error
	InitConfig() error

	AddResult(*PruneResult) error
	ListResult() ([]PruneResult, error)
	DeleteResult(id int) error
}

type GormStore struct {
	db *gorm.DB
}

func (g *GormStore) GetModels() []interface{} {
	return []interface{}{
		&PruneConfig{},
		&PruneResult{},
	}
}

func NewStore(db *gorm.DB) *GormStore {
	return &GormStore{db: db}
}

func (g *GormStore) InitConfig() error {
	var config PruneConfig
	config.ID = configID

	err := g.db.First(&config).Error
	if err == nil {
		return nil
	}

	if errors.Is(err, gorm.ErrRecordNotFound) {
		err = g.db.Create(&config).Error
		if err != nil {
			return fmt.Errorf("failed to create default config: %w", err)
		}

		return nil
	}

	return fmt.Errorf("failed to query config: %w", err)
}

func (g *GormStore) GetConfig() (PruneConfig, error) {
	dest := PruneConfig{}
	dest.Model.ID = configID

	err := g.db.Find(&dest).Error
	if err != nil {
		return PruneConfig{}, err
	}

	return dest, nil
}

func (g *GormStore) UpdateConfig(config *PruneConfig) error {
	config.Model.ID = configID
	return g.db.Save(config).Error
}

func (g *GormStore) AddResult(result *PruneResult) error {
	return g.db.Save(result).Error
}

func (g *GormStore) ListResult() ([]PruneResult, error) {
	var result []PruneResult
	err := g.db.Find(&result).Error
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (g *GormStore) DeleteResult(id int) error {
	return g.db.Delete(&PruneResult{}, id).Error
}
