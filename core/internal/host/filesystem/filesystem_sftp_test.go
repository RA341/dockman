package filesystem

import "testing"

func TestRemotePathWithinUsesDirectoryBoundaries(t *testing.T) {
	tests := []struct {
		root      string
		candidate string
		want      bool
	}{
		{"/compose", "/compose", true},
		{"/compose", "/compose/stack/compose.yml", true},
		{"/compose", "/compose-secret/file", false},
		{"/compose", "/etc/passwd", false},
		{"/", "/etc/passwd", true},
	}
	for _, test := range tests {
		if got := remotePathWithin(test.root, test.candidate); got != test.want {
			t.Errorf("remotePathWithin(%q, %q) = %v, want %v", test.root, test.candidate, got, test.want)
		}
	}
}
