package host

import (
	"fmt"

	"github.com/RA341/dockman/internal/host/filesystem"
	"github.com/pkg/sftp"
)

type SFTPProvider func() *sftp.Client

type AliasService struct {
	store AliasStore

	hostId       uint
	kind         ClientType
	sftpProvider SFTPProvider
}

func NewAliasService(
	store AliasStore,
	hostId uint,
	kind ClientType,
	provider SFTPProvider,
) *AliasService {
	return &AliasService{
		store:        store,
		hostId:       hostId,
		kind:         kind,
		sftpProvider: provider,
	}
}

func (as *AliasService) LoadAlias(alias string) (filesystem.FileSystem, error) {
	root, err := as.resolveAlias(alias)
	if err != nil {
		return nil, err
	}

	return as.LoadDirect(root)
}

// LoadDirect loads a filesystem directly without checking db
func (as *AliasService) LoadDirect(root string) (filesystem.FileSystem, error) {
	switch as.kind {
	case SSH:
		if as.sftpProvider == nil {
			return nil, fmt.Errorf("SFTP provider is nil, TF did you do")
		}
		return filesystem.NewSftp(as.sftpProvider(), root), nil
	case LOCAL:
		return filesystem.NewLocal(root), nil
	default:
		return nil, fmt.Errorf("unknown host type: %s", as.kind)
	}
}

func (as *AliasService) resolveAlias(alias string) (string, error) {
	get, err := as.store.Get(as.hostId, alias)
	if err != nil {
		return "", err
	}
	return get.Fullpath, nil
}

func (as *AliasService) CreateOrEdit(alias, fullpath string) error {
	existing, err := as.Get(alias)
	if err != nil {
		return as.Add(alias, fullpath)
	}

	existing.Fullpath = fullpath
	return as.Edit(existing.ID, &existing)
}

func (as *AliasService) Get(alias string) (FolderAlias, error) {
	return as.store.Get(as.hostId, alias)
}

func (as *AliasService) Edit(aliasID uint, alias *FolderAlias) error {
	return as.store.EditAlias(as.hostId, aliasID, alias)
}

func (as *AliasService) List() ([]FolderAlias, error) {
	return as.store.List(as.hostId)
}

func (as *AliasService) Add(alias string, fullpath string) error {
	return as.store.AddAlias(as.hostId, alias, fullpath)
}

func (as *AliasService) Delete(alias string) error {
	return as.store.RemoveAlias(as.hostId, alias)
}
