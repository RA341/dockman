package auth

import (
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
)

type Service struct {
	authDb       Store
	cookieExpiry time.Duration
}

func NewService(user, pass string, cookieExpiry time.Duration, authDB Store) *Service {
	s := &Service{
		authDb:       authDB,
		cookieExpiry: cookieExpiry,
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

	_, err = auth.authDb.NewUser(username, encryptedPassword)
	if err != nil {
		return fmt.Errorf("unable to create user: %v", err)
	}

	return nil
}

func (auth *Service) Login(username, plainTextPassword string) (*User, string, error) {
	user, err := auth.authDb.GetUser(username)
	if err != nil {
		return nil, "", fmt.Errorf("failed retrive user: %w", err)
	}

	if ok := checkPassword(plainTextPassword, user.EncryptedPassword); !ok {
		return nil, "", fmt.Errorf("invalid user/password")
	}

	unHashedToken := CreateAuthToken(32)
	user.Token = hashString(unHashedToken)
	user.Expires = time.Now().Add(auth.cookieExpiry)

	if err = auth.authDb.UpdateUser(user); err != nil {
		return nil, "", fmt.Errorf("error updating user, %w", err)
	}

	return user, unHashedToken, nil
}

func (auth *Service) Logout(user *User) error {
	user.Token = ""

	if err := auth.authDb.UpdateUser(user); err != nil {
		return err
	}

	return nil
}

func (auth *Service) VerifyToken(token string) (*User, error) {
	hashedToken := hashString(token)
	user, err := auth.authDb.VerifyAuthToken(hashedToken)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	val := now.Compare(user.Expires)
	if val == 1 {
		return nil, fmt.Errorf("token expired at %s, current time: %s", user.Expires, now)
	}

	return user, nil
}
