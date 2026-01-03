package container

import (
	"context"
	"fmt"
	"testing"

	"github.com/dustin/go-humanize"
	"github.com/moby/moby/client"
	"github.com/stretchr/testify/require"
)

func TestImageDive(t *testing.T) {
	cli, err := client.New()
	require.NoError(t, err)

	srv := New(cli)

	analysis, err := srv.ImageDive(context.Background(), "dockman:latest")
	require.NoError(t, err)

	fmt.Println("Analysis:", analysis)
	fmt.Println("Wasted bytes", humanize.Bytes(analysis.WastedBytes))
	fmt.Println("Size bytes", humanize.Bytes(analysis.SizeBytes))
	fmt.Println("Efficiency", analysis.Efficiency)

}
