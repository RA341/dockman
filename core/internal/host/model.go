package host

import (
	"fmt"

	"github.com/moby/moby/client"
	"github.com/pkg/sftp"
	ssh2 "golang.org/x/crypto/ssh"
)

// ActiveHost indicates a connected and active instance
type ActiveHost struct {
	HostId    uint
	Kind      ClientType
	IsDefault bool

	DockerClient *client.Client
	SSHClient    *ssh2.Client
	SFTPClient   *sftp.Client

	FS   *AliasService
	Addr string
}

func (a *ActiveHost) Close() (err error) {
	if a.DockerClient != nil {
		err = a.DockerClient.Close()
		if err != nil {
			return fmt.Errorf("close docker client: %w", err)
		}
	}

	if a.SFTPClient != nil {
		err = a.SFTPClient.Close()
		if err != nil {
			return fmt.Errorf("close sftp client: %w", err)
		}
	}

	if a.SFTPClient != nil {
		err = a.SSHClient.Close()
		if err != nil {
			return err
		}
	}

	return nil
}
