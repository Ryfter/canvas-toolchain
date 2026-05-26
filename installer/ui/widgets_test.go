package ui

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestMaskedEntry_StartsEmpty(t *testing.T) {
	e := NewMaskedEntry("API key")
	if got := e.Text; got != "" {
		t.Fatalf("expected empty text, got %q", got)
	}
	if !e.Password {
		t.Fatal("expected Password to be true")
	}
}

func TestStatusRow_TransitionsThroughStates(t *testing.T) {
	w := test.NewWindow(nil)
	defer w.Close()
	r := NewStatusRow("Disk space")
	w.SetContent(r)

	cases := []struct {
		s   RowStatus
		txt string
	}{
		{StatusPending, "…"},
		{StatusRunning, "▶"},
		{StatusOK, "✓"},
		{StatusWarn, "⚠"},
		{StatusError, "✗"},
	}
	for _, c := range cases {
		r.SetStatus(c.s, "")
		if r.icon.Text != c.txt {
			t.Errorf("status %v: expected icon %q, got %q", c.s, c.txt, r.icon.Text)
		}
	}
}

func TestHintedField_RendersWithHint(t *testing.T) {
	f := HintedField{
		Label: "Anthropic API key",
		Input: NewMaskedEntry("sk-ant-..."),
		Hint:  "From platform.anthropic.com",
	}
	obj := f.AsCanvasObject()
	if obj == nil {
		t.Fatal("expected non-nil canvas object")
	}
}
