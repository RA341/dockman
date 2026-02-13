package cleaner

import (
	"time"

	v1 "github.com/RA341/dockman/generated/cleaner/v1"
)

func (pc *PruneConfig) ToProto() *v1.PruneConfig {
	return &v1.PruneConfig{
		Enabled:         pc.Enabled,
		IntervalInHours: uint32(pc.Interval.Hours()),
		Volumes:         pc.Volumes,
		Networks:        pc.Networks,
		Images:          pc.Images,
		Containers:      pc.Containers,
		BuildCache:      pc.BuildCache,
	}
}

func (pc *PruneConfig) FromProto(rpcConf *v1.PruneConfig) {
	pc.Enabled = rpcConf.Enabled
	pc.Interval = time.Duration(rpcConf.IntervalInHours) * time.Hour
	pc.Volumes = rpcConf.Volumes
	pc.Networks = rpcConf.Networks
	pc.Images = rpcConf.Images
	pc.Containers = rpcConf.Containers
	pc.BuildCache = rpcConf.BuildCache
}
