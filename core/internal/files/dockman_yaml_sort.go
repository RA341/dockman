package files

import (
	"path/filepath"
	"strings"
)

func (d *DockmanYaml) sortFiles(a, b *Entry) int {
	ra := d.getSortRank(a)
	rb := d.getSortRank(b)

	if ra < rb {
		return -1
	}
	if ra > rb {
		return 1
	}
	return strings.Compare(a.fullpath, b.fullpath)
}

// getSortRank determines priority: dotfiles, directories, then files by getFileSortRank
func (d *DockmanYaml) getSortRank(entry *Entry) int {
	base := filepath.Base(entry.fullpath)
	// -1: pinned files (highest priority)
	if priority, ok := d.PinnedFiles[base]; ok {
		// potential bug, but if someone is manually writing the order of 100000 files i say get a life
		// -999 > -12 in this context, pretty stupid but i cant be bothered to fix this mathematically
		return priority - 100_000
	}

	// 0: dotfiles (highest priority)
	if strings.HasPrefix(base, ".") {
		return 1
	}

	// Check if it's a directory (has subfiles)
	if entry.isDir {
		return 2
	}

	// 2+: normal files, ranked by getFileSortRank
	return 3 + d.getFileSortRank(entry.fullpath)
}

// getFileSortRank assigns priority within normal files
func (d *DockmanYaml) getFileSortRank(filename string) int {
	base := filepath.Base(filename)
	// Priority 0: docker-compose files
	if strings.HasSuffix(base, "compose.yaml") || strings.HasSuffix(base, "compose.yml") {
		return 0
	}
	// Priority 1: other yaml/yml
	if strings.HasSuffix(base, ".yaml") || strings.HasSuffix(base, ".yml") {
		return 1
	}
	// Priority 2: everything else
	return 2
}
