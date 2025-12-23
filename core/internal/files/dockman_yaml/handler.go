package dockman_yaml

import v1 "github.com/RA341/dockman/generated/files/v1"

func (d *DockmanYaml) ToProto() *v1.DockmanYaml {
	return &v1.DockmanYaml{
		CustomTools:                d.CustomTools,
		DisableComposeQuickActions: d.DisableComposeQuickActions,
		UseComposeFolders:          d.UseComposeFolders,
		SearchLimit:                int32(d.SearchLimit),
		VolumesPage:                d.VolumesPage.toProto(),
		TabLimit:                   d.TabLimit,
		NetworkPage:                d.NetworkPage.toProto(),
		ImagePage:                  d.ImagePage.toProto(),
		ContainerPage:              d.ContainerPage.toProto(),
	}
}

func (s Sort) toProto() *v1.Sort {
	return &v1.Sort{
		SortOrder: s.Order,
		SortField: s.Field,
	}
}

func (v ContainerConfig) toProto() *v1.ContainerConfig {
	return &v1.ContainerConfig{
		Sort: v.Sort.toProto(),
	}
}

func (v VolumesConfig) toProto() *v1.VolumesConfig {
	return &v1.VolumesConfig{
		Sort: v.Sort.toProto(),
	}
}

func (n NetworkConfig) toProto() *v1.NetworkConfig {
	return &v1.NetworkConfig{
		Sort: n.Sort.toProto(),
	}
}

func (i ImageConfig) toProto() *v1.ImageConfig {
	return &v1.ImageConfig{
		Sort: i.Sort.toProto(),
	}
}
