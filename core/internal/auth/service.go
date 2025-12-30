package auth

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/http"
	"time"

	"github.com/RA341/dockman/internal/info"
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/rs/zerolog/log"
	"golang.org/x/oauth2"
)

type Service struct {
	userStore    UserStore
	sessionStore SessionStore
	config       *Config

	oidcProvider *oidc.Provider
	oauth2Config *oauth2.Config
}

func NewService(
	user, pass string,
	config *Config,
	userStore UserStore,
	sessionStore SessionStore,
) *Service {
	s := &Service{
		userStore:    userStore,
		sessionStore: sessionStore,
		config:       config,
	}

	if config.OIDCEnable {
		ctx := getOidcContext(nil)

		provider, err := oidc.NewProvider(ctx, config.OIDCIssuerURL)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to query OIDC provider")
		}

		oauth2Config := &oauth2.Config{
			ClientID:     config.OIDCClientID,
			ClientSecret: config.OIDCClientSecret,
			RedirectURL:  config.OIDCRedirectURL,
			Endpoint:     provider.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
		}

		s.oidcProvider = provider
		s.oauth2Config = oauth2Config
	}

	_, err := s.create(user, pass)
	if err != nil {
		log.Fatal().Err(err).Msg("unable to create default user")
	}

	log.Debug().Msg("Auth service loaded successfully")
	return s
}

// useful to set disable self-signed cert warnings for dev
// pass nil client to use default context.background
func getOidcContext(ctx context.Context) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if info.IsDev() {
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
		customClient := &http.Client{Transport: tr}
		ctx = oidc.ClientContext(ctx, customClient)
	}
	return ctx
}

func (auth *Service) create(username, plainTextPassword string) (*User, error) {
	encryptedPassword, err := encryptPassword(plainTextPassword)
	if err != nil {
		return nil, fmt.Errorf("unable to encrypt password: %v", err)
	}

	user, err := auth.userStore.NewUser(username, encryptedPassword)
	if err != nil {
		return nil, fmt.Errorf("unable to create user: %v", err)
	}

	return user, nil
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

	return auth.CreateSession(user)
}

func (auth *Service) CreateSession(user *User) (session *Session, rawSessionToken string, err error) {
	rawSessionToken = CreateAuthToken(32)

	session = &Session{}
	session.UserID = user.ID
	session.User = *user
	session.Expires = time.Now().Add(auth.config.GetCookieExpiry())
	session.HashedToken = hashString(rawSessionToken)

	err = auth.sessionStore.NewSession(session)
	if err != nil {
		return nil, "", fmt.Errorf("error updating user session, %w", err)
	}

	return session, rawSessionToken, nil
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

func (auth *Service) GetOIDCLoginURL(state string) string {
	return auth.oauth2Config.AuthCodeURL(state)
}

func (auth *Service) OIDCCallback(ctx context.Context, code string) (*Session, string, error) {
	ctx = getOidcContext(ctx)
	oauth2Token, err := auth.oauth2Config.Exchange(ctx, code)
	if err != nil {
		return nil, "", fmt.Errorf("failed to exchange token: %w", err)
	}

	rawIDToken, ok := oauth2Token.Extra("id_token").(string)
	if !ok {
		return nil, "", fmt.Errorf("no id_token field in oauth2 token")
	}

	verifier := auth.oidcProvider.Verifier(&oidc.Config{ClientID: auth.config.OIDCClientID})
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, "", fmt.Errorf("failed to verify ID Token: %w", err)
	}

	// Extract Claims (Email is key here)
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}

	err = idToken.Claims(&claims)
	if err != nil {
		return nil, "", fmt.Errorf("failed to parse claims: %w", err)
	}

	user, err := auth.userStore.GetUser(claims.Email)
	if err != nil {
		randomPass := CreateAuthToken(32)
		user, err = auth.create(claims.Email, randomPass)
		if err != nil {
			return nil, "", fmt.Errorf("failed to create user: %w", err)
		}
	}

	return auth.CreateSession(user)
}
