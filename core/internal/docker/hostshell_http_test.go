package docker

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseShellDim(t *testing.T) {
	require.EqualValues(t, 120, parseShellDim("120", 80))
	require.EqualValues(t, 80, parseShellDim("", 80))
	require.EqualValues(t, 80, parseShellDim("garbage", 80))
	require.EqualValues(t, 80, parseShellDim("-3", 80))
	// absurd sizes fall back instead of allocating huge ptys
	require.EqualValues(t, 24, parseShellDim("99999", 24))
}
