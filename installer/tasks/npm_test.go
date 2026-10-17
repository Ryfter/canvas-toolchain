package tasks

import (
	"runtime"
	"strings"
	"testing"
)

func TestResolveNodePaths_Unix(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix only")
	}
	p := ResolveNodePaths("/opt/canvas")
	if !strings.HasSuffix(p.Node, "/.node/bin/node") {
		t.Errorf("unexpected node path: %s", p.Node)
	}
	if !strings.HasSuffix(p.NPM, "/.node/lib/node_modules/npm/bin/npm-cli.js") {
		t.Errorf("unexpected npm path: %s", p.NPM)
	}
}

func TestResolveNodePaths_Windows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows only")
	}
	p := ResolveNodePaths(`C:\canvas`)
	if !strings.HasSuffix(p.Node, `\.node\node.exe`) {
		t.Errorf("unexpected node path: %s", p.Node)
	}
}

// The bundled Node layout differs by OS — Windows unpacks node.exe directly
// under <InstallDir>/.node, other platforms under .node/bin. The OS is a
// parameter so both layouts are checked on every host, and ResolveNodePaths and
// the summary's manual snippet both go through this one function so they cannot
// drift apart.
func TestNodeBinaryPath_PerGOOS(t *testing.T) {
	cases := []struct {
		goos       string
		installDir string
		want       string
	}{
		{"windows", `C:\Users\prof\canvas-toolchain`, `C:\Users\prof\canvas-toolchain\.node\node.exe`},
		{"darwin", "/Users/prof/canvas-toolchain", "/Users/prof/canvas-toolchain/.node/bin/node"},
		{"linux", "/opt/canvas-toolchain", "/opt/canvas-toolchain/.node/bin/node"},
	}
	for _, tc := range cases {
		t.Run(tc.goos, func(t *testing.T) {
			if got := NodeBinaryPath(tc.installDir, tc.goos); got != tc.want {
				t.Errorf("NodeBinaryPath(%q, %q) = %q, want %q", tc.installDir, tc.goos, got, tc.want)
			}
		})
	}
}
