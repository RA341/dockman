package ssh

import (
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
	"gorm.io/gorm"
)

const DefaultKeyName = "defaultSSHKey"

type KeyManager interface {
	SaveKey(config KeyConfig) error
	GetKey(name string) (KeyConfig, error)
	ListKeys() ([]KeyConfig, error)
	DeleteKey(name string) error
}

type KeyConfig struct {
	gorm.Model
	Name       string `gorm:"not null;unique"` // Identifier for the SSH config
	PublicKey  []byte `gorm:"type:blob"`
	PrivateKey []byte `gorm:"type:blob"`
}

// TableName specifies the table name for the KeyConfig model
func (KeyConfig) TableName() string {
	return "ssh_configs"
}

type ConnectedMachine struct {
	SshClient  *ssh.Client
	SftpClient *SftpClient
	Sftp       *sftp.Client
}

func NewConnectedMachine(
	sshClient *ssh.Client,
	client *sftp.Client,
	sftpClient *SftpClient,
) *ConnectedMachine {
	return &ConnectedMachine{
		SshClient: sshClient,
		// todo remove this
		SftpClient: sftpClient,
		Sftp:       client,
	}
}

// Close return error to fulfill io.closer we don't need to use it
func (c *ConnectedMachine) Close() error {
	fileutil.Close(c.SftpClient.sfCli)
	fileutil.Close(c.SshClient)
	return nil
}

// ClientConfig structure of the yaml file
type ClientConfig struct {
	DefaultHost       string                    `yaml:"default_host"`
	EnableLocalDocker bool                      `yaml:"enable_local_docker"`
	Machines          map[string]MachineOptions `yaml:"machines"`
}
