package info

import (
	"errors"

	"github.com/RA341/dockman/internal/database"
	"gorm.io/gorm"
)

type VersionDB struct {
	db *gorm.DB
}

// NewVersionHistoryManager creates a new instance of VersionHistoryManager
func NewVersionHistoryManager(db *gorm.DB) *VersionDB {
	database.Migrate(db, &VersionHistory{})
	return &VersionDB{db: db}
}

// FindLastVersion returns the most recently created version record
func (v *VersionDB) FindLastVersion() (*VersionHistory, error) {
	var versionHistory VersionHistory

	err := v.db.Order("created_at DESC").First(&versionHistory).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil // Return nil instead of error for no records
		}
		return nil, err
	}

	return &versionHistory, nil
}

func (v *VersionDB) IsVersionRead(version string) (bool, error) {
	var versionHistory VersionHistory

	err := v.db.Select("read").Where("version = ?", version).First(&versionHistory).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil // Version doesn't exist, so it's not read
		}
		return false, err
	}

	return versionHistory.Read, nil
}

func (v *VersionDB) GetUnreadVersions() ([]VersionHistory, error) {
	var versions []VersionHistory

	err := v.db.Where("read = ?", false).Order("created_at DESC").Find(&versions).Error
	if err != nil {
		return nil, err
	}

	return versions, nil
}

func (v *VersionDB) MarkVersionAsRead(version string) error {
	result := v.db.Model(&VersionHistory{}).
		Where("version = ?", version).
		Update("read", true)

	if result.Error != nil {
		return result.Error
	}

	// Check if any rows were affected (version exists)
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// CreateVersionEntry creates a new version entry with read status set to false
func (v *VersionDB) CreateVersionEntry(version string) error {
	versionHistory := VersionHistory{
		Version: version,
		Read:    false,
	}

	return v.db.Create(&versionHistory).Error
}

// Additional helper methods that might be useful

// GetVersionByVersion fun name
func (v *VersionDB) GetVersionByVersion(version string) (*VersionHistory, error) {
	var versionHistory VersionHistory

	err := v.db.Where("version = ?", version).First(&versionHistory).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &versionHistory, nil
}

func (v *VersionDB) GetAllVersions() ([]VersionHistory, error) {
	var versions []VersionHistory

	err := v.db.Order("created_at DESC").Find(&versions).Error
	if err != nil {
		return nil, err
	}

	return versions, nil
}

func (v *VersionDB) VersionExists(version string) (bool, error) {
	var count int64

	err := v.db.Model(&VersionHistory{}).Where("version = ?", version).Count(&count).Error
	if err != nil {
		return false, err
	}

	return count > 0, nil
}

func (v *VersionDB) DeleteVersion(version string) error {
	result := v.db.Where("version = ?", version).Delete(&VersionHistory{})

	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

// CleanupOldVersions removes version records older than the specified count
// Keeps the most recent 'keepCount' versions
func (v *VersionDB) CleanupOldVersions(keepCount int) error {
	if keepCount <= 0 {
		return errors.New("keepCount must be positive")
	}

	// Get IDs of versions to keep (most recent ones)
	var idsToKeep []uint
	err := v.db.Model(&VersionHistory{}).
		Select("id").
		Order("created_at DESC").
		Limit(keepCount).
		Pluck("id", &idsToKeep).Error

	if err != nil {
		return err
	}

	if len(idsToKeep) == 0 {
		return nil // No records to clean up
	}

	// Delete versions not in the keep list
	return v.db.Where("id NOT IN ?", idsToKeep).Delete(&VersionHistory{}).Error
}

func (v *VersionDB) MarkAllAsRead() error {
	return v.db.Model(&VersionHistory{}).Update("read", true).Error
}
