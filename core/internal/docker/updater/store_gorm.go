package updater

import (
	"gorm.io/gorm"
)

type ImageUpdateDB struct {
	db *gorm.DB
}

// NewImageUpdateDB creates a new instance of ImageUpdateDB.
func NewImageUpdateDB(db *gorm.DB) *ImageUpdateDB {
	return &ImageUpdateDB{db: db}
}

func (i ImageUpdateDB) GetUpdateAvailable(host string, imageIds ...string) (map[string]ImageUpdate, error) {
	result := make(map[string]ImageUpdate)

	if len(imageIds) == 0 {
		return result, nil
	}

	var updates []ImageUpdate
	err := i.db.Where("image_id IN ?", imageIds).Where("host = ?", host).Find(&updates).Error
	if err != nil {
		return nil, err
	}

	for _, update := range updates {
		result[update.ImageID] = update
	}

	return result, nil
}

func (i ImageUpdateDB) Save(image *ImageUpdate) error {
	return i.db.Save(image).Error
}

func (i ImageUpdateDB) Delete(imageIds ...string) error {
	return i.db.Where("image_id IN ?", imageIds).Delete(&ImageUpdate{}).Error
}
