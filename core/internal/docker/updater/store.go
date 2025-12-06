package updater

import "gorm.io/gorm"

type Store interface {
	GetUpdateAvailable(host string, imageIds ...string) (map[string]ImageUpdate, error)
	Save(image *ImageUpdate) error
	Delete(imageIds ...string) error
}

type ImageUpdate struct {
	gorm.Model
	ImageID   string `gorm:"not null"`
	UpdateRef string `gorm:"default:''"`
	Host      string `gorm:"not null"`
}

type NoopStore struct{}

func NewNoopStore() *NoopStore {
	return &NoopStore{}
}

func (n *NoopStore) GetUpdateAvailable(string, ...string) (map[string]ImageUpdate, error) {
	return map[string]ImageUpdate{}, nil
}

func (n *NoopStore) Save(*ImageUpdate) error {
	return nil
}

func (n *NoopStore) Delete(...string) error {
	return nil
}
