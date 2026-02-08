package auth

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type UserGormDB struct {
	db *gorm.DB
}

func NewUserGormDB(db *gorm.DB) UserStore {
	return &UserGormDB{db: db}
}

func (g *UserGormDB) NewUser(username string, encryptedPassword string) (*User, error) {
	user := &User{
		Username:          username,
		EncryptedPassword: encryptedPassword,
	}

	// Insert or update if username already exists
	if err := g.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "username"}}, // conflict on username
		UpdateAll: true,                                // overwrite all fields
	}).Create(user).Error; err != nil {
		return nil, err
	}

	return user, nil
}

func (g *UserGormDB) GetUser(username string) (*User, error) {
	var user User
	if err := g.db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid user/password")
		}
		return nil, err
	}
	return &user, nil
}

func (g *UserGormDB) UpdateUser(user *User) error {
	return g.db.Save(user).Error
}
