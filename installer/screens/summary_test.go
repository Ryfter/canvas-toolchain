package screens

import (
	"strings"
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestBuildSnippet_ReflectsInstallDir(t *testing.T) {
	st := NewState("v0.9.1")
	st.InstallDir = "/opt/canvas-toolchain"
	s := buildSnippet(st)
	if !strings.Contains(s, "/opt/canvas-toolchain") {
		t.Errorf("snippet missing install dir: %s", s)
	}
	if !strings.Contains(s, "command-and-control/dist/index.js") {
		t.Errorf("snippet missing C&C entry: %s", s)
	}
}

func TestNewSummaryScreen_RendersWithoutPanic(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	w := a.NewWindow("test")
	defer w.Close()

	st := NewState("v0.9.1")
	st.InstallDir = t.TempDir()
	st.InstalledClaudeDesktop = true
	if NewSummaryScreen(w, st, func() {}) == nil {
		t.Fatal("nil content")
	}
}
