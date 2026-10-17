package tasks

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestDoctorHelperProcess is not a test. It is the child process the exec-seam
// tests spawn so they exercise the real spawn/parse/exit path without needing a
// node runtime on the machine. The standard Go idiom: the parent re-execs the
// test binary with DOCTOR_HELPER=1 and the child behaves like the fake CLI.
func TestDoctorHelperProcess(t *testing.T) {
	if os.Getenv("DOCTOR_HELPER") != "1" {
		return
	}
	if out := os.Getenv("DOCTOR_HELPER_STDOUT"); out != "" {
		fmt.Fprint(os.Stdout, out)
	}
	if os.Getenv("DOCTOR_HELPER_SLEEP") == "1" {
		time.Sleep(30 * time.Second)
	}
	if code := os.Getenv("DOCTOR_HELPER_EXIT"); code != "" {
		n, _ := strconv.Atoi(code)
		os.Exit(n)
	}
	os.Exit(0)
}

// helperCommand points the doctor seam at this test binary, so a test can play
// a fake doctor: it prints whatever the test asked for, or hangs.
func helperCommand(ctx context.Context, nodePath, entryPath, dir string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=TestDoctorHelperProcess")
	cmd.Env = append(os.Environ(), "DOCTOR_HELPER=1")
	cmd.Dir = dir
	return cmd
}

// fakeInstallDir creates the two files RunDoctor looks for before it spawns.
func fakeInstallDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	np := ResolveNodePaths(dir)
	if err := os.MkdirAll(filepath.Dir(np.Node), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(np.Node, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	entry := DoctorEntryPath(dir)
	if err := os.MkdirAll(filepath.Dir(entry), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(entry, []byte("// fake entry\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir
}

// The committed sample is a real `doctor --json` run captured on an empty temp
// home, so it pins the wire format the installer parses.
//
//	Regenerate with: npm run build && CC_HOME=<empty> CANVAS_DESIGN_HOME=<empty> \
//	  node packages/canvas-toolchain/bin/canvas-toolchain.mjs doctor --json
func TestParseDoctorReport_RealSample(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "doctor-report.json"))
	if err != nil {
		t.Fatalf("testdata missing: %v", err)
	}

	var report DoctorReport
	if err := parseDoctorReport(raw, &report); err != nil {
		t.Fatalf("parseDoctorReport: %v", err)
	}

	if report.OverallStatus != "warn" {
		t.Errorf("overallStatus = %q, want warn on an empty home", report.OverallStatus)
	}
	if report.Journey != "full" {
		t.Errorf("journey = %q, want full", report.Journey)
	}
	if report.Probed {
		t.Error("probed = true; the sample must never have run network probes")
	}
	if len(report.Checks) == 0 {
		t.Fatal("sample carries no checks")
	}
	for _, check := range report.Checks {
		if check.ID == "" || check.Summary == "" {
			t.Errorf("check with missing id/summary: %+v", check)
		}
		switch check.Status {
		case "ok", "warn", "fail":
		default:
			t.Errorf("check %s has unknown status %q", check.ID, check.Status)
		}
	}
	if report.ReadyJourneys.LocalAuthoring || report.ReadyJourneys.CanvasConnected || report.ReadyJourneys.AiAssisted {
		t.Errorf("an empty home cannot be ready for anything: %+v", report.ReadyJourneys)
	}
	if !strings.Contains(string(raw), "ct_setup") {
		t.Error("sample carries no fix, so it does not exercise the fix rendering")
	}
}

// The sample ships to every professor's machine inside the installer source and
// in this repo: it must never carry a path from the machine that generated it.
func TestDoctorSample_CarriesNoUserPath(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "doctor-report.json"))
	if err != nil {
		t.Fatalf("testdata missing: %v", err)
	}

	var report DoctorReport
	if err := parseDoctorReport(raw, &report); err != nil {
		t.Fatalf("parseDoctorReport: %v", err)
	}
	for _, check := range report.Checks {
		if len(check.Detail) > 0 {
			t.Errorf("check %s carries detail %v — the sample must be generated on an empty home", check.ID, check.Detail)
		}
	}
	for _, marker := range []string{"/Users/", "/home/", `C:\Users\`, "/var/folders/", "/tmp/"} {
		if strings.Contains(string(raw), marker) {
			t.Errorf("sample contains machine path %q; regenerate it on an empty temp home", marker)
		}
	}
}

func TestRunDoctor_ReportsMissingNodeRuntime(t *testing.T) {
	_, err := RunDoctor(context.Background(), t.TempDir())
	if err == nil {
		t.Fatal("expected an error when the bundled node runtime is absent")
	}
	if !strings.Contains(err.Error(), "Node runtime") {
		t.Errorf("error should name the missing runtime, got: %v", err)
	}
}

func TestRunDoctor_ReportsMissingEntrypoint(t *testing.T) {
	dir := t.TempDir()
	np := ResolveNodePaths(dir)
	if err := os.MkdirAll(filepath.Dir(np.Node), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(np.Node, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	_, err := RunDoctor(context.Background(), dir)
	if err == nil {
		t.Fatal("expected an error when the installed entrypoint is absent")
	}
	if !strings.Contains(err.Error(), "canvas-toolchain.mjs") {
		t.Errorf("error should name the missing entrypoint, got: %v", err)
	}
}

func TestRunDoctor_FallsBackWhenTheDoctorHangs(t *testing.T) {
	dir := fakeInstallDir(t)
	restore := newDoctorCmd
	newDoctorCmd = func(ctx context.Context, nodePath, entryPath, runDir string) *exec.Cmd {
		cmd := helperCommand(ctx, nodePath, entryPath, runDir)
		cmd.Env = append(cmd.Env, "DOCTOR_HELPER_SLEEP=1")
		return cmd
	}
	t.Cleanup(func() { newDoctorCmd = restore })

	ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
	defer cancel()

	start := time.Now()
	_, err := RunDoctor(ctx, dir)
	if err == nil {
		t.Fatal("expected an error when the doctor never exits")
	}
	if !strings.Contains(err.Error(), "did not finish") {
		t.Errorf("error should explain the timeout, got: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 10*time.Second {
		t.Errorf("the doctor's own timeout did not bound the run: took %s", elapsed)
	}
}

func TestRunDoctor_FallsBackOnUnreadableReport(t *testing.T) {
	dir := fakeInstallDir(t)
	restore := newDoctorCmd
	newDoctorCmd = func(ctx context.Context, nodePath, entryPath, runDir string) *exec.Cmd {
		cmd := helperCommand(ctx, nodePath, entryPath, runDir)
		cmd.Env = append(cmd.Env, "DOCTOR_HELPER_STDOUT=not json at all")
		return cmd
	}
	t.Cleanup(func() { newDoctorCmd = restore })

	_, err := RunDoctor(context.Background(), dir)
	if err == nil {
		t.Fatal("expected an error when the doctor prints something we cannot read")
	}
	if !strings.Contains(err.Error(), "readable report") {
		t.Errorf("error should say the report was unreadable, got: %v", err)
	}
}

// The CLI exits 1 exactly when its report says a journey failed. That report is
// still the answer, so a non-zero exit must not be mistaken for a broken doctor
// — and it is what withholds the version marker.
func TestRunDoctor_AcceptsANonZeroExitWithAValidReport(t *testing.T) {
	dir := fakeInstallDir(t)
	const report = `{"overallStatus":"fail","journey":"local-authoring","probed":false,` +
		`"checkedAt":"2026-01-01T00:00:00.000Z","checks":[],` +
		`"readyJourneys":{"localAuthoring":false,"canvasConnected":false,"aiAssisted":false}}`

	restore := newDoctorCmd
	newDoctorCmd = func(ctx context.Context, nodePath, entryPath, runDir string) *exec.Cmd {
		cmd := helperCommand(ctx, nodePath, entryPath, runDir)
		cmd.Env = append(cmd.Env, "DOCTOR_HELPER_STDOUT="+report, "DOCTOR_HELPER_EXIT=1")
		return cmd
	}
	t.Cleanup(func() { newDoctorCmd = restore })

	got, err := RunDoctor(context.Background(), dir)
	if err != nil {
		t.Fatalf("a failing report is still a report: %v", err)
	}
	if got.OverallStatus != "fail" {
		t.Errorf("overallStatus = %q, want fail", got.OverallStatus)
	}
	if decision := DecideVersionMarker(&got, nil); decision.Write {
		t.Error("a failing report must withhold the version marker")
	}
}

func TestParseDoctorReport_RejectsTrailingContent(t *testing.T) {
	var report DoctorReport
	err := parseDoctorReport([]byte(`{"overallStatus":"ok","checks":[]} {"overallStatus":"ok"}`), &report)
	if err == nil {
		t.Fatal("expected two documents to be refused, not silently truncated")
	}
}

func TestParseDoctorReport_RejectsEmptyDocument(t *testing.T) {
	var report DoctorReport
	if err := parseDoctorReport([]byte(`{}`), &report); err == nil {
		t.Fatal("expected an overallStatus-less document to be refused")
	}
}

// A doctor run must never go through a shell: a shell would re-interpret the
// install path on Windows and on paths with spaces or metacharacters.
func TestNewDoctorCmd_UsesNoShell(t *testing.T) {
	cmd := newDoctorCmd(context.Background(), "/install/.node/bin/node", "/install/canvas-toolchain.mjs", "/install")
	want := []string{"/install/.node/bin/node", "/install/canvas-toolchain.mjs", "doctor", "--json"}
	if len(cmd.Args) != len(want) {
		t.Fatalf("args = %v, want %v", cmd.Args, want)
	}
	for i, arg := range want {
		if cmd.Args[i] != arg {
			t.Errorf("args[%d] = %q, want %q", i, cmd.Args[i], arg)
		}
	}
	for _, arg := range cmd.Args {
		switch arg {
		case "cmd", "cmd.exe", "sh", "/bin/sh", "bash", "powershell", "powershell.exe", "-c":
			t.Errorf("arg %q looks like a shell", arg)
		}
	}
}

func TestDecideVersionMarker(t *testing.T) {
	failReport := &DoctorReport{OverallStatus: "fail", Journey: "local-authoring"}
	warnReport := &DoctorReport{OverallStatus: "warn", Journey: "full"}

	tests := []struct {
		name       string
		report     *DoctorReport
		err        error
		wantWrite  bool
		wantReason bool
	}{
		{name: "doctor reports ready", report: &DoctorReport{OverallStatus: "ok"}, wantWrite: true},
		{name: "doctor reports warnings only", report: warnReport, wantWrite: true},
		{name: "doctor reports a failure", report: failReport, wantWrite: false, wantReason: true},
		{name: "doctor cannot run", report: nil, err: fmt.Errorf("node missing"), wantWrite: true},
		{name: "doctor never ran", report: nil, wantWrite: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := DecideVersionMarker(tc.report, tc.err)
			if got.Write != tc.wantWrite {
				t.Errorf("Write = %v, want %v (reason %q)", got.Write, tc.wantWrite, got.Reason)
			}
			if tc.wantReason && got.Reason == "" {
				t.Error("a withheld marker must explain itself")
			}
			if !tc.wantWrite && got.Reason == "" {
				t.Error("a withheld marker must explain itself")
			}
		})
	}
}
