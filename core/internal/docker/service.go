package docker

import (
	"github.com/RA341/dockman/internal/docker/compose"
	"github.com/RA341/dockman/internal/docker/container"
	"github.com/RA341/dockman/internal/docker/debug"
	"github.com/RA341/dockman/internal/docker/updater"
	"github.com/moby/moby/client"
	"golang.org/x/crypto/ssh"
)

type Service struct {
	Compose    *compose.Service
	Container  *container.Service
	Updater    *updater.Service
	Debugger   *debug.Service
	DaemonAddr string
	Host       string
}

func NewService(
	hostname string,
	daemonAddr string,
	mobyClient *client.Client,
	sshCli *ssh.Client,
	fs compose.GetHost,
) *Service {
	containerClient := container.New(mobyClient)
	// todo potentially cache sshCli get and fs get ops
	composeClient := compose.NewComposeTerminal(hostname, containerClient, fs, sshCli)

	upClient := updater.New(containerClient, hostname, "", nil)
	dbgClient := debug.New(containerClient)

	return &Service{
		Host:       hostname,
		Container:  containerClient,
		Compose:    composeClient,
		Updater:    upClient,
		Debugger:   dbgClient,
		DaemonAddr: daemonAddr,
	}
}

func (s *Service) Close() error {
	//return s.ContainerService.daemon().Close()
	// todo look into close
	return nil
}
