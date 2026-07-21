package cleaner

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type GormStore struct {
	db *gorm.DB
}

func NewStore(db *gorm.DB) *GormStore {
	return &GormStore{db: db}
}

func (g *GormStore) GetConfig(host string) (PruneConfig, error) {
	dest := PruneConfig{}

	err := g.db.Where("host = ?", host).Find(&dest).Error
	if err != nil {
		return PruneConfig{}, err
	}

	return dest, nil
}

func (g *GormStore) UpdateConfig(config *PruneConfig) error {
	// Upsert keyed on the unique host column. Updates() alone fails with
	// "WHERE conditions required" because the incoming config carries no primary
	// key, and on the first save no row exists for the host yet. ON CONFLICT(host)
	// DO UPDATE inserts the first time and updates thereafter, and (via
	// AssignmentColumns) correctly persists toggles set back to false.
	return g.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "host"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"enabled", "interval",
			"volumes", "networks", "images", "containers", "build_cache",
			"updated_at",
		}),
	}).Create(config).Error
}

const maxPruneResults = 10

func (g *GormStore) GetEnabled() ([]PruneConfig, error) {
	var results []PruneConfig
	err := g.db.
		Where("enabled = ?", true).
		Find(&results).
		Error

	return results, err
}

func (g *GormStore) AddResult(result *PruneResult) error {
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
