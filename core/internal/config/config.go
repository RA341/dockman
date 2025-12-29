package config

import (
	"fmt"
	"io/fs"
	"strings"
	"time"

	"github.com/RA341/dockman/internal/viewer"
	"github.com/RA341/dockman/pkg/fileutil"
)

const EnvPrefix = "DOCKMAN"

// AppConfig tags are parsed by processStruct
type AppConfig struct {
	Port           int           `config:"flag=port,env=PORT,default=8866,usage=Port to run the server on"`
	AllowedOrigins string        `config:"flag=origins,env=ORIGINS,default=*,usage=Allowed origins for the API (in CSV)"`
	UIPath         string        `config:"flag=ui,env=UI_PATH,default=dist,usage=Path to frontend files"`
	LocalAddr      string        `config:"flag=ma,env=MACHINE_ADDR,default=0.0.0.0,usage=Local machine IP address"`
	ComposeRoot    string        `config:"flag=cr,env=COMPOSE_ROOT,default=/compose,usage=Root directory for compose files"`
	ConfigDir      string        `config:"flag=conf,env=CONFIG,default=/config,usage=Directory to store dockman config"`
	DockYaml       string        `config:"flag=dy,env=DOCK_YAML,default=,usage=Custom path for the .dockman.yml file"`
	Perms          FilePerms     `config:""` // indicate to parse struct
	Auth           Auth          `config:""`
	Updater        UpdaterConfig `config:""`
	Log            Logger        `config:""`
	Viewer         viewer.Config `config:""`
	UIFS           fs.FS         // UIFS has no 'config' tag, so it will be ignored
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

type Auth struct {
	Enable       bool   `config:"flag=auth,env=AUTH_ENABLE,default=false,usage=Enable authentication"`
	Username     string `config:"flag=au,env=AUTH_USERNAME,default=admin,usage=authentication username"`
	Password     string `config:"flag=ap,env=AUTH_PASSWORD,default=admin99988,usage=authentication password,hide=true"`
	CookieExpiry string `config:"flag=ae,env=AUTH_EXPIRY,default=24h,usage=Set cookie expiry-300ms/1.5h/2h45m [ns|us|ms|s|m|h]"`
	MaxSessions  int    `config:"flag=mxs,env=AUTH_MAX_SESSIONS,default=5,usage=Set max active sessions per user"`

	EnableOidc       bool   `config:"flag=eoc,env=AUTH_OIDC_ENABLE,default=false,usage=enable OIDC support"`
	OIDCIssuerURL    string `config:"flag=oiu,env=AUTH_OIDC_ISSUER,default=,usage=url for your oidc issuer"`
	OIDCClientID     string `config:"flag=oicd,env=AUTH_OIDC_CLIENT_ID,default=,usage=client id for OIDC,hide=true"`
	OIDCClientSecret string `config:"flag=oics,env=AUTH_OIDC_CLIENT_SECRET,default=,usage=client secret for OIDC,hide=true"`
	OIDCRedirectURL  string `config:"flag=oiurl,env=AUTH_OIDC_REDIRECT_URL,default=,usage=redirect url for OIDC"`
}

const defaultCookieExpiry = time.Hour * 24

func (d *Auth) GetCookieExpiry() time.Duration {
	return fileutil.GetDurOrDefault(d.CookieExpiry, defaultCookieExpiry)
}

type UpdaterConfig struct {
	Addr string `config:"flag=upAddr,env=UPDATER_HOST,default=http://updater:8869,usage=URL for dockman updater eg: http://localhost:8869"`
}

type Logger struct {
	Level      string `config:"flag=logLevel,env=LOG_LEVEL,default=info,usage=disabled|debug|info|warn|error|fatal"`
	Verbose    bool   `config:"flag=logVerbose,env=LOG_VERBOSE,default=false,usage=show more info in logs"`
	HttpLogger bool   `config:"flag=logHttp,env=LOG_HTTP,default=false,usage=enable printing of http routes logs"`
}
