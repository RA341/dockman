package ssh

import (
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
