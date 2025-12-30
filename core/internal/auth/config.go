package auth

import (
	"time"

	"github.com/RA341/dockman/pkg/fileutil"
)

type Config struct {
	Enable       bool   `config:"flag=auth,env=AUTH_ENABLE,default=false,usage=Enable authentication"`
	Username     string `config:"flag=au,env=AUTH_USERNAME,default=admin,usage=authentication username"`
	Password     string `config:"flag=ap,env=AUTH_PASSWORD,default=admin99988,usage=authentication password,hide=true"`
	CookieExpiry string `config:"flag=ae,env=AUTH_EXPIRY,default=24h,usage=Set cookie expiry-300ms/1.5h/2h45m [ns|us|ms|s|m|h]"`
	MaxSessions  int    `config:"flag=mxs,env=AUTH_MAX_SESSIONS,default=5,usage=Set max active sessions per user"`

	OIDCEnable       bool `config:"flag=eoc,env=AUTH_OIDC_ENABLE,default=false,usage=enable OIDC support"`
	OIDCAutoRedirect bool `config:"flag=ear,env=AUTH_OIDC_AUTO_REDIRECT,default=true,usage=automatically redirect to OIDC login"`

	OIDCIssuerURL    string `config:"flag=oiu,env=AUTH_OIDC_ISSUER,default=,usage=url for your oidc issuer"`
	OIDCClientID     string `config:"flag=oicd,env=AUTH_OIDC_CLIENT_ID,default=,usage=client id for OIDC,hide=true"`
	OIDCClientSecret string `config:"flag=oics,env=AUTH_OIDC_CLIENT_SECRET,default=,usage=client secret for OIDC,hide=true"`
	OIDCRedirectURL  string `config:"flag=oiurl,env=AUTH_OIDC_REDIRECT_URL,default=,usage=redirect url for OIDC"`
}

const defaultCookieExpiry = time.Hour * 24

func (d *Config) GetCookieExpiry() time.Duration {
	return fileutil.GetDurOrDefault(d.CookieExpiry, defaultCookieExpiry)
}
