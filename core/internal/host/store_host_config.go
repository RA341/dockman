package host

import (
	"github.com/RA341/dockman/internal/dockyaml"
	"github.com/RA341/dockman/internal/ssh"
	"gorm.io/gorm"
)

type Store interface {
	Get(Host string) (Config, error)
	Add(conf *Config) error
	Delete(conf *Config) error
	Update(conf *Config) error
	List() ([]Config, error)
	ListEnabled() ([]Config, error)
}

type ClientType string

const (
	SSH   ClientType = "ssh"
	LOCAL ClientType = "local"
)

type Config struct {
	gorm.Model
	Name         string
	Type         ClientType
	Enable       bool   `gorm:"not null;default:false"`
	DockerSocket string `gorm:""`

	// Belongs To Relationship (SSHOptions)
	// If SSHID is 0, Preload will simply return nil for SSHOptions
	SSHID      uint                `gorm:"default:null"`
	SSHOptions *ssh.MachineOptions `gorm:"foreignKey:SSHID"`

	Dockyaml dockyaml.DockContent `gorm:"foreignKey:ConfigID"`

	// Has Many Relationship (FolderAliases)
	FolderAliases []FolderAlias `gorm:"foreignKey:ConfigID"`
	MachineAddr   string
}

func (*Config) TableName() string {
	return "host_config"
}
