package utils

import (
	"fmt"
	"path/filepath"
	"strings"
)

func ExtractMeta(filename string) (relpath string, pathAlias string, err error) {
	filename = filepath.Clean(filename) + "/" // empty trailing "/" is stripped by clean
	parts := strings.SplitN(filename, "/", 2)
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid filename: %s", filename)
	}
	pathAlias = parts[0]
	relpath = filepath.Clean(parts[1])

	return relpath, pathAlias, nil
}
