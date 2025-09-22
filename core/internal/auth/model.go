package auth

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username          string `gorm:"uniqueIndex;not null"`
	EncryptedPassword string `gorm:"not null"`
	Token             string `gorm:"index"`
	Expires           time.Time
}

type Store interface {
	GetUser(username string) (*User, error)
	UpdateUser(user *User) error
	VerifyAuthToken(token string) (*User, error)
	NewUser(username string, encryptedPassword string) (*User, error)
}
