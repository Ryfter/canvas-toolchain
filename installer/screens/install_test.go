package screens

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestNewInstallScreen_RendersWithoutPanic(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	w := a.NewWindow("test")
	defer w.Close()

	st := NewState("v0.9.1")
	st.InstallDir = t.TempDir()
	content := NewInstallScreen(w, st, func() {}, func() {})
	if content == nil {
		t.Fatal("expected non-nil content")
	}
}

func TestWriteSelectedHosts_WritesOnlySelectedDetected(t *testing.T) {
	home := t.TempDir()
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", home)
		t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	} else {
		t.Setenv("HOME", home)
	}
	// Detect two hosts; select only one.
	_ = os.MkdirAll(filepath.Join(home, ".cursor"), 0o755)
	_ = os.MkdirAll(filepath.Join(home, ".codex"), 0o755)

	st := NewState("1.0.0")
	st.ConnectHosts = map[string]bool{"cursor": true, "codex": false}
	st.WiredHosts = map[string]bool{}

	if err := writeSelectedHosts(st, "/node", "/app/index.js"); err != nil {
		t.Fatal(err)
	}
	if !st.WiredHosts["cursor"] {
		t.Error("expected cursor wired")
	}
	if st.WiredHosts["codex"] {
		t.Error("codex was unselected; should not be wired")
	}
	if _, err := os.Stat(filepath.Join(home, ".cursor", "mcp.json")); err != nil {
		t.Error("expected cursor mcp.json written")
	}
}
