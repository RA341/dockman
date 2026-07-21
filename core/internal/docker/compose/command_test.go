package compose

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSplitCommandLine(t *testing.T) {
	args, err := splitCommandLine(`docker run --rm -p 8080:80 nginx:alpine`)
	require.NoError(t, err)
	require.Equal(t, []string{"docker", "run", "--rm", "-p", "8080:80", "nginx:alpine"}, args)

	// double quotes keep spaces, backslash escapes work inside them
	args, err = splitCommandLine(`docker run -e "GREETING=hello world" -e NAME=\"quoted\" img`)
	require.NoError(t, err)
	require.Equal(t, []string{"docker", "run", "-e", "GREETING=hello world", "-e", `NAME="quoted"`, "img"}, args)

	// single quotes are literal
	args, err = splitCommandLine(`docker run -e 'A=$HOME and "stuff"' img`)
	require.NoError(t, err)
	require.Equal(t, []string{"docker", "run", "-e", `A=$HOME and "stuff"`, "img"}, args)

	// collapsed whitespace, tabs, empty quoted args
	args, err = splitCommandLine("docker   ps\t-a ''")
	require.NoError(t, err)
	require.Equal(t, []string{"docker", "ps", "-a", ""}, args)

	// escaped space outside quotes
	args, err = splitCommandLine(`docker run -v /my\ path:/data img`)
	require.NoError(t, err)
	require.Equal(t, []string{"docker", "run", "-v", "/my path:/data", "img"}, args)

	// unbalanced quotes are rejected
	_, err = splitCommandLine(`docker run "unterminated`)
	require.Error(t, err)

	// empty input
	args, err = splitCommandLine("   ")
	require.NoError(t, err)
	require.Empty(t, args)
}
