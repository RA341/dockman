package docker

import (
	"testing"

	"github.com/stretchr/testify/require"
)

/*


- "traefik.enable=true"
- "traefik.http.routers.my-app.rule=Host(`myapp.example.com`)"

*/

func Test_extractTraefikLabel(t *testing.T) {
	labels := map[string]string{
		"traefik.enable":                       "true",
		"traefik.http.routers.my-service.rule": "Host(`myapp.localhost`, `api.localhost`) && PathPrefix(`/api`) ",
		"traefik.http.routers.my-app.rule":     "Host(`myapp.example.com`)",
	}

	hostsActual := extractTraefikLabel(labels)
	expectedHosts := []string{"myapp.localhost", "api.localhost", "myapp.example.com"}
	require.ElementsMatch(t, expectedHosts, hostsActual)

	labels["traefik.http.routers.my-service.rule"] = ""
	labels["traefik.http.routers.my-app.rule"] = ""
	hostsActual = extractTraefikLabel(labels)
	require.Nil(t, hostsActual)

	labels["traefik.enable"] = "false"
	hostsActual = extractTraefikLabel(labels)
	expectedHosts = []string{}
	require.Nil(t, hostsActual, "Host actual should be nil if traefic is disabled")
}
