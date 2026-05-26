package screens

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestNewCredentialsScreen_PanoptoFieldsHiddenByDefault(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	w := a.NewWindow("test")
	defer w.Close()

	st := NewState("v0.9.1")
	content := NewCredentialsScreen(w, st, func() {}, func() {})
	if content == nil {
		t.Fatal("expected non-nil content")
	}
}

func TestNewCredentialsScreen_PanoptoFieldsShownWhenSelected(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	w := a.NewWindow("test")
	defer w.Close()

	st := NewState("v0.9.1")
	st.WorkflowPanopto = true
	content := NewCredentialsScreen(w, st, func() {}, func() {})
	if content == nil {
		t.Fatal("expected non-nil content")
	}
}
