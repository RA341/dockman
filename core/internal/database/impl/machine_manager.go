package impl

import (
	"github.com/RA341/dockman/internal/ssh" // Assuming this path is correct
	"gorm.io/gorm"
)

// MachineManagerDB handles database operations for machine options using GORM.
type MachineManagerDB struct {
	db *gorm.DB
}

// NewMachineManagerDB creates a new instance of MachineManagerDB.
func NewMachineManagerDB(db *gorm.DB) *MachineManagerDB {
	return &MachineManagerDB{db: db}
}

// Save inserts a new machine option or updates it if a machine with the same name already exists.
func (m *MachineManagerDB) Save(mach *ssh.MachineOptions) error {
	result := m.db.Save(mach)
	return result.Error
}

// Delete removes a machine option from the database using its primary key.
func (m *MachineManagerDB) Delete(mac *ssh.MachineOptions) error {
	// unscoped for perma delete
	// https://gorm.io/docs/delete.html#Delete-permanently
	result := m.db.Unscoped().Delete(mac)
	return result.Error
}

// List retrieves all machine options from the database.
func (m *MachineManagerDB) List() ([]ssh.MachineOptions, error) {
	var machines []ssh.MachineOptions
	result := m.db.Find(&machines)
	return machines, result.Error
}

// GetByID retrieves a single machine option by its primary key.
func (m *MachineManagerDB) GetByID(id uint) (ssh.MachineOptions, error) {
	var machine ssh.MachineOptions
	result := m.db.First(&machine, id)
	return machine, result.Error
}

// Get retrieves a single machine option by its name.
func (m *MachineManagerDB) Get(machName string) (ssh.MachineOptions, error) {
	var machine ssh.MachineOptions
	result := m.db.Where("name = ?", machName).First(&machine)
	return machine, result.Error
}
