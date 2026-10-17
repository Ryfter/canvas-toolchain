package screens

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"fyne.io/fyne/v2/test"

	"github.com/Ryfter/canvas-toolchain/installer/tasks"
)

// findStep returns one step by name, so a test drives the real pipeline
// closure rather than a copy of it.
func findStep(t *testing.T, steps []tasks.Step, name string) tasks.Step {
	t.Helper()
	for _, s := range steps {
		if s.Name == name {
			return s
		}
	}
	t.Fatalf("no step named %q", name)
	return tasks.Step{}
}

// The setup check must never be able to abort an install: driven through the
// real runner, a doctor that cannot run leaves a warning, not a failure.
func TestSetupCheckStepNeverFailsTheInstall(t *testing.T) {
	st := NewState("2.3.0")
	st.InstallDir = t.TempDir()

	step := findStep(t, buildSteps(st, func(string) {}), "Setup check (doctor)")
	results := (&tasks.Runner{Steps: []tasks.Step{step}}).Run(context.Background())

	if results[0].Status != tasks.StepWarn {
		t.Errorf("status = %v, want StepWarn", results[0].Status)
	}
	if st.DoctorErr == nil {
		t.Error("the failure must be recorded for the summary to render")
	}
	if st.Doctor != nil {
		t.Error("no report must leave the summary on its fallback path")
	}
}

// The version marker is the installer's "this install is complete" record; the
// doctor's verdict decides whether it is stamped.
func TestVersionMarkerStep_FollowsTheDoctor(t *testing.T) {
	tests := []struct {
		name       string
		report     *tasks.DoctorReport
		doctorErr  error
		wantMarker bool
	}{
		{name: "doctor is ready", report: &tasks.DoctorReport{OverallStatus: "ok"}, wantMarker: true},
		{name: "doctor warns only", report: &tasks.DoctorReport{OverallStatus: "warn"}, wantMarker: true},
		{name: "doctor could not run", report: nil, doctorErr: os.ErrNotExist, wantMarker: true},
		{name: "doctor reports a failure", report: &tasks.DoctorReport{OverallStatus: "fail"}, wantMarker: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			st := NewState("2.3.0")
			st.InstallDir = t.TempDir()
			st.Doctor, st.DoctorErr = tc.report, tc.doctorErr

			step := findStep(t, buildSteps(st, func(string) {}), "Version marker")
			if err := step.Run(context.Background()); err != nil {
				t.Fatalf("version marker step: %v", err)
			}

			_, statErr := os.Stat(filepath.Join(st.InstallDir, ".canvas-toolchain-version"))
			if wrote := statErr == nil; wrote != tc.wantMarker {
				t.Errorf("marker written = %v, want %v", wrote, tc.wantMarker)
			}
			if st.MarkerWithheld == tc.wantMarker {
				t.Errorf("MarkerWithheld = %v, want %v", st.MarkerWithheld, !tc.wantMarker)
			}
			if st.MarkerWithheld && st.MarkerReason == "" {
				t.Error("a withheld marker must carry a reason for the summary")
			}
		})
	}
}

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

func TestInstallRowsAlignWithSteps(t *testing.T) {
	st := NewState("v0.0.0")
	steps := buildSteps(st, func(string) {})
	if len(installRowLabels()) != len(steps) {
		t.Fatalf("row/step count mismatch: %d rows vs %d steps", len(installRowLabels()), len(steps))
	}
}

func TestWriteSelectedHosts_WritesOnlySelectedDetected(t *testing.T) {
	home := t.TempDir()
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", home)
		t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	} else {
		t.Setenv("HOME", home)
	}
	// Detect two hosts; select only one.
	_ = os.MkdirAll(filepath.Join(home, ".cursor"), 0o755)
	_ = os.MkdirAll(filepath.Join(home, ".codex"), 0o755)

	st := NewState("1.0.0")
	st.ConnectHosts = map[string]bool{"cursor": true, "codex": false}
	st.WiredHosts = map[string]bool{}

	if err := writeSelectedHosts(st, "/node", "/app/index.js"); err != nil {
		t.Fatal(err)
	}
	if !st.WiredHosts["cursor"] {
		t.Error("expected cursor wired")
	}
	if st.WiredHosts["codex"] {
		t.Error("codex was unselected; should not be wired")
	}
	if _, err := os.Stat(filepath.Join(home, ".cursor", "mcp.json")); err != nil {
		t.Error("expected cursor mcp.json written")
	}
}
