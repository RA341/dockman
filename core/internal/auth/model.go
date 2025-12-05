package auth

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username          string `gorm:"uniqueIndex;not null"`
	EncryptedPassword string `gorm:"not null"`
}

type UserStore interface {
	NewUser(username string, encryptedPassword string) (*User, error)
	GetUser(username string) (*User, error)
	UpdateUser(user *User) error
}

type Session struct {
	gorm.Model
	UserID      uint // GORM automatically recognizes this as a foreign key to User
	User        User
	HashedToken string `gorm:"index"`
	Expires     time.Time
}

type SessionStore interface {
	NewSession(session *Session) error
	DeleteSession(sessionID uint) error
	GetSession(sessionID uint) (Session, error)
	GetSessionByToken(token string) (Session, error)
}
