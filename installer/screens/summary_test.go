package screens

import (
	"strings"
	"testing"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/test"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/ui"
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
	st.WiredHosts = map[string]bool{"claude-desktop": true}
	if NewSummaryScreen(w, st, func() {}) == nil {
		t.Fatal("nil content")
	}
}

func TestSummaryScreen_ListsWiredHosts(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()
	w := app.NewWindow("")
	st := NewState("1.0.0")
	st.WiredHosts = map[string]bool{"codex": true, "cursor": true}

	screen := NewSummaryScreen(w, st, func() {})
	if screen == nil {
		t.Fatal("expected non-nil summary screen")
	}
	labels := dumpLabels(screen)
	if !strings.Contains(labels, "Codex CLI") {
		t.Errorf("expected 'Codex CLI' in summary, got: %s", labels)
	}
	if !strings.Contains(labels, "Cursor") {
		t.Errorf("expected 'Cursor' in summary, got: %s", labels)
	}
}

// When Claude Desktop was not wired, the summary must not show a Launch button.
// Other hosts alone (e.g. Codex) are not enough — the button is Claude-Desktop-specific.
func TestSummaryScreen_NoLaunchButtonWhenClaudeDesktopNotWired(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()
	w := app.NewWindow("test")
	defer w.Close()

	st := NewState("1.0.0")
	st.InstallDir = t.TempDir()
	st.WiredHosts = map[string]bool{"codex": true, "cursor": true} // no claude-desktop

	screen := NewSummaryScreen(w, st, func() {})
	if screen == nil {
		t.Fatal("expected non-nil summary screen")
	}
	buttons := dumpButtonTexts(screen)
	if strings.Contains(buttons, "Launch") {
		t.Errorf("expected no Launch button when claude-desktop not wired, got buttons:\n%s", buttons)
	}
	if !strings.Contains(buttons, "Done") {
		t.Errorf("expected Done button to still be present, got buttons:\n%s", buttons)
	}
}

// dumpLabels walks the widget tree collecting label text.
// StatusRow is a custom widget whose label lives inside its renderer, so we
// recurse into CreateRenderer().Objects() to find it.
func dumpLabels(obj fyne.CanvasObject) string {
	var sb strings.Builder
	var walk func(o fyne.CanvasObject)
	walk = func(o fyne.CanvasObject) {
		switch v := o.(type) {
		case *widget.Label:
			sb.WriteString(v.Text + "\n")
		case *ui.StatusRow:
			for _, c := range v.CreateRenderer().Objects() {
				walk(c)
			}
		case *fyne.Container:
			for _, c := range v.Objects {
				walk(c)
			}
		}
	}
	walk(obj)
	return sb.String()
}

// dumpButtonTexts walks the widget tree collecting HoverButton label text.
// HoverButton stores its caption on a canvas.Text inside CreateRenderer().
func dumpButtonTexts(obj fyne.CanvasObject) string {
	var sb strings.Builder
	var walk func(o fyne.CanvasObject)
	walk = func(o fyne.CanvasObject) {
		switch v := o.(type) {
		case *ui.HoverButton:
			for _, c := range v.CreateRenderer().Objects() {
				if t, ok := c.(*canvas.Text); ok {
					sb.WriteString(t.Text + "\n")
				}
			}
		case *fyne.Container:
			for _, c := range v.Objects {
				walk(c)
			}
		}
	}
	walk(obj)
	return sb.String()
}
