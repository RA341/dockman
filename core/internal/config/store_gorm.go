package config

import (
	"errors"

	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// single user config only
const defaultUserID = 1

type UserConfigDB struct {
	db *gorm.DB
}

// NewUserConfigDB creates a new instance of UserConfigDB.
func NewUserConfigDB(db *gorm.DB) Store {
	u := &UserConfigDB{db: db}
	if _, err := u.GetConfig(); errors.Is(err, gorm.ErrRecordNotFound) {
		log.Debug().Msg("empty user config, setting default value")
		if err = u.SetConfig(&UserConfig{}); err != nil {
			log.Fatal().Err(err).Msg("Unable to create initial user config")
		}
	} else {
		if err != nil {
			log.Fatal().Err(err).Msg("Unknown error occurred while retrieving user config")
		}
	}

	return u
}

func (m *UserConfigDB) SetConfig(user *UserConfig) error {
	user.ID = defaultUserID

	result := m.db.Save(user)
	return result.Error
}

func (m *UserConfigDB) GetConfig() (*UserConfig, error) {
	var user UserConfig
	result := m.db.First(&user, defaultUserID)
	return &user, result.Error
}
