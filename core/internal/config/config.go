package config

import (
	"context"
	"fmt"
	"io/fs"
	"strings"

	"github.com/RA341/dockman/internal/auth"
	"github.com/RA341/dockman/internal/viewer"
)

const EnvPrefix = "DOCKMAN"

// AppConfig tags are parsed by processStruct
type AppConfig struct {
	Port           int    `config:"flag=port,env=PORT,default=8866,usage=Port to run the server on"`
	AllowedOrigins string `config:"flag=origins,env=ORIGINS,default=*,usage=Allowed origins for the API (in CSV)"`
	UIPath         string `config:"flag=ui,env=UI_PATH,default=dist,usage=Path to frontend files"`
	LocalAddr      string `config:"flag=ma,env=MACHINE_ADDR,default=0.0.0.0,usage=Local machine IP address"`
	ComposeRoot    string `config:"flag=cr,env=COMPOSE_ROOT,default=/compose,usage=Root directory for compose files"`
	ConfigDir      string `config:"flag=conf,env=CONFIG,default=/config,usage=Directory to store dockman config"`

	Auth   auth.Config   `config:""` // empty tag to indicate to parse struct
	Log    Logger        `config:""`
	Viewer viewer.Config `config:""`

	UIFS          fs.FS
	ServerContext context.Context
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

type FilePerms struct {
	PUID int `config:"flag=puid,env=PUID,default=0,usage=PUID for composeRoot"`
	GID  int `config:"flag=gid,env=GID,default=0,usage=GID for composeRoot"`
}

type UpdaterConfig struct {
	Addr string `config:"flag=upAddr,env=UPDATER_HOST,default=http://updater:8869,usage=URL for dockman updater eg: http://localhost:8869"`
}

type Logger struct {
	Level       string `config:"flag=logLevel,env=LOG_LEVEL,default=info,usage=disabled|debug|info|warn|error|fatal"`
	Verbose     bool   `config:"flag=logVerbose,env=LOG_VERBOSE,default=false,usage=show more info in logs"`
	HttpLogger  bool   `config:"flag=logHttp,env=LOG_HTTP,default=false,usage=enable printing of http routes logs"`
	AuthWarning bool   `config:"flag=logAuthWarn,env=LOG_AUTH_WARNING,default=true,usage=display auth warning at app startup"`
}
