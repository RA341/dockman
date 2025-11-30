package auth

import (
	"fmt"
	"time"

	"github.com/RA341/dockman/internal/config"
	"github.com/rs/zerolog/log"
)

type Config = *config.Auth

type Service struct {
	userStore    UserStore
	sessionStore SessionStore
	config       Config
}

func NewService(
	user, pass string,
	config Config,
	userStore UserStore,
	sessionStore SessionStore,
) *Service {
	s := &Service{
		userStore:    userStore,
		sessionStore: sessionStore,
		config:       config,
	}
	err := s.create(user, pass)
	if err != nil {
		log.Fatal().Err(err).Msg("unable to create default user")
	}

	log.Debug().Msg("Auth service loaded successfully")
	return s
}

func (auth *Service) create(username, plainTextPassword string) error {
	encryptedPassword, err := encryptPassword(plainTextPassword)
	if err != nil {
		return fmt.Errorf("unable to encrypt password: %v", err)
	}

	_, err = auth.userStore.NewUser(username, encryptedPassword)
	if err != nil {
		return fmt.Errorf("unable to create user: %v", err)
	}

	return nil
}

func (auth *Service) Login(username, plainTextPassword string) (*Session, string, error) {
	user, err := auth.userStore.GetUser(username)
	if err != nil {
		return nil, "", fmt.Errorf("failed retrive user: %w", err)
	}

	ok := checkPassword(plainTextPassword, user.EncryptedPassword)
	if !ok {
		return nil, "", fmt.Errorf("invalid user/password")
	}

	unHashedToken := CreateAuthToken(32)
	var session Session
	session.UserID = user.ID
	session.User = *user
	session.Expires = time.Now().Add(auth.config.GetCookieExpiryLimitOrDefault())
	session.HashedToken = hashString(unHashedToken)

	err = auth.sessionStore.NewSession(&session)
	if err != nil {
		return nil, "", fmt.Errorf("error updating user session, %w", err)
	}

	return &session, unHashedToken, nil
}

func (auth *Service) Logout(sessionId uint) error {
	err := auth.sessionStore.DeleteSession(sessionId)
	if err != nil {
		return err
	}
	return nil
}

func (auth *Service) VerifyToken(token string) (*User, error) {
	hashedToken := hashString(token)
	session, err := auth.sessionStore.GetSessionByToken(hashedToken)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	val := now.Compare(session.Expires)
	if val == 1 {
		return nil, fmt.Errorf("token expired at %s, current time: %s", session.Expires, now)
	}

	return &session.User, nil
}
