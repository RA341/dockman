package memlimit

import (
	"os"
	"path/filepath"
	"runtime/debug"
	"testing"
)

func TestParseLimitFile(t *testing.T) {
	dir := t.TempDir()

	write := func(name, content string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
		return p
	}

	tests := []struct {
		name    string
		content string
		want    int64
		wantOK  bool
	}{
		{"finite", "536870912\n", 536870912, true},
		{"v2 max", "max\n", 0, false},
		{"empty", "  \n", 0, false},
		{"zero", "0", 0, false},
		{"negative", "-1", 0, false},
		{"v1 unlimited sentinel", "9223372036854771712", 0, false},
		{"garbage", "not-a-number", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := parseLimitFile(write(tt.name, tt.content))
			if ok != tt.wantOK || got != tt.want {
				t.Fatalf("parseLimitFile(%q) = (%d, %v), want (%d, %v)",
					tt.content, got, ok, tt.want, tt.wantOK)
			}
		})
	}

	if _, ok := parseLimitFile(filepath.Join(dir, "does-not-exist")); ok {
		t.Fatalf("parseLimitFile(missing) returned ok=true")
	}
}

func TestConfigureAppliesRatio(t *testing.T) {
	// restore the process-wide limit after the test
	prev := debug.SetMemoryLimit(-1)
	defer debug.SetMemoryLimit(prev)

	const cgroupLimit = int64(1000)
	got := configure(0.9, func() (int64, bool) { return cgroupLimit, true })

	if want := int64(900); got != want {
		t.Fatalf("configure applied %d, want %d", got, want)
	}
	if applied := debug.SetMemoryLimit(-1); applied != 900 {
		t.Fatalf("runtime soft limit = %d, want 900", applied)
	}
}

func TestConfigureNoLimitIsNoop(t *testing.T) {
	prev := debug.SetMemoryLimit(-1)
	defer debug.SetMemoryLimit(prev)

	if got := configure(0.9, func() (int64, bool) { return 0, false }); got != 0 {
		t.Fatalf("configure with no cgroup limit = %d, want 0", got)
	}
	if applied := debug.SetMemoryLimit(-1); applied != prev {
		t.Fatalf("no-op configure changed the soft limit: got %d, want %d", applied, prev)
	}
}

func TestConfigureRespectsEnv(t *testing.T) {
	t.Setenv("GOMEMLIMIT", "512MiB")

	called := false
	got := configure(0.9, func() (int64, bool) { called = true; return 1 << 30, true })

	if got != 0 {
		t.Fatalf("configure with GOMEMLIMIT set = %d, want 0", got)
	}
	if called {
		t.Fatalf("configure read the cgroup despite GOMEMLIMIT being set")
	}
}
