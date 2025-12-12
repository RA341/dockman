package compose

import (
	"testing"

	"github.com/RA341/dockman/pkg/logger"
	"github.com/compose-spec/compose-go/v2/types"
	"github.com/stretchr/testify/require"
)

func init() {
	logger.InitForTest()
}

func TestTrimDockman(t *testing.T) {
	comp := New(nil, nil, "", nil)

	proj := types.Project{
		Services: map[string]types.ServiceConfig{
			"dockman": {
				Name:  "dockman",
				Image: "ghcr.io/ra341/dockman",
			},
			"alpine": {
				Name:  "alpine",
				Image: "alpine",
			},
			"alpine2": {
				Name:  "alpine2",
				Image: "ghcr.io/ra341/alpine",
			},
		},
	}

	res := comp.withoutDockman(&proj)
	require.ElementsMatch(t, []string{"alpine", "alpine2"}, res)

	res = comp.withoutDockman(&proj, "dockman", "alpine")
	require.ElementsMatch(t, []string{"alpine"}, res)

	res = comp.withoutDockman(&proj, "alpine")
	require.ElementsMatch(t, []string{"alpine"}, res)

	delete(proj.Services, "dockman")
	res = comp.withoutDockman(&proj)
	require.ElementsMatch(t, []string{}, res)
}
