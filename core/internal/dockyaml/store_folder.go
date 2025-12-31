package dockyaml

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/rs/zerolog/log"
)

const base = "dockman.yml"

// StoreFolder stores dockman yaml files in store
type StoreFolder struct {
	configPath string
}

func NewStore(configPath string) *StoreFolder {
	abs, err := filepath.Abs(configPath)
	if err != nil {
		log.Fatal().Err(err).Msg("Could not get abs path for config")
	}

	err = os.MkdirAll(abs, 0755)
	if err != nil {
		log.Fatal().Err(err).Msg("Could not create folder")
	}

	return &StoreFolder{
		configPath: abs,
	}
}

func (s *StoreFolder) formatFileDoc(host string) string {
	return filepath.Join(
		s.configPath,
		fmt.Sprintf("%s.%s", host, base),
	)
}

func (s *StoreFolder) Get(host string) (*os.File, os.FileInfo, error) {
	doc := s.formatFileDoc(host)
	file, err := os.OpenFile(
		doc,
		os.O_RDONLY|os.O_CREATE,
		os.ModePerm,
	)
	if err != nil {
		return nil, nil, err
	}

	stat, err := file.Stat()
	if err != nil {
		return nil, nil, err
	}

	return file, stat, nil
}

func (s *StoreFolder) Save(host string, data []byte) error {
	file, err := os.OpenFile(
		s.formatFileDoc(host),
		os.O_RDWR|os.O_CREATE|os.O_TRUNC,
		os.ModePerm,
	)
	if err != nil {
		return err
	}

	_, err = file.Write(data)
	if err != nil {
		return err
	}
	return nil
}
