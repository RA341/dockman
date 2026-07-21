package dockyaml

var defaultDockmanYaml = DockmanYaml{
	TabLimit:    5,
	SearchLimit: 10,
	VolumesPage: VolumesConfig{
		Sort: Sort{
			Field: "Volume Name",
			Order: "asc",
		},
	},
	NetworkPage: NetworkConfig{
		Sort: Sort{
			Field: "Network Name",
			Order: "asc",
		},
	},
	ImagePage: ImageConfig{
		Sort: Sort{
			Field: "Images",
			Order: "asc",
		},
	},
	ContainerPage: ContainerConfig{
		Sort: Sort{
			Field: "Name",
			Order: "asc",
		},
	},
	StatsPage: StatsConfig{
		Sort: Sort{
			Field: "Memory",
			Order: "desc",
		},
	},
	ComposePage: ComposeConfig{
		DefaultTab: "editor",
	},
	MonitorPage: MonitorConfig{
		StackRows: "full",
	},
	DefaultView: "files",
}

type DockmanYaml struct {
	// define a custom sort to pin certain files when displaying
	PinnedFiles map[string]int `yaml:"pinnedFiles"`

	// use compose folders https://dockman.radn.dev/docs/file-layout/customize#compose-folders
	UseComposeFolders bool `yaml:"useComposeFolders"`

	// disable shortcuts under compose files
	DisableComposeQuickActions bool `yaml:"disableComposeQuickActions"`

	// TabLimit in editor
	TabLimit int32 `yaml:"tabLimit"`

	// configure volumes page
	VolumesPage VolumesConfig `yaml:"volumes"`

	// configure network page
	NetworkPage NetworkConfig `yaml:"networks"`

	// configure image page
	ImagePage ImageConfig `yaml:"images"`

	ContainerPage ContainerConfig `yaml:"containers"`

	// configure the stats (system resources) page
	StatsPage StatsConfig `yaml:"stats"`

	// configure the compose stack view
	ComposePage ComposeConfig `yaml:"compose"`

	// configure the monitor view
	MonitorPage MonitorConfig `yaml:"monitor"`

	// view opened when landing on a host: files (default), monitor, stats,
	// containers, images, volumes, networks or cleaner
	DefaultView string `yaml:"defaultView"`

	// configure the file editor
	EditorPage EditorConfig `yaml:"editor"`

	// define a max search limit for files
	SearchLimit int `yaml:"searchLimit"`

	CustomTools map[string]string `yaml:"customTools"`
}

type VolumesConfig struct {
	Sort Sort `yaml:"sort"`
}

type ContainerConfig struct {
	Sort Sort `yaml:"sort"`
}

type NetworkConfig struct {
	Sort Sort `yaml:"sort"`
}

type ImageConfig struct {
	Sort Sort `yaml:"sort"`
}

type StatsConfig struct {
	Sort Sort `yaml:"sort"`
}

type ComposeConfig struct {
	// tab shown when opening a compose stack: editor (default), deploy or stats
	DefaultTab string `yaml:"defaultTab"`
}

type MonitorConfig struct {
	// stack row density in the monitor view: "full" (default) shows CPU/RAM
	// values with their charts, "compact" shows the values only
	StackRows string `yaml:"stackRows"`
}

type EditorConfig struct {
	// allow scrolling half a viewport past the last line (it stops at
	// mid-view), for files taller than the viewport
	ScrollPastEnd bool `yaml:"scrollPastEnd"`
}

type Sort struct {
	Order string `yaml:"order"`
	Field string `yaml:"field"`
}
