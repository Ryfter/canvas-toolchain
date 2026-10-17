package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// The installer's window onto `canvas-toolchain doctor --json`. The doctor is
// the setup engine's own verdict on this machine, so the installer renders what
// it says instead of re-deriving "installed" from the steps it just ran.

// doctorTimeout bounds one run. The doctor makes no network calls without
// --probe, so this covers a cold node start (and a slow, antivirus-laden
// Windows filesystem), nothing more.
const doctorTimeout = 20 * time.Second

// doctorOutputLimit caps how much of the child's output we buffer. A report is
// a few KB; anything past this is refused rather than held.
const doctorOutputLimit = 1 << 20

// DoctorFix is the operation that resolves a check, named the way the doctor
// names it (a tool plus one of its actions).
type DoctorFix struct {
	Tool   string `json:"tool"`
	Action string `json:"action"`
	Hint   string `json:"hint"`
}

// DoctorCheck is one finding. Status is "ok", "warn" or "fail".
type DoctorCheck struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Summary string `json:"summary"`
	// Detail holds paths, ids and status codes only — never file contents. The
	// summary does not render it, but it is part of the report contract and it
	// is what the test uses to prove the committed sample carries no path from
	// the machine that generated it.
	Detail []string   `json:"detail,omitempty"`
	Fix    *DoctorFix `json:"fix,omitempty"`
}

// ReadyJourneys is the per-capability verdict: a partial setup is legitimate,
// so readiness is reported three ways instead of one red/green light.
type ReadyJourneys struct {
	LocalAuthoring  bool `json:"localAuthoring"`
	CanvasConnected bool `json:"canvasConnected"`
	AiAssisted      bool `json:"aiAssisted"`
}

// DoctorReport mirrors the document `doctor --json` prints.
type DoctorReport struct {
	OverallStatus string        `json:"overallStatus"`
	Journey       string        `json:"journey"`
	Probed        bool          `json:"probed"`
	CheckedAt     string        `json:"checkedAt"`
	Checks        []DoctorCheck `json:"checks"`
	ReadyJourneys ReadyJourneys `json:"readyJourneys"`
}

// DoctorEntryPath is the installed canvas-toolchain entrypoint. The path comes
// from the install directory the installer itself chose — never hardcoded — and
// the bin resolves Command & Control from its own location, so no checkout
// path is baked in here either.
func DoctorEntryPath(installDir string) string {
	return filepath.Join(installDir, "packages", "canvas-toolchain", "bin", "canvas-toolchain.mjs")
}

// newDoctorCmd builds the spawn. A seam, like the screens package's launch
// hooks, so tests can exercise the timeout and unreadable-output paths without
// a node runtime.
var newDoctorCmd = func(ctx context.Context, nodePath, entryPath, dir string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, nodePath, entryPath, "doctor", "--json")
	cmd.Dir = dir
	return cmd
}

// cappedBuffer buffers at most max bytes and quietly drops the rest, so a
// broken build that spews output cannot balloon the installer's memory.
type cappedBuffer struct {
	buf bytes.Buffer
	max int
}

func (c *cappedBuffer) Write(p []byte) (int, error) {
	if room := c.max - c.buf.Len(); room > 0 {
		if len(p) > room {
			c.buf.Write(p[:room])
			return len(p), nil
		}
		c.buf.Write(p)
	}
	return len(p), nil
}

func (c *cappedBuffer) Bytes() []byte { return c.buf.Bytes() }

// parseDoctorReport decodes exactly one JSON document. A body with trailing
// content is refused, so a half-written report falls back instead of being
// silently truncated.
func parseDoctorReport(raw []byte, out *DoctorReport) error {
	dec := json.NewDecoder(bytes.NewReader(raw))
	if err := dec.Decode(out); err != nil {
		return err
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return fmt.Errorf("unexpected content after the report")
	}
	if out.OverallStatus == "" {
		return fmt.Errorf("the report has no overallStatus")
	}
	return nil
}

// exitSuffix names the child's exit status so a support conversation starts
// with something concrete. It never carries the child's output — the doctor
// prints a report, not diagnostics we want to echo.
func exitSuffix(err error) string {
	var exitErr *exec.ExitError
	switch {
	case errors.As(err, &exitErr):
		return fmt.Sprintf(", exit status %d", exitErr.ExitCode())
	case err != nil:
		return ", and it could not be started"
	default:
		return ""
	}
}

// RunDoctor asks the installed toolchain how this machine is set up. It never
// blocks an install: every failure comes back as a short, actionable error so
// the caller can fall back to the summary it had before.
//
// A non-zero exit is NOT a failure here — the CLI exits 1 exactly when its own
// report says a journey failed, and that report is what we want to render.
func RunDoctor(ctx context.Context, installDir string) (DoctorReport, error) {
	var report DoctorReport

	nodePath := ResolveNodePaths(installDir).Node
	if _, err := os.Stat(nodePath); err != nil {
		return report, fmt.Errorf("bundled Node runtime missing at %s", nodePath)
	}
	entryPath := DoctorEntryPath(installDir)
	if _, err := os.Stat(entryPath); err != nil {
		return report, fmt.Errorf("installed entrypoint missing at %s", entryPath)
	}

	ctx, cancel := context.WithTimeout(ctx, doctorTimeout)
	defer cancel()

	cmd := newDoctorCmd(ctx, nodePath, entryPath, installDir)
	// The child inherits this process's environment, so CC_HOME /
	// CANVAS_DESIGN_HOME overrides (and a professor's real homes) reach the
	// doctor unchanged.
	var stdout cappedBuffer
	stdout.max = doctorOutputLimit
	cmd.Stdout = &stdout
	cmd.Stderr = io.Discard

	runErr := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return report, fmt.Errorf("the setup check did not finish within %s", doctorTimeout)
	}
	if err := parseDoctorReport(stdout.Bytes(), &report); err != nil {
		return report, fmt.Errorf(
			"the setup check did not return a readable report (%v%s)", err, exitSuffix(runErr))
	}
	return report, nil
}

// VersionMarkerDecision is the verdict on stamping the install as complete.
type VersionMarkerDecision struct {
	Write bool
	// Reason is professor-facing and set only when the marker is withheld.
	Reason string
}

// DecideVersionMarker answers whether the installer may write
// .canvas-toolchain-version.
//
// The marker is what the installer's own update mode and the Updater shortcut
// read, so withholding it is a strong claim: that this install is not
// complete. Only the doctor's own `fail` verdict earns that — never a check
// that merely warns, and never a doctor we could not run (the install itself
// still succeeded).
func DecideVersionMarker(report *DoctorReport, doctorErr error) VersionMarkerDecision {
	if doctorErr != nil || report == nil {
		return VersionMarkerDecision{Write: true}
	}
	if report.OverallStatus == "fail" {
		return VersionMarkerDecision{
			Write:  false,
			Reason: "the setup check reported a failure",
		}
	}
	return VersionMarkerDecision{Write: true}
}

// FixHint renders a check's fix as one line: the operation, then its hint. It
// is empty when the check carries no fix.
func (c DoctorCheck) FixHint() string {
	if c.Fix == nil {
		return ""
	}
	return strings.TrimSpace(c.Fix.Tool + " " + c.Fix.Action + " — " + c.Fix.Hint)
}
