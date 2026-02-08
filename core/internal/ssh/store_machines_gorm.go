package ssh

import (
	"gorm.io/gorm"
)

// MachineManagerDB handles database operations for machine options using GORM.
type MachineManagerDB struct {
	db *gorm.DB
}

// NewGormMachineManger creates a new instance of MachineManagerDB.
func NewGormMachineManger(db *gorm.DB) *MachineManagerDB {
	return &MachineManagerDB{db: db}
}

// Save inserts a new machine option or updates it if a machine with the same name already exists.
func (m *MachineManagerDB) Save(mach *MachineOptions) error {
	result := m.db.Save(mach)
	return result.Error
}

// Delete removes a machine option from the database using its primary key.
func (m *MachineManagerDB) Delete(mac *MachineOptions) error {
	// unscoped for perma delete
	// https://gorm.io/docs/delete.html#Delete-permanently
	result := m.db.Unscoped().Delete(mac)
	return result.Error
}

// List retrieves all machine options from the database.
func (m *MachineManagerDB) List() ([]MachineOptions, error) {
	var machines []MachineOptions
	result := m.db.Find(&machines)
	return machines, result.Error
}

// GetByID retrieves a single machine option by its primary key.
func (m *MachineManagerDB) GetByID(id uint) (MachineOptions, error) {
	var machine MachineOptions
	result := m.db.First(&machine, id)
	return machine, result.Error
}
