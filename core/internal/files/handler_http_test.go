package files

import (
	b64 "encoding/base64"
	"testing"
)

func TestDecodeUploadFilename(t *testing.T) {
	t.Parallel()

	paths := []string{
		"compose/docker-compose.yml",
		"production/configuration avec espaces.yaml",
		"données/élément-€-東京.txt",
	}

	for _, path := range paths {
		path := path
		t.Run(path, func(t *testing.T) {
			t.Parallel()

			encoded := b64.RawURLEncoding.EncodeToString([]byte(path))
			decoded, err := decodeUploadFilename(encoded)
			if err != nil {
				t.Fatalf("decode URL-safe filename: %v", err)
			}
			if string(decoded) != path {
				t.Fatalf("decoded path %q, want %q", decoded, path)
			}
		})
	}
}

func TestDecodeUploadFilenameAcceptsLegacyBase64(t *testing.T) {
	t.Parallel()

	const path = "compose/legacy.yml"
	encoded := b64.StdEncoding.EncodeToString([]byte(path))
	decoded, err := decodeUploadFilename(encoded)
	if err != nil {
		t.Fatalf("decode legacy filename: %v", err)
	}
	if string(decoded) != path {
		t.Fatalf("decoded path %q, want %q", decoded, path)
	}
}
