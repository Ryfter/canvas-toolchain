package screens

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/test"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/tasks"
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
		case *container.Scroll:
			walk(v.Content)
		case *fyne.Container:
			for _, c := range v.Objects {
				walk(c)
			}
		}
	}
	walk(obj)
	return sb.String()
}

// doctorReport builds the shape `canvas-toolchain doctor --json` returns, so
// the screen renders a real document rather than a hand-shaped stub.
func doctorReport(status string, journeys tasks.ReadyJourneys, checks ...tasks.DoctorCheck) *tasks.DoctorReport {
	return &tasks.DoctorReport{
		OverallStatus: status,
		Journey:       "full",
		Checks:        checks,
		ReadyJourneys: journeys,
	}
}

func newSummaryState(t *testing.T, st *State) string {
	t.Helper()
	app := test.NewApp()
	defer app.Quit()
	w := app.NewWindow("test")
	defer w.Close()

	st.InstallDir = t.TempDir()
	screen := NewSummaryScreen(w, st, func() {})
	if screen == nil {
		t.Fatal("expected non-nil summary screen")
	}
	return dumpLabels(screen)
}

// The summary renders the doctor's own verdict — readiness per capability, then
// every warn/fail check with the operation that fixes it.
func TestSummaryScreen_RendersDoctorReadiness(t *testing.T) {
	st := NewState("2.3.0")
	st.Doctor = doctorReport("warn",
		tasks.ReadyJourneys{},
		tasks.DoctorCheck{ID: "runtime.courses_root", Status: "warn", Summary: "No courses root is configured.",
			Fix: &tasks.DoctorFix{Tool: "ct_setup", Action: "courses_root", Hint: "Point the toolchain at your course folders."}},
		tasks.DoctorCheck{ID: "llm.credentials", Status: "warn", Summary: "No LLM credentials are configured, so the AI-assisted tools are unavailable.",
			Fix: &tasks.DoctorFix{Tool: "ct_setup", Action: "anthropic", Hint: "Add an Anthropic API key."}},
		tasks.DoctorCheck{ID: "transcripts.source", Status: "ok", Summary: "No transcript source configured; enrichment defaults to panopto."},
	)

	labels := newSummaryState(t, st)

	for _, want := range []string{
		"Local authoring",
		"Canvas connected",
		"AI assisted",
		"not set up yet",
		"No courses root is configured.",
		"Fix: ct_setup courses_root",
		"No LLM credentials are configured",
		"Fix: ct_setup anthropic — Add an Anthropic API key.",
		`Next step: open your AI app and say "get started".`,
	} {
		if !strings.Contains(labels, want) {
			t.Errorf("summary is missing %q; got:\n%s", want, labels)
		}
	}
	// An ok check is background: it must not be listed as something to fix.
	if strings.Contains(labels, "defaults to panopto") {
		t.Errorf("ok checks must not be listed; got:\n%s", labels)
	}
}

func TestSummaryScreen_MarksAReadyInstall(t *testing.T) {
	st := NewState("2.3.0")
	st.Doctor = doctorReport("ok",
		tasks.ReadyJourneys{LocalAuthoring: true, CanvasConnected: true, AiAssisted: true},
		tasks.DoctorCheck{ID: "runtime.courses_root", Status: "ok", Summary: "Courses root: /courses"},
	)

	labels := newSummaryState(t, st)

	if strings.Contains(labels, "not set up yet") {
		t.Errorf("a ready install must show no unconfigured capability; got:\n%s", labels)
	}
	if !strings.Contains(labels, "Nothing to fix") {
		t.Errorf("expected the all-clear line; got:\n%s", labels)
	}
}

// A doctor `fail` withholds the version marker; the summary has to say so
// rather than claim a clean install.
func TestSummaryScreen_MarksATroubledInstall(t *testing.T) {
	st := NewState("2.3.0")
	st.Doctor = doctorReport("fail", tasks.ReadyJourneys{})
	st.MarkerWithheld = true
	st.MarkerReason = "the setup check reported a failure"

	labels := newSummaryState(t, st)

	if !strings.Contains(labels, "installed — setup needs attention") {
		t.Errorf("expected the title to drop the clean claim; got:\n%s", labels)
	}
	if !strings.Contains(labels, "Install version not recorded") {
		t.Errorf("expected the withheld marker to be explained; got:\n%s", labels)
	}
}

// No doctor means the summary falls back to what the installer can vouch for,
// with a short note — never a failed install, never a silent gap.
func TestSummaryScreen_FallsBackWhenTheDoctorCouldNotRun(t *testing.T) {
	st := NewState("2.3.0")
	st.DoctorErr = errors.New("bundled Node runtime missing at /opt/canvas-toolchain/.node/bin/node")

	labels := newSummaryState(t, st)

	if !strings.Contains(labels, "Setup check unavailable — bundled Node runtime missing") {
		t.Errorf("expected the fallback note; got:\n%s", labels)
	}
	if !strings.Contains(labels, "setup_anthropic") || !strings.Contains(labels, "setup_canvas") {
		t.Errorf("expected the installer's own warnings; got:\n%s", labels)
	}
	if strings.Contains(labels, "Local authoring") {
		t.Errorf("capability rows come from the doctor and must not be invented; got:\n%s", labels)
	}
	if !strings.Contains(labels, `Next step: open your AI app and say "get started".`) {
		t.Errorf("the next step applies with or without the doctor; got:\n%s", labels)
	}
}

func TestSummaryScreen_FallsBackWhenNoDoctorRan(t *testing.T) {
	labels := newSummaryState(t, NewState("2.3.0"))

	if !strings.Contains(labels, "Setup check unavailable — it did not run") {
		t.Errorf("expected the fallback note; got:\n%s", labels)
	}
}

// The Panopto note is the installer's own observation, so it survives on the
// doctor path too (the doctor inspects no Panopto config).
func TestSummaryScreen_KeepsTheInstallerPanoptoNote(t *testing.T) {
	st := NewState("2.3.0")
	st.WorkflowPanopto = true
	st.Doctor = doctorReport("ok", tasks.ReadyJourneys{LocalAuthoring: true})

	labels := newSummaryState(t, st)

	if !strings.Contains(labels, "Panopto not configured") {
		t.Errorf("expected the installer's Panopto note; got:\n%s", labels)
	}
}

// Panopto is opt-in: a professor who did not tick the workflow must not be told
// they have something left to configure. The note only applies to the chosen,
// incomplete workflow.
func TestSummaryScreen_OmitsPanoptoNoteWhenWorkflowNotChosen(t *testing.T) {
	st := NewState("2.3.0")
	st.WorkflowPanopto = false
	st.Doctor = doctorReport("ok", tasks.ReadyJourneys{LocalAuthoring: true})

	labels := newSummaryState(t, st)

	if strings.Contains(labels, "Panopto not configured") {
		t.Errorf("a workflow the professor did not choose must not warn; got:\n%s", labels)
	}
}

// A chosen and fully configured Panopto workflow is complete, so there is
// nothing to warn about either.
func TestSummaryScreen_OmitsPanoptoNoteWhenWorkflowConfigured(t *testing.T) {
	st := NewState("2.3.0")
	st.WorkflowPanopto = true
	st.PanoptoDomain = "https://example.panopto.com"
	st.PanoptoClientID = "client-id"
	st.PanoptoSecret = "secret"
	st.Doctor = doctorReport("ok", tasks.ReadyJourneys{LocalAuthoring: true})

	labels := newSummaryState(t, st)

	if strings.Contains(labels, "Panopto not configured") {
		t.Errorf("a fully configured workflow needs no note; got:\n%s", labels)
	}
}

// The body must fill the window. It is the border layout's center object, so it
// takes all space the header/bottom bar leave; if it were passed as the top
// slot it would collapse to the scrollbar's minimum height.
func TestSummaryScreen_ScrollAreaFillsTheWindow(t *testing.T) {
	app := test.NewApp()
	defer app.Quit()
	w := app.NewWindow("test")
	defer w.Close()

	st := NewState("2.3.0")
	st.InstallDir = t.TempDir()
	st.Doctor = doctorReport("warn", tasks.ReadyJourneys{},
		tasks.DoctorCheck{ID: "runtime.courses_root", Status: "warn", Summary: "No courses root is configured."},
	)

	screen := NewSummaryScreen(w, st, func() {})
	const width, height = 720, 600
	screen.Resize(fyne.NewSize(width, height))

	scroll := findScroll(screen)
	if scroll == nil {
		t.Fatal("expected the summary body to live in a scroll container")
	}
	if got := scroll.Size().Height; got <= height/2 {
		t.Errorf("scroll area must fill the window height; got %v of %d", got, height)
	}
	if got := scroll.Size().Width; got <= width/2 {
		t.Errorf("scroll area must span the window width; got %v of %d", got, width)
	}
}

func findScroll(obj fyne.CanvasObject) *container.Scroll {
	switch v := obj.(type) {
	case *container.Scroll:
		return v
	case *fyne.Container:
		for _, c := range v.Objects {
			if s := findScroll(c); s != nil {
				return s
			}
		}
	}
	return nil
}

// The committed testdata is the wire format the screen parses, so the screen
// renders a real doctor document end to end.
func TestSummaryScreen_RendersTheCommittedDoctorSample(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "tasks", "testdata", "doctor-report.json"))
	if err != nil {
		t.Fatalf("testdata missing: %v", err)
	}
	report := tasks.DoctorReport{}
	if err := json.Unmarshal(raw, &report); err != nil {
		t.Fatalf("testdata is not a doctor report: %v", err)
	}

	st := NewState("2.3.0")
	st.Doctor = &report
	labels := newSummaryState(t, st)

	if !strings.Contains(labels, "Canvas is not connected") {
		t.Errorf("expected the sample's Canvas finding; got:\n%s", labels)
	}
	if !strings.Contains(labels, "Fix: ct_setup canvas") {
		t.Errorf("expected the sample's Canvas fix; got:\n%s", labels)
	}
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
