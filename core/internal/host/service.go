package host

import (
	"context"
	"fmt"
	"net/http"
)

func GetHost(ctx context.Context) (string, error) {
	va := ctx.Value(HeaderDockerHost)
	if va == nil {
		return "", fmt.Errorf("no Docker host header found")
	}
	host := va.(string)
	if host == "" {
		return "", fmt.Errorf("no Docker host header found")
	}
	return host, nil
}

func setHost(ctx context.Context, req http.Header) context.Context {
	host := req.Get(HeaderDockerHost)
	ctx = context.WithValue(ctx, HeaderDockerHost, host)
	return ctx
}
