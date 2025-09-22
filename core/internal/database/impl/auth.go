package impl

import (
	"errors"
	"time"

	"github.com/RA341/dockman/internal/auth"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AuthDB struct {
	db *gorm.DB
}

func NewAuthDB(db *gorm.DB) *AuthDB {
	return &AuthDB{db: db}
}

func (g *AuthDB) NewUser(username string, encryptedPassword string) (*auth.User, error) {
	user := &auth.User{
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

func (g *AuthDB) GetUser(username string) (*auth.User, error) {
	var user auth.User
	if err := g.db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid user/password")
		}
		return nil, err
	}
	return &user, nil
}

func (g *AuthDB) UpdateUser(user *auth.User) error {
	return g.db.Save(user).Error
}

func (g *AuthDB) VerifyAuthToken(token string) (*auth.User, error) {
	var user auth.User
	if err := g.db.Where("token = ?", token).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid token")
		}
		return nil, err
	}

	// Optional: check if token expired
	if !user.Expires.IsZero() && time.Now().After(user.Expires) {
		return nil, errors.New("token expired")
	}

	return &user, nil
}
