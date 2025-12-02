package docker_manager

import (
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/moby/moby/client"
)

type ConnectedDockerClient struct {
	dockerClient *client.Client
	ssh          *ssh.ConnectedMachine
}

func NewConnectedDockerClient(cli *client.Client, sshConn *ssh.ConnectedMachine) *ConnectedDockerClient {
	return &ConnectedDockerClient{
		dockerClient: cli,
		ssh:          sshConn,
	}
}

// Close closes docker conn and ssh client
func (c *ConnectedDockerClient) Close() {
	fileutil.Close(c.dockerClient)
}
