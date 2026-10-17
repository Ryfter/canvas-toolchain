package screens

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
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

// The installer must not build TypeScript on the professor's machine: the
// payload ships a prebuilt dist/ and a package.json whose `prepare` script
// pack-payload.sh strips, because npm runs `prepare` on every install. A step
// or a row label that advertises a build has crept back in if this fails.
func TestInstallPipeline_AdvertisesNoBuild(t *testing.T) {
	st := NewState("2.3.0")
	st.InstallDir = t.TempDir()

	for _, s := range buildSteps(st, func(string) {}) {
		if strings.Contains(strings.ToLower(s.Name), "build") {
			t.Errorf("install step %q looks like a build step", s.Name)
		}
	}
	for _, label := range installRowLabels() {
		if strings.Contains(strings.ToLower(label), "build") {
			t.Errorf("install row %q advertises a build step", label)
		}
	}
}

// The one npm invocation in the pipeline must be a production install, never a
// build. Driven through the real step closure against a fake bundled Node, so a
// renamed step or a re-argued command still fails.
func TestInstallRuntimeDependenciesStep_RunsNoBuild(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the fake bundled Node is a shell script; Windows would need a real .exe")
	}
	installDir := t.TempDir()
	st := NewState("2.3.0")
	st.InstallDir = installDir

	np := tasks.ResolveNodePaths(installDir)
	if err := os.MkdirAll(filepath.Dir(np.Node), 0o755); err != nil {
		t.Fatal(err)
	}
	argvLog := filepath.Join(installDir, "argv.log")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" >> '" + argvLog + "'\n"
	if err := os.WriteFile(np.Node, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	step := findStep(t, buildSteps(st, func(string) {}), "Install runtime dependencies")
	if err := step.Run(context.Background()); err != nil {
		t.Fatalf("install step: %v", err)
	}

	raw, err := os.ReadFile(argvLog)
	if err != nil {
		t.Fatalf("the bundled Node was never invoked: %v", err)
	}
	argv := string(raw)
	for _, forbidden := range []string{"build", "run"} {
		if strings.Contains(argv, forbidden) {
			t.Errorf("npm argv %q must not contain %q", argv, forbidden)
		}
	}
	if !strings.Contains(argv, "ci") || !strings.Contains(argv, "--omit=dev") {
		t.Errorf("expected a production install (npm ci --omit=dev), got argv %q", argv)
	}
}

// payloadFreeSteps returns the steps that need neither the embedded payload nor
// a Node runtime, so a test can drive the real step closures over a fake home.
// The extract/npm steps cannot run without a built payload, and a half-run that
// never reaches a step proves nothing about what that step writes. Every name
// must match a real step, so a rename fails the test loudly.
func payloadFreeSteps(t *testing.T, steps []tasks.Step) []tasks.Step {
	t.Helper()
	want := []string{"Write module manifest", "Record requested modules", "Connect MCP hosts", "Version marker"}
	out := make([]tasks.Step, 0, len(want))
	for _, name := range want {
		out = append(out, findStep(t, steps, name))
	}
	return out
}

// snapshotTree records every file under the given roots, path -> contents.
func snapshotTree(t *testing.T, roots ...string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			out[path] = string(raw)
			return nil
		})
		if err != nil {
			t.Fatalf("snapshot %s: %v", root, err)
		}
	}
	return out
}

// fakeUserHome points CC_HOME, CANVAS_DESIGN_HOME and the OS home at a temp
// tree, so an install step can be run without touching the professor's real
// config.
func fakeUserHome(t *testing.T) (home, ccHome, designHome string) {
	t.Helper()
	home = t.TempDir()
	ccHome = filepath.Join(home, ".command-and-control")
	designHome = filepath.Join(home, ".canvas-design-mcp")
	for _, dir := range []string{ccHome, designHome} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("CC_HOME", ccHome)
	t.Setenv("CANVAS_DESIGN_HOME", designHome)
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", home)
	} else {
		t.Setenv("HOME", home)
	}
	return home, ccHome, designHome
}

// An install must never rewrite a credential the professor already saved. Setup
// moved to the first chat (D3 phase 2), so the installer may not touch any of
// the files the old credentials screen wrote.
func TestInstallSteps_LeaveExistingConfigUntouched(t *testing.T) {
	_, ccHome, designHome := fakeUserHome(t)

	seed := map[string]string{
		filepath.Join(ccHome, "anthropic-config.json"): `{"apiKey":"sk-ant-EXISTING","model":"claude-haiku-4-5-20251001"}`,
		filepath.Join(ccHome, "canvas-config.json"):    `{"host":"existing.instructure.com","token":"EXISTING-TOKEN"}`,
		filepath.Join(ccHome, "panopto-config.json"):   `{"domain":"existing.hosted.panopto.com","clientId":"cid","clientSecret":"secret"}`,
		filepath.Join(designHome, "institution.json"):  `{"canvasUrl":"https://existing.instructure.com","apiToken":"EXISTING-TOKEN"}`,
	}
	for path, body := range seed {
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	st := NewState("2.3.0")
	st.InstallDir = t.TempDir()
	steps := payloadFreeSteps(t, buildSteps(st, func(string) {}))

	before := snapshotTree(t, ccHome, designHome)
	(&tasks.Runner{Steps: steps}).Run(context.Background())
	after := snapshotTree(t, ccHome, designHome)

	for path, want := range before {
		got, ok := after[path]
		switch {
		case !ok:
			t.Errorf("%s was deleted by the install", path)
		case got != want:
			t.Errorf("%s was rewritten by the install:\nbefore: %s\nafter:  %s", path, want, got)
		}
	}
}

// And on a home with nothing configured, the install must not invent a
// credential file: the old credentials screen wrote these, and it is gone.
func TestInstallSteps_WriteNoCredentialFiles(t *testing.T) {
	_, ccHome, _ := fakeUserHome(t)

	st := NewState("2.3.0")
	st.InstallDir = t.TempDir()
	steps := payloadFreeSteps(t, buildSteps(st, func(string) {}))
	(&tasks.Runner{Steps: steps}).Run(context.Background())

	for _, name := range []string{"anthropic-config.json", "canvas-config.json", "panopto-config.json"} {
		if _, err := os.Stat(filepath.Join(ccHome, name)); !os.IsNotExist(err) {
			t.Errorf("the install wrote %s; credentials belong to the first chat", name)
		}
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
