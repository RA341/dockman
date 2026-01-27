package viewer

import (
	"time"
)

type Session struct {
	host string
	addr string
}

type Config struct {
	//ContainerWait string `config:"flag=vcw,env=VIEWER_CONTAINER_TIMEOUT,default=5s,usage=time to wait for a viewer container to start"`
}

const defaultContainerWait = 5 * time.Second

//func (c Config) GetDur() time.Duration {
//	return fileutil.GetDurOrDefault(c.ContainerWait, defaultContainerWait)
//}
