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
		"traefik.http.routers.my-app.rule":     "Host(`myapp.example.com`, `MYAPP.EXAMPLE.COM`)",
		"traefik.tcp.routers.secure.rule":      "HostSNI(`tcp.example.com`)",
	}

	hostsActual := extractTraefikLabel(labels)
	expectedHosts := []string{"api.localhost", "myapp.example.com", "myapp.localhost", "tcp.example.com"}
	require.Equal(t, expectedHosts, hostsActual)

	delete(labels, "traefik.enable")
	require.Equal(t, expectedHosts, extractTraefikLabel(labels), "router labels use Traefik's expose-by-default behavior")
	labels["traefik.enable"] = "true"

	labels["traefik.http.routers.my-service.rule"] = ""
	labels["traefik.http.routers.my-app.rule"] = ""
	labels["traefik.tcp.routers.secure.rule"] = ""
	hostsActual = extractTraefikLabel(labels)
	require.Nil(t, hostsActual)

	labels["traefik.enable"] = "false"
	hostsActual = extractTraefikLabel(labels)
	expectedHosts = []string{}
	require.Nil(t, hostsActual, "Host actual should be nil if traefic is disabled")
}
