package middleware

import (
	"context"
	"fmt"
)

const HeaderDockerHost = "DOCKER_HOST"

func GetHost(ctx context.Context) (string, error) {
	va := ctx.Value(HeaderDockerHost)
	if va == nil {
		return "", fmt.Errorf("host header not found")
	}
	host := va.(string)
	if host == "" {
		return "", fmt.Errorf("docker host is not empty")
	}
	return host, nil
}

func SetHost(ctx context.Context, hostname string) context.Context {
	return context.WithValue(
		ctx,
		HeaderDockerHost,
		hostname,
	)
}
