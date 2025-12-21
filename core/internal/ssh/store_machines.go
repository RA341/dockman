package ssh

import "gorm.io/gorm"

// MachineManager manages machine configurations
type MachineManager interface {
	Save(mach *MachineOptions) error
	Delete(mac *MachineOptions) error
	List() ([]MachineOptions, error)
	Get(machName string) (MachineOptions, error)
	GetByID(id uint) (MachineOptions, error)
}

// MachineOptions defines the configuration for a single machine.
type MachineOptions struct {
	gorm.Model

	Name             string `gorm:"not null;uniqueIndex"`
	Enable           bool   `gorm:"not null;default:false"`
	Host             string `gorm:"not null"`
	Port             int    `gorm:"not null;default:22"`
	User             string `gorm:"not null"`
	Password         string
	RemotePublicKey  string
	UsePublicKeyAuth bool `gorm:"not null;default:false"`
}

// TableName specifies the custom table name for the model.
func (m *MachineOptions) TableName() string {
	return "machine_options"
}
