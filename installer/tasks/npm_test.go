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
