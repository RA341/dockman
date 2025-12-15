package docker_manager

import (
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/pkg/fileutil"
	docker "github.com/docker/docker/client"
	"github.com/moby/moby/client"
)

type ConnectedDockerClient struct {
	mobyClient   *client.Client
	dockerClient *docker.Client
	ssh          *ssh.ConnectedMachine
}

func NewConnectedDockerClient(cli *client.Client, dockerClient *docker.Client, sshConn *ssh.ConnectedMachine) *ConnectedDockerClient {
	return &ConnectedDockerClient{
		mobyClient:   cli,
		ssh:          sshConn,
		dockerClient: dockerClient,
	}
}

// Close closes docker conn and ssh client
func (c *ConnectedDockerClient) Close() {
	fileutil.Close(c.mobyClient)
}
