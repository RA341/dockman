package ssh

import (
	"errors"
	"fmt"
	"net"
	"strconv"
	"testing"

	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/logger"
	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/gliderlabs/ssh"
	"github.com/stretchr/testify/require"
)

func init() {
	logger.InitForTest()
}

func TestTransferKey(t *testing.T) {
	mockMachineManager := MockMachineMan{data: syncmap.Map[string, *MachineOptions]{}}
	mockKeyManager := MockKeyMan{data: syncmap.Map[string, KeyConfig]{}}

	var capturedCommand string
	handler := func(s ssh.Session) {
		capturedCommand = s.RawCommand()
		_, _ = fmt.Fprintln(s, "key transferred") // Mock response
	}
	mockServer, addr := newMockSSHServer(t, handler)
	defer fileutil.Close(mockServer)

	host, port, _ := net.SplitHostPort(addr)

	service := NewService(&mockKeyManager, &mockMachineManager)

	atoi, err := strconv.Atoi(port)
	require.NoError(t, err)

	machineOpts := &MachineOptions{
		Name:             "test-machine",
		Host:             host,
		Port:             atoi,
		User:             "testuser",
		Password:         "testpass",
		UsePublicKeyAuth: true,
	}

	_, _, err = service.Create(machineOpts)
	require.NoError(t, err)

	// new service will create a new key at DefaultKeyName get it
	key, err := service.keys.GetKey(DefaultKeyName)
	require.NoError(t, err)
	expectedCommand := getTransferCommand(key.PublicKey)

	require.Equal(t, capturedCommand, expectedCommand)
	require.Empty(t, machineOpts.Password, "Password should be cleared after key transfer")
}

// newMockSSHServer starts an in-memory SSH server for testing.
func newMockSSHServer(t *testing.T, handler ssh.Handler) (*ssh.Server, string) {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen for mock SSH server: %v", err)
	}

	server := &ssh.Server{
		Handler: handler,
	}

	go func() {
		if err = server.Serve(listener); err != nil && !errors.Is(err, ssh.ErrServerClosed) {
			t.Errorf("mock SSH server failed: %v", err)
		}
	}()

	return server, listener.Addr().String()
}

type MockMachineMan struct {
	data syncmap.Map[string, *MachineOptions]
}

func (m *MockMachineMan) GetByID(id uint) (MachineOptions, error) {
	return MachineOptions{}, fmt.Errorf("unimplemented becuse GetByID is used while editing clients")
}

func (m *MockMachineMan) Save(mach *MachineOptions) error {
	if mach == nil {
		return fmt.Errorf("machine options cannot be nil")
	}

	key := mach.Name

	m.data.Store(key, mach)
	return nil
}

func (m *MockMachineMan) Delete(mac *MachineOptions) error {
	if mac == nil {
		return fmt.Errorf("machine options cannot be nil")
	}

	key := mac.Name

	// Check if the key exists before deletion
	if _, exists := m.data.Load(key); !exists {
		return fmt.Errorf("machine with name %s not found", key)
	}

	m.data.Delete(key)
	return nil
}

func (m *MockMachineMan) List() ([]MachineOptions, error) {
	var machines []MachineOptions

	m.data.Range(func(key string, value *MachineOptions) bool {
		if value != nil {
			machines = append(machines, *value)
		}
		return true // continue iteration
	})

	return machines, nil
}

func (m *MockMachineMan) Get(machName string) (MachineOptions, error) {
	value, exists := m.data.Load(machName)
	if !exists {
		return MachineOptions{}, fmt.Errorf("machine with name %s not found", machName)
	}

	if value == nil {
		return MachineOptions{}, fmt.Errorf("machine with name %s has nil value", machName)
	}

	return *value, nil
}

type MockKeyMan struct {
	data syncmap.Map[string, KeyConfig]
}

func (m *MockKeyMan) SaveKey(config KeyConfig) error {
	key := config.Name

	if key == "" {
		return fmt.Errorf("key name cannot be empty")
	}

	m.data.Store(key, config)
	return nil
}

func (m *MockKeyMan) GetKey(name string) (KeyConfig, error) {
	if name == "" {
		return KeyConfig{}, fmt.Errorf("key name cannot be empty")
	}

	value, exists := m.data.Load(name)
	if !exists {
		return KeyConfig{}, fmt.Errorf("key with name %s not found", name)
	}

	return value, nil
}

func (m *MockKeyMan) ListKeys() ([]KeyConfig, error) {
	var keys []KeyConfig

	m.data.Range(func(key string, value KeyConfig) bool {
		keys = append(keys, value)
		return true
	})

	return keys, nil
}

func (m *MockKeyMan) DeleteKey(name string) error {
	if name == "" {
		return fmt.Errorf("key name cannot be empty")
	}

	if _, exists := m.data.Load(name); !exists {
		return fmt.Errorf("key with name %s not found", name)
	}

	m.data.Delete(name)
	return nil
}
