package info

import "gorm.io/gorm"

type VersionHistory struct {
	gorm.Model
	Version string `gorm:"not null;unique"`
	Read    bool   `gorm:"not null;default:false"`
}

// TableName specifies the table name for the VersionHistory model
func (VersionHistory) TableName() string {
	return "version_history"
}

type VersionHistoryManager interface {
	FindLastVersion() (*VersionHistory, error)
	CleanupOldVersions(keepCount int) error
	MarkVersionAsRead(version string) error
	IsVersionRead(version string) (bool, error)
	GetUnreadVersions() ([]VersionHistory, error)
	CreateVersionEntry(version string) error
}
