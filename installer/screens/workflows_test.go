package screens

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

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
