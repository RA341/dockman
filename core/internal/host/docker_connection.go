package host

import (
	"context"
	"net"

	"github.com/moby/moby/api/types/system"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/ssh"
)

func testDockerConnection(cli *client.Client) (system.Info, error) {
	cliInfo, err := cli.Info(context.Background(), client.InfoOptions{})
	if err != nil {
		return system.Info{}, err
	}
	return cliInfo.Info, nil
}

// NewDockerLocalClient connects to the local docker host.
//
// It is assumed the docker daemon is running and is accessible
func NewDockerLocalClient() (*client.Client, error) {
	return client.New(
		client.FromEnv,
	)
}

// newDockerSSHClient establishes an SSH connection to a Docker host
func newDockerSSHClient(cli *ssh.Client) (*client.Client, error) {
	// Create a Docker client using the custom dialer.
	return client.New(
		client.WithDialContext(dockerSSHDialer(cli)),
	)
}

// dockerSSHDialer custom dialer that uses docker using an SSH connection.
// todo pass custom host path
func dockerSSHDialer(sshClient *ssh.Client) func(ctx context.Context, network string, addr string) (net.Conn, error) {
	return func(ctx context.Context, network string, addr string) (net.Conn, error) {
		dockerUnix := "/var/run/docker.sock"
		dial, err := sshClient.Dial("unix", dockerUnix)
		if err == nil {
			return dial, nil
		}

		dockerTcp := "127.0.0.1:2375"
		log.Warn().
			Err(err).
			Str("socket", dockerUnix).
			Str("tcp", dockerTcp).
			Msg("failed to dial remote docker client at socket, using fallback at tcp")

		return sshClient.Dial("tcp", dockerTcp)
	}
}

// currently unused here for reference
//
// newHostSSHClient connects to a remote docker host using public/private key authentication.
// It uses the local machine's SSH configuration (typically ~/.ssh) for connection.
//
// Prerequisites:
//   - The remote host must have an SSH server (sshd) running and accessible.
//   - The local machine must have the necessary SSH keys and configuration to connect.
//
// This function assumes the user has already configured SSH access to the remote host.
// It does not handle key generation or SSH configuration.
//func _(machine MachineOptions) (*client.Client, error) {
//	connectionStr := fmt.Sprintf("%s@%s:%d", machine.User, machine.Host, machine.Port)
//	helper, err := connhelper.GetConnectionHelper(fmt.Sprintf("ssh://%s", connectionStr))
//	if err != nil {
//		log.Error().Err(err).
//			Str("addr", connectionStr).
//			Msg("connection string")
//		return nil, err
//	}
//
//	httpClient := &http.Client{
//		Transport: &http.Transport{
//			DialContext: helper.Dialer,
//		},
//	}
//
//	newClient, err := client.NewClientWithOpts(
//		client.WithHTTPClient(httpClient),
//		client.WithHost(helper.Host),
//		client.WithDialContext(helper.Dialer),
//		client.WithAPIVersionNegotiation(),
//	)
//
//	if err != nil {
//		log.Error().Err(err).Str("addr", connectionStr).Msg("failed create ssh docker client")
//		return nil, fmt.Errorf("unable to connect to docker client")
//	}
//
//	return newClient, nil
//}
