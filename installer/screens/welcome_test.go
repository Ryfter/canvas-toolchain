package screens

import (
	"os"
	"path/filepath"
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestDetectMode_FreshWhenMarkerMissing(t *testing.T) {
	dir := t.TempDir()
	if got := detectMode(dir); got != ModeFresh {
		t.Errorf("expected ModeFresh, got %v", got)
	}
}

func TestDetectMode_UpdateWhenMarkerPresent(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".canvas-toolchain-version"), []byte("0.9.1"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := detectMode(dir); got != ModeUpdate {
		t.Errorf("expected ModeUpdate, got %v", got)
	}
}

func TestNewWelcomeScreen_RendersWithoutPanic(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	w := a.NewWindow("test")
	defer w.Close()

	st := NewState("v0.9.1")
	st.InstallDir = t.TempDir()
	called := false
	content := NewWelcomeScreen(w, st, func() { called = true })
	if content == nil {
		t.Fatal("expected non-nil content")
	}
	_ = called
}
