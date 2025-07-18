package ssh

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"github.com/RA341/dockman/internal/info"
	"github.com/RA341/dockman/pkg"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/ssh"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"time"
)

// Common SSH private key filenames in order of preference
var commonKeyNames = []string{
	"id_ed25519",
	"id_ecdsa",
	"id_rsa",
	"id_dsa",
}

// createSSHClient establishes a ssh connection
// based on the provided authentication method.
//
// If MachineOptions contains an empty public key, the key is saved on connect;
// otherwise, the provided key is verified.
func createSSHClient(machine *MachineOptions, auth ssh.AuthMethod, saveHostCallback ssh.HostKeyCallback) (*ssh.Client, error) {
	sshHost := fmt.Sprintf("%s:%d", machine.Host, machine.Port)
	conf := &ssh.ClientConfig{
		User:            machine.User,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: saveHostCallback,
		Timeout:         10 * time.Second,
	}

	if machine.RemotePublicKey != "" {
		log.Debug().Str("name", machine.Name).Msg("Verifying public key")
		pubkey, err := stringToPublicKey(machine.RemotePublicKey)
		if err != nil {
			return nil, err
		}

		conf.HostKeyCallback = ssh.FixedHostKey(pubkey)
	}

	sshClient, err := ssh.Dial("tcp", sshHost, conf)
	if err != nil {
		return nil, fmt.Errorf("failed to create ssh client: %w", err)
	}
	return sshClient, nil
}

func withKeyPairFromDB(man KeyManager) (ssh.AuthMethod, error) {
	key, err := man.GetKey(DefaultKeyName)
	if err != nil {
		return nil, fmt.Errorf("error retriving data from DB: %w", err)
	}

	signer, err := loadPrivateKeyFromBytes(key.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("error parsing private key: %w", err)
	}

	return ssh.PublicKeys(signer), nil
}

// withKeyPairFromPath connects to a remote docker host using public/private key authentication.
//
// Unlike newHostSSHClient, this function uses the SSH keys generated by dockman.
// Removes the dependency from configuring the host machine, useful for deploying in docker
//
// This function assumes the user has already transferred the public key generated by verifySSHKeyPair
// and configured SSH access to the remote host.
func withKeyPairFromPath(keyFolder string) (ssh.AuthMethod, error) {
	var signers []ssh.Signer
	var lastErr error

	for _, keyName := range commonKeyNames {
		keyPath := filepath.Join(keyFolder, keyName)
		if !pkg.FileExists(keyPath) {
			continue
		}

		signer, err := loadPrivateKeyFromFile(keyPath)
		if err != nil {
			lastErr = err
			continue
		}

		signers = append(signers, signer)
	}

	// If no keys were loaded, return the last error
	if len(signers) == 0 {
		if lastErr != nil {
			return nil, fmt.Errorf("failed to load any SSH keys: %v", lastErr)
		}

		return nil, fmt.Errorf(
			"no keys found (did you forget to ssh-keygen?) in %s, following files were checked for: %v",
			keyFolder,
			commonKeyNames,
		)
	}

	return ssh.PublicKeys(signers...), nil
}

// mom I want ssh
// we have ssh at home
// ssh at home: loads the default ssh keys in $USER/.ssh
func withKeyPairFromHome() (ssh.AuthMethod, error) {
	usr, err := user.Current()
	if err != nil {
		return nil, err
	}
	homeSSHFolder := filepath.Join(usr.HomeDir, ".ssh")
	return withKeyPairFromPath(homeSSHFolder)
}

// withPasswordAuth connects to a remote docker host using a password.
//
// It is assumed machine config.MachineOptions has the correct password set.
func withPasswordAuth(machine *MachineOptions) ssh.AuthMethod {
	return ssh.Password(machine.Password)
}

// loadPrivateKeyFromFile loads and parses a single private key file
func loadPrivateKeyFromFile(keyPath string) (ssh.Signer, error) {
	privateKey, err := os.ReadFile(keyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read private key %s: %v", keyPath, err)
	}

	return loadPrivateKeyFromBytes(privateKey)
}

func loadPrivateKeyFromBytes(privateKey []byte) (ssh.Signer, error) {
	// Try to parse the key without passphrase first
	signer, err := ssh.ParsePrivateKey(privateKey)
	if err != nil {
		// Check if it's a passphrase-protected key
		if strings.Contains(err.Error(), "encrypted") || strings.Contains(err.Error(), "passphrase") {
			return nil, fmt.Errorf("private key is encrypted and requires a passphrase")
		}
		return nil, fmt.Errorf("failed to parse private key :%w", err)
	}

	return signer, nil
}

// generateKeyPair creates a new SSH key pair
func generateKeyPair() (privateKey []byte, publicKey []byte, err error) {
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}

	// Convert private key to PEM format
	privateKeyDER := x509.MarshalPKCS1PrivateKey(rsaKey)
	privateKeyBlock := pem.Block{
		Type:    "RSA PRIVATE KEY",
		Headers: nil,
		Bytes:   privateKeyDER,
	}
	privatePEM := pem.EncodeToMemory(&privateKeyBlock)

	// Generate public key from private key
	rsaPublicKey, err := ssh.NewPublicKey(&rsaKey.PublicKey)
	if err != nil {
		return nil, nil, err
	}
	pubKeyBytes := ssh.MarshalAuthorizedKey(rsaPublicKey)

	return privatePEM, pubKeyBytes, nil
}

// verifySSHKeyPair creates RSA key-pair files,
// if running in docker and
//
// if they do not exist, otherwise skips generation
//
// the generated keys can be found in
func verifySSHKeyPair(baseDir string) (string, error) {
	baseDir = filepath.Join(baseDir, "ssh")
	if err := os.MkdirAll(baseDir, 0700); err != nil {
		return "", fmt.Errorf("unable to create dir: %w", err)
	}

	if !info.IsDocker() {
		return baseDir, nil
	}

	privateKeyPath := fmt.Sprintf("%s/%s", baseDir, "id_rsa")
	publicKeyPath := fmt.Sprintf("%s/%s", baseDir, "id_rsa.pub")

	defer log.Info().
		Msgf("to add the public key to other hosts use\nssh-copy-id -i %s <user>@<remote_host>\n", publicKeyPath)

	logF := log.Info().
		Str("private_key_file", privateKeyPath).
		Str("public_key_file", publicKeyPath).
		Str("path", baseDir)

	if pkg.FileExists(privateKeyPath) && pkg.FileExists(publicKeyPath) {
		logF.Msg("found existing keys... skipping generation")
		return baseDir, nil
	}

	privateKey, publicKey, err := generateKeyPair()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to generate key pair")
	}

	if err := os.WriteFile(privateKeyPath, privateKey, 0600); err != nil {
		log.Fatal().Err(err).Msg("Failed to save private key")
	}
	if err := os.WriteFile(publicKeyPath, publicKey, 0644); err != nil {
		log.Fatal().Err(err).Msg("Failed to save public key")
	}

	logF.Msg("Generated new SSH key pair")
	return baseDir, nil
}

func publicKeyToString(publicKey ssh.PublicKey, comment string) (string, error) {
	authorizedKey := ssh.MarshalAuthorizedKey(publicKey)
	if comment != "" {
		return string(authorizedKey[:len(authorizedKey)-1]) + " " + comment, nil
	}
	return string(authorizedKey), nil
}

func stringToPublicKey(publicKeyString string) (ssh.PublicKey, error) {
	publicKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(publicKeyString))
	if err != nil {
		return nil, fmt.Errorf("unable to parse public key %v", err)
	}
	return publicKey, nil
}
