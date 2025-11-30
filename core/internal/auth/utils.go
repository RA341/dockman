package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"math/big"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
)

func setCookie[T any](
	response *connect.Response[T],
	value string,
	token string,
	expiresAt time.Time,
) {
	cookie := http.Cookie{
		Name:     value,
		Value:    token,
		Expires:  expiresAt,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		// Secure attribute (send only over HTTPS) - for production
		// Secure:   true,
		// Domain: "example.com", // Uncomment and set if you need to specify the domain
	}

	response.Header().Add("Set-Cookie", cookie.String())
}

func CreateAuthToken(length int) string {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	var randomString []byte

	for i := 0; i < length; i++ {
		randomIndex, _ := rand.Int(rand.Reader, big.NewInt(int64(len(characters))))
		randomString = append(randomString, characters[randomIndex.Int64()])
	}

	return string(randomString)
}

func checkPassword(inputPassword string, hashedPassword string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(inputPassword))
	if err != nil {
		log.Error().Err(err).Msg("Failed Password check")
		return false
	}
	return true
}

func encryptPassword(password string) (string, error) {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("unable to generate passoword")
	}
	return string(hashedPassword), nil
}

func hashString(input string) string {
	hash := sha256.New()
	hash.Write([]byte(input))
	// Get the resulting hash sum
	hashedBytes := hash.Sum(nil)
	// Convert the hashed bytes to a hexadecimal string
	hashedString := fmt.Sprintf("%x", hashedBytes)
	return hashedString
}
