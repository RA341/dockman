package host

import (
	"fmt"
	fs2 "io/fs"
	"slices"
	"strings"
	"sync"

	"github.com/RA341/dockman/internal/docker"
	"github.com/RA341/dockman/internal/docker/compose"
	fUtil "github.com/RA341/dockman/internal/files/utils"
	"github.com/RA341/dockman/internal/host/filesystem"
	"github.com/RA341/dockman/internal/ssh"
	"github.com/RA341/dockman/pkg/fileutil"
	"github.com/RA341/dockman/pkg/listutils"
	"github.com/RA341/dockman/pkg/syncmap"
	"github.com/moby/moby/client"
	"github.com/rs/zerolog/log"
	ssh2 "golang.org/x/crypto/ssh"
)

//const Default

type Service struct {
	store Store
	ssh   *ssh.Service

	activeClients syncmap.Map[string, *ActiveHost]
	aliasStore    AliasStore
}

func NewService(
	store Store,
	aliasStore AliasStore,
	ssh *ssh.Service,
	composeRoot string,
	machineAddr string,
) *Service {
	s := &Service{
		store:      store,
		aliasStore: aliasStore,
		ssh:        ssh,

		activeClients: syncmap.Map[string, *ActiveHost]{},
	}
	s.initLocalDocker(composeRoot, machineAddr)
	s.LoadAll()

	return s
}

// RootAlias default file location alias for compose root
const RootAlias = "compose"
const LocalDocker = "local"

func (s *Service) initLocalDocker(composeRoot string, localAddr string) {
	conf, err := s.store.Get(LocalDocker)

	// Case 1: Create new if it doesn't exist
	if err != nil {
		log.Debug().Err(err).Msg("local Docker does not exist, setting up")
		conf = Config{
			Name: LocalDocker, Type: LOCAL, Enable: true, MachineAddr: localAddr,
			FolderAliases: []FolderAlias{{Alias: RootAlias, Fullpath: composeRoot}},
		}

		if err = s.store.Add(&conf); err != nil {
			log.Fatal().Err(err).Msg("failed to add local Docker config")
		}
		return
	}

	// Case 2: Update existing
	// Handle Alias Upsert (Add or Edit)
	var alias FolderAlias
	if alias, err = s.aliasStore.Get(conf.ID, RootAlias); err != nil {
		err = s.aliasStore.AddAlias(conf.ID, RootAlias, composeRoot)
	} else {
		alias.Fullpath = composeRoot
		err = s.aliasStore.EditAlias(conf.ID, alias.ID, &alias)
	}
	if err != nil {
		log.Warn().Err(err).Msg("failed to update alias")
	}

	// Update Main Config
	conf.MachineAddr = localAddr
	conf.FolderAliases = nil
	if err = s.store.Update(&conf); err != nil {
		log.Fatal().Err(err).Msg("failed to update config")
	}
}

func (s *Service) ListEnabled() ([]Config, error) {
	return s.store.ListEnabled()
}

func (s *Service) ListAll() ([]Config, error) {
	return s.store.List()
}

func (s *Service) ListConnected() []string {
	var names []string

	s.activeClients.Range(func(key string, value *ActiveHost) bool {
		names = append(names, key)
		return true
	})

	return names
}

func (s *Service) GetAlias(host, alias string) (filesystem.FileSystem, error) {
	val, ok := s.activeClients.Load(host)
	if !ok {
		return nil, fmt.Errorf("host %s is not found in connected clients", host)
	}
	return val.As.LoadAlias(alias)
}

func (s *Service) GetDockerService(name string) (*docker.Service, error) {
	// todo to add direct links to services
	//composeRoot := srv.composeRoot()
	//if name != container.LocalClient {
	//	composeRoot = filepath.Join(composeRoot, git.DockmanRemoteFolder, name)
	//}
	//log.Debug().Str("host", name).Str("composeRoot", composeRoot).Msg("compose root for client")

	val, ok := s.activeClients.Load(name)
	if !ok {
		return nil, fmt.Errorf("host %s is not found in connected clients", name)
	}

	var localAddr string
	if val.Kind == LOCAL {
		// todo load val.Addr for ssh as well
		localAddr = val.Addr
	} else {
		localAddr = val.DockerClient.DaemonHost()
	}

	service := docker.NewService(
		name,
		localAddr,
		val.DockerClient,
		val.SSHClient,
		func(filename string, host string) (compose.Host, error) {
			strings.Split(filename, "/")
			filename, pathAlias, err := fUtil.ExtractMeta(filename)
			if err != nil {
				return compose.Host{}, err
			}

			fs, err := val.As.LoadAlias(pathAlias)
			if err != nil {
				return compose.Host{}, err
			}

			return compose.Host{
				Fs:      fs,
				Relpath: filename,
			}, nil
		},
	)

	return service, nil
}

type BrowseItem struct {
	name string
	dir  bool
}

func (s *Service) Browse(host string, dir string) ([]BrowseItem, error) {
	val, ok := s.activeClients.Load(host)
	if !ok {
		return nil, fmt.Errorf("host not found in connected clients")
	}

	fs, err := val.As.LoadDirect("/")
	if err != nil {
		return nil, err
	}

	dir, err = fs.Abs(dir)
	if err != nil {
		return nil, err
	}

	readDir, err := fs.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	results := listutils.ToMap(readDir, func(t fs2.DirEntry) BrowseItem {
		return BrowseItem{
			name: fs.Join(dir, t.Name()),
			dir:  t.IsDir(),
		}
	})

	slices.SortFunc(results, func(e1, e2 BrowseItem) int {
		// Directories come before files
		if e1.dir && !e2.dir {
			return -1 // e1 (dir) comes before e2 (file)
		}
		if !e1.dir && e2.dir {
			return 1 // e2 (dir) comes before e1 (file)
		}
		// Both are same type (both dirs or both files), sort alphabetically
		return strings.Compare(e1.name, e2.name)
	})

	return results, nil
}

func (s *Service) Toggle(hostname string, enabled bool) error {
	conf, err := s.store.Get(hostname)
	if err != nil {
		return err
	}

	if conf.Enable == enabled {
		return nil
	}

	conf.Enable = enabled
	err = s.store.Update(&conf)
	if err != nil {
		return fmt.Errorf("unable to update config: %v", err)
	}

	if !enabled {
		val, ok := s.activeClients.LoadAndDelete(hostname)
		if ok {
			fileutil.Close(val)
		}
	}

	return s.Add(&conf, false)
}

func (s *Service) LoadAll() {
	all, err := s.ListEnabled()
	if err != nil {
		log.Error().Err(err).Msg("unable to load hosts")
		return
	}

	wg := new(sync.WaitGroup)

	for _, host := range all {
		wg.Go(func() {
			err2 := s.Add(&host, false)
			if err2 != nil {
				log.Error().
					Err(err2).Str("name", host.Name).
					Msg("Failed to load host")
			}
		})
	}

	wg.Wait()

	log.Info().Strs("clients", s.activeClients.Keys()).Msg("loaded hosts")
}

func (s *Service) Add(config *Config, create bool) (err error) {
	ah, err := s.loadHost(config, create)
	if err != nil {
		return err
	}

	defer func() {
		fileutil.CloseIfErr(err, &ah)
	}()

	// before adding check if all connections are working
	if create {
		err = s.store.Add(config)
		if err != nil {
			return fmt.Errorf("failed to add config to db: %w", err)
		}
	}

	if !config.Enable {
		fileutil.Close(&ah)
		return nil
	}

	fsFactory, err := loadFSFactory(config, ah)
	if err != nil {
		return err
	}

	ah.Kind = config.Type
	ah.Addr = config.MachineAddr
	ah.As = NewAliasService(s.aliasStore, config.ID, fsFactory)

	val, ok := s.activeClients.LoadAndDelete(config.Name)
	if ok {
		fileutil.Close(val)
	}

	s.activeClients.Store(
		config.Name,
		&ah,
	)

	return err
}

// fSFactoryFactory lmao
func loadFSFactory(config *Config, ah ActiveHost) (FSFactory, error) {
	switch config.Type {
	case LOCAL:
		return func(root string) filesystem.FileSystem {
			return filesystem.NewLocal(root)
		}, nil
	case SSH:
		return func(root string) filesystem.FileSystem {
			return filesystem.NewSftp(ah.SFTPClient, root)
		}, nil
	default:
		return nil, fmt.Errorf("could not load filesystem unknown host type: %s", config.Type)
	}
}

func (s *Service) loadHost(config *Config, create bool) (ah ActiveHost, err error) {
	defer func() {
		// remove any initialized clients if err
		fileutil.CloseIfErr(err, &ah)
	}()

	err = s.loadSSH(config, &ah, create)
	if err != nil {
		return ActiveHost{}, err
	}

	err = s.loadDocker(config, &ah)
	if err != nil {
		return ActiveHost{}, err
	}

	return ah, nil
}

// creates and loads an ssh client, if Config.Type == SSH
func (s *Service) loadSSH(config *Config, activeHost *ActiveHost, create bool) error {
	if config.Type != SSH {
		return nil
	}
	if config.SSHOptions == nil {
		return fmt.Errorf("ssh options is nil, check yourself before you wreck yourself")
	}

	sshCli, sftpCli, err := s.ssh.LoadClient(config.SSHOptions, create)
	if err != nil {
		return err
	}

	activeHost.SSHClient = sshCli
	activeHost.SFTPClient = sftpCli
	config.SSHID = config.ID

	return nil
}

func (s *Service) loadDocker(config *Config, active *ActiveHost) (err error) {
	var dkCli *client.Client
	switch config.Type {
	case SSH:
		dkCli, err = newDockerSSHClient(active.SSHClient)
		break
	case LOCAL:
		dkCli, err = NewDockerLocalClient()
	default:
		return fmt.Errorf("unsupported docker client type: %s", config.Type)
	}
	if err != nil {
		return err
	}

	connection, err := testDockerConnection(dkCli)
	if err != nil {
		return fmt.Errorf("unable to test docker connection: %w", err)
	}

	log.Info().
		Str("name", connection.Name).
		Str("Kernel", connection.KernelVersion).
		Msg("Connected to client")

	active.DockerClient = dkCli

	return nil
}

func (s *Service) Delete(hostname string) error {
	config, err := s.store.Get(hostname)
	if err != nil {
		return err
	}

	val, ok := s.activeClients.LoadAndDelete(config.Name)
	if ok {
		fileutil.Close(val)
	}

	if config.Type == SSH {
		err := s.ssh.Delete(config.SSHOptions)
		if err != nil {
			return err
		}
	}

	return s.store.Delete(&config)
}

func (s *Service) Edit(config *Config) error {
	// do not update aliases we do that separately
	config.FolderAliases = nil
	return s.store.Update(config)
}

// GetSSH will return nil,nil for ActiveHost.Kind != SSH
func (s *Service) GetSSH(host string) (*ssh2.Client, error) {
	val, ok := s.activeClients.Load(host)
	if !ok {
		return nil, fmt.Errorf("no active client for host %s", host)
	}

	return val.SSHClient, nil
}

func (s *Service) ListAliases(host string) ([]FolderAlias, error) {
	get, err := s.store.Get(host)
	if err != nil {
		return nil, fmt.Errorf("failed to load host '%s': %w", host, err)
	}
	return s.aliasStore.List(get.ID)
}

func (s *Service) getHostID(name string) (uint, error) {
	get, err := s.store.Get(name)
	if err != nil {
		return 0, err
	}

	return get.ID, nil
}
