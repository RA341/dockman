package fileutil

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/rs/zerolog/log"
)

func CreateSampleFile(filepath, content string) error {
	file, err := OpenFile(filepath)
	if err != nil {
		return fmt.Errorf("error creating dummy file: %s", err)
	}
	defer Close(file)

	_, err = file.Write([]byte(content))
	if err != nil {
		return fmt.Errorf("error writing dummy file: %s", err)
	}

	return nil
}

func OpenFile(filename string) (*os.File, error) {
	return os.OpenFile(filename, os.O_RDWR|os.O_CREATE, os.ModePerm)
}

func FileExists(filename string) bool {
	_, err := os.Stat(filename)
	return !os.IsNotExist(err)
}

func StatFileIfExists(filename string) os.FileInfo {
	stat, err := os.Stat(filename)
	if err != nil {
		return nil
	}
	return stat
}

func Close(rw io.Closer) {
	err := rw.Close()
	if err != nil && !errors.Is(err, io.EOF) {
		log.Warn().Err(err).Msg("Error occurred while closing io.Closer")
	}
}
