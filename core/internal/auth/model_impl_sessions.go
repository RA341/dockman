package auth

import (
	"time"

	"github.com/RA341/dockman/internal/database"
	"gorm.io/gorm"
)

type SessionGormDB struct {
	db                 *gorm.DB
	maxSessionsPerUser uint
}

func NewSessionGormDB(db *gorm.DB, maxSessions uint) SessionStore {
	database.MustMigrate(db, &Session{})
	return &SessionGormDB{db: db, maxSessionsPerUser: maxSessions}
}

func (s *SessionGormDB) NewSession(session *Session) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		err := tx.Create(&session).Error
		if err != nil {
			return err
		}

		var count int64
		err = tx.Model(&Session{}).
			Where("user_id = ?", session.UserID).
			Count(&count).Error
		if err != nil {
			return err
		}

		maxSessions := int64(s.maxSessionsPerUser)
		if count > maxSessions {
			sessionsToDelete := count - maxSessions

			var oldSessions []Session
			// Find the oldest session IDs to delete
			if err := tx.Where("user_id = ?", session.UserID).
				Order("created_at ASC").
				Limit(int(sessionsToDelete)).
				Find(&oldSessions).Error; err != nil {
				return err
			}

			for _, oldSession := range oldSessions {
				if err := tx.Delete(&oldSession).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})
}

func (s *SessionGormDB) DeleteSession(sessionID uint) error {
	result := s.db.Unscoped().Delete(&Session{}, sessionID)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *SessionGormDB) GetSession(sessionID uint) (Session, error) {
	var session Session
	err := s.db.First(&session, sessionID).Error
	return session, err
}

func (s *SessionGormDB) GetSessionByToken(token string) (Session, error) {
	var session Session
	err := s.db.
		Preload("User").
		Where("hashed_token = ?", token).
		First(&session).
		Error
	return session, err
}

func (s *SessionGormDB) CleanupExpiredSessions() error {
	return s.db.Where("expires < ?", time.Now()).Delete(&Session{}).Error
}
