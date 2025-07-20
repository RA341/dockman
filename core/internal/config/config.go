package config

import (
	"flag"
	"fmt"
	"github.com/RA341/dockman/pkg"
	"github.com/RA341/dockman/pkg/args"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"strings"
)

const EnvPrefix = "DOCKMAN"

var C *AppConfig

// AppConfig tags are parsed by processStruct
type AppConfig struct {
	Port           int           `config:"flag=port,env=PORT,default=8866,usage=Port to run the server on"`
	AllowedOrigins string        `config:"flag=origins,env=ORIGINS,default=*,usage=Allowed origins for the API (in CSV)"`
	UIPath         string        `config:"flag=ui,env=UI_PATH,default=dist,usage=Path to frontend files"`
	LocalAddr      string        `config:"flag=ma,env=MACHINE_ADDR,default=0.0.0.0,usage=Local machine IP address"`
	ComposeRoot    string        `config:"flag=cr,env=COMPOSE_ROOT,default=/compose,usage=Root directory for compose files"`
	ConfigDir      string        `config:"flag=conf,env=CONFIG,default=/config,usage=Directory to store dockman config"`
	Auth           AuthConfig    `config:""` // indicate to parse struct
	Updater        UpdaterConfig `config:""`
	Log            Logger        `config:""`
	UIFS           fs.FS         // UIFS has no 'config' tag, so it will be ignored
}

type AuthConfig struct {
	Enable   bool   `config:"flag=auth,env=AUTH_ENABLE,default=false,usage=Enable authentication"`
	Username string `config:"flag=au,env=AUTH_USERNAME,default=admin,usage=authentication username"`
	Password string `config:"flag=ap,env=AUTH_PASSWORD,default=admin99988,usage=authentication password,hide=true"`
}

type UpdaterConfig struct {
	Addr             string `config:"flag=upAddr,env=UPDATER_HOST,default=updater:8869,usage=Host address for dockman updater, eg: http://localhost:8869"`
	PassKey          string `config:"flag=upAuth,env=UPDATER_KEY,default=,usage=Authentication key for dockman updater"`
	DockmanImageBase string `config:"flag=dib,env=IMAGE_BASE,default=ghcr.io/ra341/dockman,usage=Base image to monitor and update containers running this image"`
}

type Logger struct {
	Level   string `config:"flag=logLevel,env=LOG_LEVEL,default=info,usage=disabled|debug|info|warn|error|fatal"`
	Verbose bool   `config:"flag=logVerbose,env=LOG_VERBOSE,default=false,usage=show more info in logs"`
}

func (c *AppConfig) GetAllowedOrigins() []string {
	elems := strings.Split(c.AllowedOrigins, ",")
	for i := range elems {
		elems[i] = strings.TrimSpace(elems[i])
	}
	return elems
}

func (c *AppConfig) GetDockmanWithMachineUrl() string {
	return fmt.Sprintf("http://%s:%d", c.LocalAddr, c.Port)
}

// LoadConfig sets global app config
func LoadConfig(opts ...ServerOpt) error {
	config, err := load()
	if err != nil {
		return err
	}

	for _, o := range opts {
		o(config)
	}
	defaultIfNotSet(config)

	// set global app config
	C = config

	args.PrettyPrint(config, EnvPrefix)
	return nil
}

func load() (*AppConfig, error) {
	conf := &AppConfig{}
	if err := args.ParseStruct(conf, EnvPrefix); err != nil {
		return nil, err
	}
	flag.Parse()

	pathsToResolve := []*string{
		&conf.ConfigDir,
		&conf.ComposeRoot,
	}
	for _, p := range pathsToResolve {
		absPath, err := filepath.Abs(*p)
		if err != nil {
			return nil, fmt.Errorf("failed to get abs path for %s: %w", *p, err)
		}
		*p = absPath

		if err = os.MkdirAll(absPath, 0777); err != nil {
			return nil, err
		}
	}

	return conf, nil
}

// final checks
func defaultIfNotSet(config *AppConfig) {
	uiPath := config.UIPath
	if uiPath != "" {
		if file, err := WithUIFromFile(uiPath); err == nil {
			config.UIFS = file
		}
	}

	if len(strings.TrimSpace(config.AllowedOrigins)) == 0 {
		config.AllowedOrigins = "*" // allow all origins
	}

	if config.Port == 0 {
		config.Port = 8866
	}

	if config.LocalAddr == "0.0.0.0" {
		ip, err := getLocalIP()
		if err == nil {
			config.LocalAddr = ip
		}
	}
}

func getLocalIP() (string, error) {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "", err
	}
	defer pkg.CloseCloser(conn)

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String(), nil
}
