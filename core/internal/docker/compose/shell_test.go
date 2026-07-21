package compose

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestShellQuote(t *testing.T) {
	require.Equal(t, "'/srv/stacks/app'", shellQuote("/srv/stacks/app"))
	require.Equal(t, "'/srv/it'\\''s here'", shellQuote("/srv/it's here"))
	require.Equal(t, "'/srv/with space'", shellQuote("/srv/with space"))
	// injection attempts stay inert inside single quotes
	require.Equal(t, "'/srv;rm -rf /'", shellQuote("/srv;rm -rf /"))
}
