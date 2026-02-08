package cleaner

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

type GormStore struct {
	db *gorm.DB
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

func (g *GormStore) GetConfig(string) (PruneConfig, error) {
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

const maxPruneResults = 10

func (g *GormStore) AddResult(result *PruneResult) error {
	//return g.db.Save(result).Error

	return g.db.Transaction(func(tx *gorm.DB) error {
		err := tx.Create(&result).Error
		if err != nil {
			return err
		}

		var count int64
		err = tx.Model(&PruneResult{}).
			Where("host = ?", result.Host).
			Count(&count).Error
		if err != nil {
			return err
		}

		maxSessions := int64(maxPruneResults)
		if count > maxSessions {
			sessionsToDelete := count - maxSessions

			var oldSessions []PruneResult
			// Find the oldest session IDs to delete
			err = tx.
				Where("host = ?", result.Host).
				Order("created_at ASC").
				Limit(int(sessionsToDelete)).
				Find(&oldSessions).Error
			if err != nil {
				return err
			}

			for _, oldSession := range oldSessions {
				err = tx.Delete(&oldSession).Error
				if err != nil {
					return err
				}
			}
		}

		return nil
	})

}

func (g *GormStore) ListResult(host string) ([]PruneResult, error) {
	var result []PruneResult
	err := g.db.
		Where("host = ?", host).
		Order("created_at DESC").
		Find(&result).
		Error
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (g *GormStore) DeleteResult(id int) error {
	return g.db.Delete(&PruneResult{}, id).Error
}

func (g *GormStore) GetModels() []interface{} {
	return []interface{}{
		&PruneConfig{},
		&PruneResult{},
	}
}
