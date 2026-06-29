package screens

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestWorkflowsScreen_PopulatesConnectHosts(t *testing.T) {
	home := t.TempDir()
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", home)
		t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	} else {
		t.Setenv("HOME", home)
	}
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}

	app := test.NewApp()
	defer app.Quit()
	w := app.NewWindow("")
	st := NewState("1.0.0")

	screen := NewWorkflowsScreen(w, st, func() {}, func() {})
	if screen == nil {
		t.Fatal("expected non-nil screen")
	}
	if !st.ConnectHosts["cursor"] {
		t.Errorf("expected cursor pre-selected from detection, got %v", st.ConnectHosts)
	}
}

func TestNewWorkflowsScreen_CheckboxMutatesState(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	w := a.NewWindow("test")
	defer w.Close()

	st := NewState("v0.9.1")
	NewWorkflowsScreen(w, st, func() {}, func() {})

	if !st.WorkflowCanvas {
		t.Error("WorkflowCanvas should default true after wiring")
	}
}
