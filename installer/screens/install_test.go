package screens

import (
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
