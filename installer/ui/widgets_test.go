package ui

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

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
