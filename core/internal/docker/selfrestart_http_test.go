package docker

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	contSrv "github.com/RA341/dockman/internal/docker/container"
	hostMid "github.com/RA341/dockman/internal/host/middleware"
	apiContainer "github.com/moby/moby/api/types/container"
	"github.com/moby/moby/client"
	"github.com/stretchr/testify/require"
)

func TestRestartDockmanUsesDaemonAfterAcceptedResponse(t *testing.T) {
	restarted := make(chan string, 1)
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		response := &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader("")),
			Request:    r,
		}
		switch {
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/containers/json"):
			var body strings.Builder
			require.NoError(t, json.NewEncoder(&body).Encode([]apiContainer.Summary{{
				ID:     "self-id",
				Labels: map[string]string{dockmanContainerLabel: "true"},
			}}))
			response.Header.Set("Content-Type", "application/json")
			response.Body = io.NopCloser(strings.NewReader(body.String()))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/containers/self-id/restart"):
			restarted <- r.URL.Path
			response.StatusCode = http.StatusNoContent
		default:
			response.StatusCode = http.StatusNotFound
			response.Body = io.NopCloser(strings.NewReader("unexpected daemon request"))
		}
		return response, nil
	})}

	cli, err := client.New(
		client.WithHost("http://docker-proxy"),
		client.WithHTTPClient(httpClient),
		client.WithVersion("1.52"),
	)
	require.NoError(t, err)
	defer cli.Close()

	dkSrv := &Service{Container: contSrv.New(cli)}
	handler := NewHandlerHttp(func(host string) (*Service, error) {
		require.Equal(t, contSrv.LocalClient, host)
		return dkSrv, nil
	}, false)

	req := httptest.NewRequest(http.MethodPost, "/restart/dockman", nil)
	req = req.WithContext(hostMid.SetHost(context.Background(), contSrv.LocalClient))
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	require.Equal(t, http.StatusAccepted, res.Code)
	select {
	case path := <-restarted:
		require.True(t, strings.HasSuffix(path, "/containers/self-id/restart"))
	case <-time.After(3 * time.Second):
		t.Fatal("Docker daemon did not receive the delayed self-restart request")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return fn(r)
}

func TestRestartDockmanRejectsRemoteHost(t *testing.T) {
	handler := NewHandlerHttp(func(string) (*Service, error) {
		t.Fatal("service provider must not be called for a remote host")
		return nil, nil
	}, false)
	req := httptest.NewRequest(http.MethodPost, "/restart/dockman", nil)
	req = req.WithContext(hostMid.SetHost(context.Background(), "remote"))
	res := httptest.NewRecorder()

	handler.ServeHTTP(res, req)

	require.Equal(t, http.StatusBadRequest, res.Code)
}
