package config

import (
	"context"
	"fmt"
	"io/fs"
	"os"
)

type ServerOpt func(o *AppConfig)

func WithCtx(ctx context.Context) ServerOpt {
	return func(o *AppConfig) {
		o.ServerContext = ctx
	}
}

func WithUIFromFile(path string) (fs.FS, error) {
	root, err := os.OpenRoot(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open UI path: %s : %w", path, err)
	}

	return root.FS(), nil
}

func WithUIFS(uiFs fs.FS) ServerOpt {
	return func(o *AppConfig) {
		o.UIFS = uiFs
	}
}
