package compose

import (
	"context"
	"io"
	"log"
	"os"
	"testing"
	"time"

	"github.com/RA341/dockman/internal/docker/container"
	"github.com/moby/moby/client"
	"github.com/stretchr/testify/require"
)

var termCli *Service
var ctx = context.Background()
var rwc = TermRWC()
var cont *container.Service

func init() {
	local := LocalRunner{}
	c, err := client.New()
	if err != nil {
		log.Fatal(err)
	}

	cont = container.New(c)
	termCli = NewComposeTerminal(local, cont, "", nil)
}

func TestVersion(t *testing.T) {
	version, err := termCli.version(context.Background(), nil)
	require.NoErrorf(t, err, "version error: %v", err)
	require.Equal(t, version, composePlugin)
}

const working = "samples"
const com = "test-compose.yaml"

func TestUp(t *testing.T) {
	err := termCli.Up(ctx, working, com, rwc, []string{})
	require.NoError(t, err)
}

func TestDown(t *testing.T) {
	err := termCli.Up(ctx, working, com, rwc, []string{})
	require.NoError(t, err)
	err = termCli.Down(ctx, working, com, rwc)
	require.NoError(t, err)
}

func TestLs(t *testing.T) {
	err := termCli.Up(ctx, working, com, rwc, []string{})
	require.NoError(t, err)

	ids, err := termCli.listIds(ctx, working, com)
	require.NoError(t, err)
	require.NotEqual(t, len(ids), 0)
	t.Log(ids)

	err = termCli.Down(ctx, working, com, rwc)
	require.NoError(t, err)
}

func TestValidate(t *testing.T) {
	out, err := termCli.Validate(ctx, working, com, []string{})
	require.NoError(t, err)

	t.Log(out)
}

func TestStartStop(t *testing.T) {
	err := termCli.Up(ctx, working, com, rwc, []string{})
	require.NoError(t, err)

	time.Sleep(1 * time.Second)

	err = termCli.Stop(ctx, working, com, rwc)
	require.NoError(t, err)

	time.Sleep(1 * time.Second)

	err = termCli.Start(ctx, working, com, rwc, []string{})
	require.NoError(t, err)
}

type RWC struct {
	io.Reader
	io.Writer
}

func TermRWC() RWC {
	return RWC{
		Reader: os.Stdin,
		Writer: os.Stdout,
	}
}
