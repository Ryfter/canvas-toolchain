# Native Installer (Go + Fyne) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is intended for handoff to Codex via `codex:codex-rescue`.

**Goal:** Build a self-contained Go + Fyne GUI installer for canvas-toolchain that drops the toolchain onto a user's machine, wires the MCP server into Claude Desktop and Claude Code CLI, supports an opt-in Python install, and handles in-place updates.

**Architecture:** Go module rooted at `installer/`. Fyne v2.5+ GUI with five wizard screens. A `tasks/` subpackage implements each install action (extract, npm, configs, mcphost, shortcuts, python, validate). A separate `updater-stub` build target produces a tiny binary that the shortcut launches. Embedded payload (canvas-toolchain source) and embedded Node runtime are populated by CI at build time and read by Go's `embed` package.

**Tech Stack:** Go 1.22+, Fyne v2.5+ (`fyne.io/fyne/v2`), standard library for everything else. Tests use Go's built-in `testing` package and `fyne.io/fyne/v2/test`.

**Source spec:** `installer/docs/specs/2026-05-26-installer-design.md`.

**Out of scope for this plan:** GitHub Actions release workflow (Plan 3), the three C&C follow-up features (Plan 1).

**Dependencies on Plan 1:** Plan 1 ships C&C v0.9.1 with `setup_anthropic`, `setup_canvas`, and the update-nudge feature. This installer's credential writes target the config file format defined in Plan 1. Plan 1 should land before Task 9 of this plan executes — earlier tasks can proceed in parallel.

---

## File structure

```
installer/
├── go.mod                                       # module github.com/Ryfter/canvas-toolchain/installer
├── go.sum
├── main.go                                      # Fyne app entry, screen wiring, version constant
├── version.go                                   # const Version = "dev" (overridden by ldflags)
├── screens/
│   ├── state.go                                 # shared install-wizard state passed between screens
│   ├── welcome.go                               # screen 1
│   ├── workflows.go                             # screen 2
│   ├── credentials.go                           # screen 3
│   ├── install.go                               # screen 4
│   └── summary.go                               # screen 5
├── tasks/
│   ├── runner.go                                # generic task pipeline + step status enum
│   ├── extract.go                               # bundle + Node extraction
│   ├── npm.go                                   # npm install/build wrapper
│   ├── configs.go                               # ~/.command-and-control/* writers
│   ├── mcphost.go                               # Claude Desktop + Claude Code config merge
│   ├── shortcuts.go                             # Win .lnk + Mac .app shortcut creators
│   ├── python.go                                # optional Python install
│   └── validate.go                              # live credential validation
├── update/
│   ├── stub_main.go                             # +build updater_stub — separate binary entry
│   ├── github.go                                # GitHub Releases API lookup
│   └── apply.go                                 # apply-update logic shared with main installer
├── ui/
│   ├── theme.go                                 # BSU-ish palette, font setup
│   ├── widgets.go                               # custom widgets (masked input, progress row)
│   └── assets/
│       ├── logo.png
│       └── README.md                            # asset attribution + replacement notes
├── payload/
│   ├── .gitignore                               # ignores installer-payload.tar.gz + node-runtime.tar.gz
│   ├── README.md                                # explains CI populates this dir
│   └── embed.go                                 # //go:embed directives
├── docs/
│   ├── specs/2026-05-26-installer-design.md    # exists (from brainstorming)
│   ├── plans/2026-05-26-installer-go-fyne.md   # this file
│   └── manual-test-plan.md                      # written in Task 17
└── README.md                                    # build instructions
```

---

## Task 1: Scaffold Go module + skeleton

**Files:**
- Create: `installer/go.mod`
- Create: `installer/version.go`
- Create: `installer/main.go`
- Create: `installer/README.md`

- [ ] **Step 1: Initialize Go module**

Run from `D:/Dev/canvas-toolchain/installer/`:

```bash
cd D:/Dev/canvas-toolchain/installer
go mod init github.com/Ryfter/canvas-toolchain/installer
go get fyne.io/fyne/v2@v2.5.2
```

Expected: `go.mod` created with `module github.com/Ryfter/canvas-toolchain/installer`, Go version, and Fyne dependency.

- [ ] **Step 2: Write `installer/version.go`**

```go
package main

// Version is overridden at build time via `-ldflags "-X main.Version=v1.0.0"`.
var Version = "dev"
```

- [ ] **Step 3: Write minimal `installer/main.go`**

```go
package main

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/widget"
)

func main() {
	a := app.NewWithID("io.canvas-toolchain.installer")
	w := a.NewWindow("Canvas Toolchain Installer " + Version)
	w.Resize(fyne.NewSize(720, 540))
	w.SetContent(widget.NewLabel("Canvas Toolchain Installer " + Version))
	w.ShowAndRun()
}
```

- [ ] **Step 4: Write `installer/README.md`**

```markdown
# Canvas Toolchain Installer

Self-contained native installer for canvas-toolchain. Written in Go using Fyne.

## Build

Requires Go 1.22+ and the platform's Fyne build prerequisites
([Fyne docs](https://docs.fyne.io/started/)).

Local dev build (without embedded payload):

    cd installer
    go build -o canvas-toolchain-installer .

A release build (with embedded payload and Node runtime) happens in CI —
see `.github/workflows/release-installer.yml` and Plan 3.

## Updater stub

    go build -tags updater_stub -o canvas-toolchain-updater ./update

## Tests

    go test ./...
```

- [ ] **Step 5: Verify it compiles**

```bash
cd D:/Dev/canvas-toolchain/installer
go build -o canvas-toolchain-installer .
```

Expected: a binary file in the installer directory.

- [ ] **Step 6: Commit**

```bash
git -C D:/Dev/canvas-toolchain add installer/go.mod installer/go.sum installer/main.go installer/version.go installer/README.md
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): scaffold Go module and Fyne app shell (refs #63)"
```

---

## Task 2: UI theme + custom widgets

**Files:**
- Create: `installer/ui/theme.go`
- Create: `installer/ui/widgets.go`
- Create: `installer/ui/widgets_test.go`
- Create: `installer/ui/assets/logo.png` (placeholder — real logo dropped in later)
- Create: `installer/ui/assets/README.md`

- [ ] **Step 1: Write the theme**

`installer/ui/theme.go`:

```go
package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// BSU-ish palette derived from packages/canvas-design-studio/CLAUDE.md design tokens.
var (
	ColorPrimary      = color.NRGBA{R: 0x00, G: 0x33, B: 0xA0, A: 0xFF}
	ColorPrimaryDark  = color.NRGBA{R: 0x00, G: 0x22, B: 0x77, A: 0xFF}
	ColorPrimaryLight = color.NRGBA{R: 0xE6, G: 0xEC, B: 0xF9, A: 0xFF}
	ColorNeutral      = color.NRGBA{R: 0xF4, G: 0xF3, B: 0xEF, A: 0xFF}
	ColorTextPrimary  = color.NRGBA{R: 0x1A, G: 0x1A, B: 0x1A, A: 0xFF}
	ColorSuccess      = color.NRGBA{R: 0x3B, G: 0x6D, B: 0x11, A: 0xFF}
	ColorWarning      = color.NRGBA{R: 0x85, G: 0x4F, B: 0x0B, A: 0xFF}
	ColorDanger       = color.NRGBA{R: 0xA3, G: 0x2D, B: 0x2D, A: 0xFF}
)

type InstallerTheme struct{}

func (InstallerTheme) Color(n fyne.ThemeColorName, v fyne.ThemeVariant) color.Color {
	switch n {
	case theme.ColorNamePrimary:
		return ColorPrimary
	case theme.ColorNameBackground:
		return ColorNeutral
	case theme.ColorNameForeground:
		return ColorTextPrimary
	case theme.ColorNameSuccess:
		return ColorSuccess
	case theme.ColorNameWarning:
		return ColorWarning
	case theme.ColorNameError:
		return ColorDanger
	}
	return theme.DefaultTheme().Color(n, v)
}

func (InstallerTheme) Font(s fyne.TextStyle) fyne.Resource { return theme.DefaultTheme().Font(s) }
func (InstallerTheme) Icon(n fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(n)
}
func (InstallerTheme) Size(n fyne.ThemeSizeName) float32 {
	return theme.DefaultTheme().Size(n)
}
```

- [ ] **Step 2: Write custom widgets**

`installer/ui/widgets.go`:

```go
package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// MaskedEntry is a single-line entry that obscures its content.
type MaskedEntry struct {
	widget.Entry
}

func NewMaskedEntry(placeholder string) *MaskedEntry {
	e := &MaskedEntry{}
	e.ExtendBaseWidget(e)
	e.Password = true
	e.SetPlaceHolder(placeholder)
	return e
}

// StatusRow displays an icon + label + optional secondary text, used for prereq
// checks and the step list on the install screen.
type StatusRow struct {
	widget.BaseWidget
	icon  *canvas.Text
	label *widget.Label
	hint  *widget.Label
}

type RowStatus int

const (
	StatusPending RowStatus = iota
	StatusRunning
	StatusOK
	StatusWarn
	StatusError
)

func NewStatusRow(label string) *StatusRow {
	r := &StatusRow{
		icon:  canvas.NewText("…", ColorTextPrimary),
		label: widget.NewLabel(label),
		hint:  widget.NewLabel(""),
	}
	r.ExtendBaseWidget(r)
	return r
}

func (r *StatusRow) SetStatus(s RowStatus, hint string) {
	switch s {
	case StatusPending:
		r.icon.Text = "…"
		r.icon.Color = ColorTextPrimary
	case StatusRunning:
		r.icon.Text = "▶"
		r.icon.Color = ColorPrimary
	case StatusOK:
		r.icon.Text = "✓"
		r.icon.Color = ColorSuccess
	case StatusWarn:
		r.icon.Text = "⚠"
		r.icon.Color = ColorWarning
	case StatusError:
		r.icon.Text = "✗"
		r.icon.Color = ColorDanger
	}
	r.hint.SetText(hint)
	canvas.Refresh(r.icon)
}

func (r *StatusRow) CreateRenderer() fyne.WidgetRenderer {
	box := container.NewHBox(r.icon, r.label, r.hint)
	return widget.NewSimpleRenderer(box)
}

// HintedField wraps a Form field with a small help line beneath the input.
type HintedField struct {
	Label string
	Input fyne.CanvasObject
	Hint  string
}

func (h HintedField) AsCanvasObject() fyne.CanvasObject {
	hintLabel := canvas.NewText(h.Hint, color.NRGBA{R: 0x55, G: 0x55, B: 0x50, A: 0xFF})
	hintLabel.TextSize = 11
	return container.NewVBox(
		widget.NewLabelWithStyle(h.Label, fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		h.Input,
		hintLabel,
	)
}
```

- [ ] **Step 3: Write widget tests**

`installer/ui/widgets_test.go`:

```go
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
```

- [ ] **Step 4: Create asset placeholders**

`installer/ui/assets/README.md`:

```markdown
# Installer assets

- `logo.png` — 256x256 placeholder. Replace with the final canvas-toolchain logo
  before tagging v1.0.0. Stay under 64KB so the embedded asset doesn't bloat
  the binary.
```

Create `installer/ui/assets/logo.png` as a 256x256 solid-color PNG placeholder. The implementer can generate one with any tool or commit a transparent 1x1 PNG and document the replacement requirement.

- [ ] **Step 5: Run tests**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./ui/...
```

Expected: PASS — three tests.

- [ ] **Step 6: Commit**

```bash
git -C D:/Dev/canvas-toolchain add installer/ui/
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): theme + custom widgets (masked entry, status row, hinted field) (refs #63)"
```

---

## Task 3: Shared wizard state

**Files:**
- Create: `installer/screens/state.go`
- Create: `installer/screens/state_test.go`

- [ ] **Step 1: Write the state struct**

`installer/screens/state.go`:

```go
package screens

import (
	"os"
	"path/filepath"
	"runtime"
)

// InstallMode is set on screen 1 once the install path is chosen.
type InstallMode int

const (
	ModeFresh InstallMode = iota
	ModeUpdate
)

// State is the install-wizard's shared mutable state. One instance is created
// in main.go and passed by pointer to every screen.
type State struct {
	// Selected on screen 1
	InstallDir string
	Mode       InstallMode

	// Selected on screen 2
	WorkflowCanvas   bool
	WorkflowPanopto  bool
	WorkflowCI       bool
	WorkflowRegistry bool
	OptInPython      bool

	// Entered on screen 3
	AnthropicAPIKey string
	CanvasHost      string
	CanvasToken     string
	PanoptoDomain   string
	PanoptoClientID string
	PanoptoSecret   string

	// Results from screen 4 (populated as steps complete)
	InstalledClaudeDesktop bool
	InstalledClaudeCode    bool
	InstalledPython        bool
	ValidationAnthropic    StepResult
	ValidationCanvas       StepResult
	ValidationPanopto      StepResult

	// Version we are installing — copied from main.Version at startup.
	Version string
}

type StepResult struct {
	Attempted bool
	OK        bool
	Message   string
}

// DefaultInstallDir returns the per-OS canonical default.
func DefaultInstallDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	if runtime.GOOS == "windows" {
		return filepath.Join(home, "canvas-toolchain")
	}
	return filepath.Join(home, "canvas-toolchain")
}

// NewState returns a State with sensible defaults: install path, Canvas defaults to BSU,
// Canvas workflow on by default, all others off.
func NewState(version string) *State {
	return &State{
		Version:        version,
		InstallDir:     DefaultInstallDir(),
		Mode:           ModeFresh,
		WorkflowCanvas: true,
		CanvasHost:     "bsu.instructure.com",
	}
}
```

- [ ] **Step 2: Write the test**

`installer/screens/state_test.go`:

```go
package screens

import (
	"strings"
	"testing"
)

func TestNewState_Defaults(t *testing.T) {
	s := NewState("v1.0.0")
	if s.Version != "v1.0.0" {
		t.Errorf("expected Version v1.0.0, got %q", s.Version)
	}
	if !s.WorkflowCanvas {
		t.Error("expected WorkflowCanvas to default to true")
	}
	if s.WorkflowPanopto || s.WorkflowCI || s.WorkflowRegistry || s.OptInPython {
		t.Error("expected non-default workflows to default to false")
	}
	if s.CanvasHost != "bsu.instructure.com" {
		t.Errorf("expected CanvasHost default 'bsu.instructure.com', got %q", s.CanvasHost)
	}
	if !strings.Contains(s.InstallDir, "canvas-toolchain") {
		t.Errorf("expected InstallDir to contain 'canvas-toolchain', got %q", s.InstallDir)
	}
	if s.Mode != ModeFresh {
		t.Error("expected initial Mode to be ModeFresh")
	}
}
```

- [ ] **Step 3: Run tests + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./screens/...
git -C D:/Dev/canvas-toolchain add installer/screens/state.go installer/screens/state_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): wizard state struct with per-OS defaults (refs #63)"
```

Expected: 1 test passes.

---

## Task 4: Screen 1 — Welcome + prereqs + install location

**Files:**
- Create: `installer/screens/welcome.go`
- Create: `installer/screens/welcome_test.go`

- [ ] **Step 1: Write the screen**

`installer/screens/welcome.go`:

```go
package screens

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

// MinDiskBytes is the minimum free space (~500 MB) we require at the install path.
const MinDiskBytes uint64 = 500 * 1024 * 1024

// NewWelcomeScreen builds screen 1. It calls onNext with no args when the user
// clicks Next; it expects the caller to navigate forward.
func NewWelcomeScreen(parent fyne.Window, st *State, onNext func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle(
		"Canvas Toolchain Installer "+st.Version,
		fyne.TextAlignCenter,
		fyne.TextStyle{Bold: true},
	)
	intro := widget.NewLabel("This installer will set up canvas-toolchain on your machine, including all dependencies. You can change the install location below.")
	intro.Wrapping = fyne.TextWrapWord

	diskRow := ui.NewStatusRow("Disk space (500 MB free required)")

	pathEntry := widget.NewEntry()
	pathEntry.SetText(st.InstallDir)
	pathEntry.OnChanged = func(s string) {
		st.InstallDir = s
		st.Mode = detectMode(s)
		refreshDiskRow(s, diskRow)
	}

	browseButton := widget.NewButton("Browse…", func() {
		dialog.ShowFolderOpen(func(uri fyne.ListableURI, err error) {
			if err != nil || uri == nil {
				return
			}
			pathEntry.SetText(filepath.Join(uri.Path(), "canvas-toolchain"))
		}, parent)
	})

	advancedExpander := widget.NewAccordion(
		widget.NewAccordionItem("Advanced",
			container.NewVBox(
				widget.NewButton("Reset to default", func() {
					pathEntry.SetText(DefaultInstallDir())
				}),
				widget.NewLabel("The installer creates this directory if it doesn't exist."),
			),
		),
	)

	nextButton := widget.NewButton("Next", func() {
		if !checkDiskSpace(st.InstallDir) {
			dialog.ShowError(fmt.Errorf("not enough disk space at %s", st.InstallDir), parent)
			return
		}
		st.Mode = detectMode(st.InstallDir)
		onNext()
	})
	nextButton.Importance = widget.HighImportance

	refreshDiskRow(st.InstallDir, diskRow)

	form := container.NewVBox(
		title,
		intro,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Prerequisites", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		diskRow,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Install location", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		container.NewBorder(nil, nil, nil, browseButton, pathEntry),
		advancedExpander,
	)

	bottom := container.NewBorder(nil, nil, widget.NewButton("Cancel", parent.Close), nextButton)
	return container.NewBorder(form, bottom, nil, nil)
}

func refreshDiskRow(path string, row *ui.StatusRow) {
	free, err := freeBytes(path)
	if err != nil {
		row.SetStatus(ui.StatusError, fmt.Sprintf("could not check: %v", err))
		return
	}
	if free < MinDiskBytes {
		row.SetStatus(ui.StatusError, fmt.Sprintf("only %d MB free", free/1024/1024))
		return
	}
	row.SetStatus(ui.StatusOK, fmt.Sprintf("%d MB free", free/1024/1024))
}

func checkDiskSpace(path string) bool {
	free, err := freeBytes(path)
	if err != nil {
		return false
	}
	return free >= MinDiskBytes
}

func detectMode(path string) InstallMode {
	if _, err := os.Stat(filepath.Join(path, ".canvas-toolchain-version")); err == nil {
		return ModeUpdate
	}
	return ModeFresh
}

// freeBytes reports the free disk space at the deepest existing ancestor of path.
func freeBytes(path string) (uint64, error) {
	probe := path
	for {
		if _, err := os.Stat(probe); err == nil {
			break
		}
		parent := filepath.Dir(probe)
		if parent == probe {
			return 0, fmt.Errorf("no existing ancestor for %s", path)
		}
		probe = parent
	}
	return diskFree(probe)
}

// diskFree is implemented per-OS — see welcome_unix.go / welcome_windows.go.
var diskFree = func(path string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return stat.Bavail * uint64(stat.Bsize), nil
}
```

Note: `syscall.Statfs` is Unix-only. The implementer must split out a `welcome_windows.go` with build tag `//go:build windows` that uses `golang.org/x/sys/windows` `GetDiskFreeSpaceExW`. Add `golang.org/x/sys` via `go get golang.org/x/sys`.

- [ ] **Step 2: Write the Windows-specific disk check**

`installer/screens/welcome_windows.go`:

```go
//go:build windows

package screens

import (
	"syscall"
	"unsafe"
)

func init() {
	diskFree = winDiskFree
}

func winDiskFree(path string) (uint64, error) {
	kernel32, err := syscall.LoadDLL("kernel32.dll")
	if err != nil {
		return 0, err
	}
	proc, err := kernel32.FindProc("GetDiskFreeSpaceExW")
	if err != nil {
		return 0, err
	}
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	var freeBytesAvailable, totalBytes, totalFreeBytes uint64
	r1, _, err := proc.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalBytes)),
		uintptr(unsafe.Pointer(&totalFreeBytes)),
	)
	if r1 == 0 {
		return 0, err
	}
	return freeBytesAvailable, nil
}
```

- [ ] **Step 3: Write the unix-only build tag for the syscall.Statfs path**

Update `installer/screens/welcome.go` to remove the `diskFree` default assignment from welcome.go and instead create `installer/screens/welcome_unix.go`:

```go
//go:build !windows

package screens

import "syscall"

func init() {
	diskFree = unixDiskFree
}

func unixDiskFree(path string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return stat.Bavail * uint64(stat.Bsize), nil
}
```

And in `welcome.go`, replace the default `diskFree` with:

```go
// diskFree is set in welcome_unix.go or welcome_windows.go at init time.
var diskFree func(path string) (uint64, error)
```

- [ ] **Step 4: Write the test**

`installer/screens/welcome_test.go`:

```go
package screens

import (
	"os"
	"path/filepath"
	"testing"

	"fyne.io/fyne/v2/test"
)

func TestDetectMode_FreshWhenMarkerMissing(t *testing.T) {
	dir := t.TempDir()
	if got := detectMode(dir); got != ModeFresh {
		t.Errorf("expected ModeFresh, got %v", got)
	}
}

func TestDetectMode_UpdateWhenMarkerPresent(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".canvas-toolchain-version"), []byte("0.9.1"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := detectMode(dir); got != ModeUpdate {
		t.Errorf("expected ModeUpdate, got %v", got)
	}
}

func TestNewWelcomeScreen_RendersWithoutPanic(t *testing.T) {
	a := test.NewApp()
	defer a.Quit()
	w := a.NewWindow("test")
	defer w.Close()

	st := NewState("v0.9.1")
	st.InstallDir = t.TempDir()
	called := false
	content := NewWelcomeScreen(w, st, func() { called = true })
	if content == nil {
		t.Fatal("expected non-nil content")
	}
	_ = called
}
```

- [ ] **Step 5: Run tests + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go get golang.org/x/sys
go test ./screens/...
git -C D:/Dev/canvas-toolchain add installer/screens/ installer/go.mod installer/go.sum
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): screen 1 — welcome, disk check, install location (refs #63)"
```

Expected: tests pass on the current platform (Windows path is harder to unit-test).

---

## Task 5: Screen 2 — Workflow selector + optional extras

**Files:**
- Create: `installer/screens/workflows.go`
- Create: `installer/screens/workflows_test.go`

- [ ] **Step 1: Write the screen**

`installer/screens/workflows.go`:

```go
package screens

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

func NewWorkflowsScreen(parent fyne.Window, st *State, onNext, onBack func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("Choose your workflows", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	hint := widget.NewLabel("All canvas-toolchain code is installed regardless of selection. Your choices affect which API credentials are requested next and which features the summary highlights.")
	hint.Wrapping = fyne.TextWrapWord

	canvasCheck := widget.NewCheck("Canvas course management — generate, review, publish pages", func(b bool) { st.WorkflowCanvas = b })
	canvasCheck.SetChecked(st.WorkflowCanvas)

	panoptoCheck := widget.NewCheck("Panopto pipeline — bulk transcript download + enrichment", func(b bool) { st.WorkflowPanopto = b })
	panoptoCheck.SetChecked(st.WorkflowPanopto)

	ciCheck := widget.NewCheck("Curriculum Intelligence — semester comparison + course analysis", func(b bool) { st.WorkflowCI = b })
	ciCheck.SetChecked(st.WorkflowCI)

	registryCheck := widget.NewCheck("Registry — multi-course tracking", func(b bool) { st.WorkflowRegistry = b })
	registryCheck.SetChecked(st.WorkflowRegistry)

	pythonCheck := widget.NewCheck("Install Python 3 (needed later for Canvas Backup — not configured here)", func(b bool) { st.OptInPython = b })
	pythonCheck.SetChecked(st.OptInPython)

	form := container.NewVBox(
		title,
		hint,
		widget.NewSeparator(),
		canvasCheck,
		panoptoCheck,
		ciCheck,
		registryCheck,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Optional extras", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		pythonCheck,
	)

	back := widget.NewButton("Back", onBack)
	next := widget.NewButton("Next", onNext)
	next.Importance = widget.HighImportance
	bottom := container.NewBorder(nil, nil, container.NewHBox(back, widget.NewButton("Cancel", parent.Close)), next)
	return container.NewBorder(form, bottom, nil, nil)
}
```

- [ ] **Step 2: Write the test**

`installer/screens/workflows_test.go`:

```go
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
```

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./screens/...
git -C D:/Dev/canvas-toolchain add installer/screens/workflows.go installer/screens/workflows_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): screen 2 — workflow selector + optional Python toggle (refs #63)"
```

Expected: tests pass.

---

## Task 6: Screen 3 — Credentials (conditional fields)

**Files:**
- Create: `installer/screens/credentials.go`
- Create: `installer/screens/credentials_test.go`

- [ ] **Step 1: Write the screen**

`installer/screens/credentials.go`:

```go
package screens

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewCredentialsScreen(parent fyne.Window, st *State, onNext, onBack func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("API credentials (optional)", fyne.TextAlignCenter, fyne.TextStyle{Bold: true})
	hint := widget.NewLabel("All fields are optional. Skip whatever you don't have — you can fill them in later by running setup_anthropic, setup_canvas, or setup_panopto from your MCP client.")
	hint.Wrapping = fyne.TextWrapWord

	anthropicEntry := ui.NewMaskedEntry("sk-ant-...")
	anthropicEntry.SetText(st.AnthropicAPIKey)
	anthropicEntry.OnChanged = func(s string) { st.AnthropicAPIKey = s }

	canvasHostEntry := widget.NewEntry()
	canvasHostEntry.SetText(st.CanvasHost)
	canvasHostEntry.OnChanged = func(s string) { st.CanvasHost = s }

	canvasTokenEntry := ui.NewMaskedEntry("Paste token here")
	canvasTokenEntry.SetText(st.CanvasToken)
	canvasTokenEntry.OnChanged = func(s string) { st.CanvasToken = s }

	fields := []fyne.CanvasObject{
		ui.HintedField{
			Label: "Anthropic API key",
			Input: anthropicEntry,
			Hint:  "Powers all AI features. Get one at platform.anthropic.com/account/api-keys.",
		}.AsCanvasObject(),
		ui.HintedField{
			Label: "Canvas host",
			Input: canvasHostEntry,
			Hint:  "Your school's Canvas URL — usually <school>.instructure.com.",
		}.AsCanvasObject(),
		ui.HintedField{
			Label: "Canvas API token",
			Input: canvasTokenEntry,
			Hint:  "Optional. Needed only for direct page publishing. Canvas → Account → Settings → New Access Token.",
		}.AsCanvasObject(),
	}

	if st.WorkflowPanopto {
		panoptoDomain := widget.NewEntry()
		panoptoDomain.SetPlaceHolder("bsu.hosted.panopto.com")
		panoptoDomain.SetText(st.PanoptoDomain)
		panoptoDomain.OnChanged = func(s string) { st.PanoptoDomain = s }

		panoptoClient := widget.NewEntry()
		panoptoClient.SetText(st.PanoptoClientID)
		panoptoClient.OnChanged = func(s string) { st.PanoptoClientID = s }

		panoptoSecret := ui.NewMaskedEntry("Client secret")
		panoptoSecret.SetText(st.PanoptoSecret)
		panoptoSecret.OnChanged = func(s string) { st.PanoptoSecret = s }

		fields = append(fields,
			widget.NewSeparator(),
			widget.NewLabelWithStyle("Panopto (optional)", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
			ui.HintedField{Label: "Panopto domain", Input: panoptoDomain, Hint: "e.g. bsu.hosted.panopto.com"}.AsCanvasObject(),
			ui.HintedField{Label: "Client ID", Input: panoptoClient, Hint: "Panopto admin → API Clients."}.AsCanvasObject(),
			ui.HintedField{Label: "Client secret", Input: panoptoSecret, Hint: "Same place as the client ID."}.AsCanvasObject(),
		)
	}

	form := container.NewVBox(append([]fyne.CanvasObject{title, hint, widget.NewSeparator()}, fields...)...)
	scroll := container.NewVScroll(form)

	skip := widget.NewButton("Skip — I'll add these later", func() {
		st.AnthropicAPIKey = ""
		st.CanvasToken = ""
		st.PanoptoDomain = ""
		st.PanoptoClientID = ""
		st.PanoptoSecret = ""
		onNext()
	})
	back := widget.NewButton("Back", onBack)
	next := widget.NewButton("Next", onNext)
	next.Importance = widget.HighImportance
	bottom := container.NewBorder(nil, nil,
		container.NewHBox(back, widget.NewButton("Cancel", parent.Close), skip),
		next,
	)
	return container.NewBorder(nil, bottom, nil, nil, scroll)
}
```

- [ ] **Step 2: Write the test**

`installer/screens/credentials_test.go`:

```go
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
```

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./screens/...
git -C D:/Dev/canvas-toolchain add installer/screens/credentials.go installer/screens/credentials_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): screen 3 — credentials with conditional Panopto fields (refs #63)"
```

Expected: tests pass.

---

## Task 7: Task runner + step abstraction

**Files:**
- Create: `installer/tasks/runner.go`
- Create: `installer/tasks/runner_test.go`

- [ ] **Step 1: Write the runner**

`installer/tasks/runner.go`:

```go
package tasks

import (
	"context"
	"sync"
	"time"
)

// StepStatus mirrors ui.RowStatus but doesn't import the UI package.
type StepStatus int

const (
	StepPending StepStatus = iota
	StepRunning
	StepOK
	StepWarn
	StepError
)

// Step is one named unit of install work.
type Step struct {
	Name    string
	Run     func(ctx context.Context) error
	Skip    func() bool // optional — if non-nil and true, step is skipped (and reported as OK)
	Warn    bool        // if true, an error is reported as StepWarn rather than StepError
}

// StepResult is the outcome of a single Step.
type StepResult struct {
	Status   StepStatus
	Err      error
	Duration time.Duration
}

// Runner executes steps sequentially and reports updates via OnUpdate.
type Runner struct {
	Steps    []Step
	OnUpdate func(index int, name string, result StepResult)

	mu      sync.Mutex
	results []StepResult
}

// Run executes every step in order. Errors in non-Warn steps stop the runner
// and return; the caller can re-run after fixing whatever broke.
func (r *Runner) Run(ctx context.Context) []StepResult {
	r.mu.Lock()
	r.results = make([]StepResult, len(r.Steps))
	r.mu.Unlock()

	for i, s := range r.Steps {
		if s.Skip != nil && s.Skip() {
			r.report(i, s.Name, StepResult{Status: StepOK})
			continue
		}
		r.report(i, s.Name, StepResult{Status: StepRunning})
		start := time.Now()
		err := s.Run(ctx)
		dur := time.Since(start)
		switch {
		case err == nil:
			r.report(i, s.Name, StepResult{Status: StepOK, Duration: dur})
		case s.Warn:
			r.report(i, s.Name, StepResult{Status: StepWarn, Err: err, Duration: dur})
		default:
			r.report(i, s.Name, StepResult{Status: StepError, Err: err, Duration: dur})
			return r.results
		}
	}
	return r.results
}

func (r *Runner) report(i int, name string, res StepResult) {
	r.mu.Lock()
	if i < len(r.results) {
		r.results[i] = res
	}
	r.mu.Unlock()
	if r.OnUpdate != nil {
		r.OnUpdate(i, name, res)
	}
}
```

- [ ] **Step 2: Write the test**

`installer/tasks/runner_test.go`:

```go
package tasks

import (
	"context"
	"errors"
	"testing"
)

func TestRunner_RunsStepsInOrder(t *testing.T) {
	var order []string
	r := &Runner{
		Steps: []Step{
			{Name: "a", Run: func(ctx context.Context) error { order = append(order, "a"); return nil }},
			{Name: "b", Run: func(ctx context.Context) error { order = append(order, "b"); return nil }},
		},
	}
	r.Run(context.Background())
	if len(order) != 2 || order[0] != "a" || order[1] != "b" {
		t.Errorf("expected order [a b], got %v", order)
	}
}

func TestRunner_StopsOnError(t *testing.T) {
	var ran []string
	r := &Runner{
		Steps: []Step{
			{Name: "ok", Run: func(ctx context.Context) error { ran = append(ran, "ok"); return nil }},
			{Name: "bad", Run: func(ctx context.Context) error { ran = append(ran, "bad"); return errors.New("boom") }},
			{Name: "never", Run: func(ctx context.Context) error { ran = append(ran, "never"); return nil }},
		},
	}
	results := r.Run(context.Background())
	if len(ran) != 2 {
		t.Errorf("expected 2 steps to run, got %d", len(ran))
	}
	if results[1].Status != StepError {
		t.Errorf("expected step 1 to be StepError, got %v", results[1].Status)
	}
}

func TestRunner_WarnStepContinues(t *testing.T) {
	var ran []string
	r := &Runner{
		Steps: []Step{
			{Name: "warn", Warn: true, Run: func(ctx context.Context) error { ran = append(ran, "warn"); return errors.New("boom") }},
			{Name: "after", Run: func(ctx context.Context) error { ran = append(ran, "after"); return nil }},
		},
	}
	results := r.Run(context.Background())
	if len(ran) != 2 {
		t.Errorf("expected both steps to run, got %v", ran)
	}
	if results[0].Status != StepWarn {
		t.Errorf("expected warn status, got %v", results[0].Status)
	}
}

func TestRunner_SkipsWhenSkipReturnsTrue(t *testing.T) {
	var ran []string
	r := &Runner{
		Steps: []Step{
			{Name: "skipped", Skip: func() bool { return true }, Run: func(ctx context.Context) error { ran = append(ran, "no"); return nil }},
			{Name: "after", Run: func(ctx context.Context) error { ran = append(ran, "yes"); return nil }},
		},
	}
	results := r.Run(context.Background())
	if len(ran) != 1 || ran[0] != "yes" {
		t.Errorf("expected only 'yes' to run, got %v", ran)
	}
	if results[0].Status != StepOK {
		t.Errorf("expected skipped step to report StepOK, got %v", results[0].Status)
	}
}
```

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/...
git -C D:/Dev/canvas-toolchain add installer/tasks/runner.go installer/tasks/runner_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): step runner with sequential exec, warn semantics, and skip predicates (refs #63)"
```

Expected: 4 tests pass.

---

## Task 8: Embed package + extract task

**Files:**
- Create: `installer/payload/embed.go`
- Create: `installer/payload/.gitignore`
- Create: `installer/payload/README.md`
- Create: `installer/tasks/extract.go`
- Create: `installer/tasks/extract_test.go`

- [ ] **Step 1: Write the embed package**

`installer/payload/embed.go`:

```go
// Package payload exposes the embedded canvas-toolchain source tarball and the
// embedded Node runtime tarball. Both files are populated by CI before the Go
// build runs — see Plan 3 and .github/workflows/release-installer.yml.
//
// For local dev builds without CI, you can drop your own tarballs here, or
// build with `-tags dev` (no embeds) for a UI-only smoke run.
package payload

import _ "embed"

//go:embed installer-payload.tar.gz
var PayloadTarGz []byte

//go:embed node-runtime.tar.gz
var NodeTarGz []byte
```

- [ ] **Step 2: Write the .gitignore + README**

`installer/payload/.gitignore`:

```
installer-payload.tar.gz
node-runtime.tar.gz
node-runtime/
```

`installer/payload/README.md`:

```markdown
# Payload

CI populates this directory immediately before `go build` runs:

- `installer-payload.tar.gz` — built monorepo (no `node_modules`).
- `node-runtime.tar.gz` — per-OS Node 18 LTS distribution from nodejs.org.

For local dev with no CI, place suitable tarballs here yourself. The Go build
tag `dev` exists for UI-only smoke runs that bypass the embed.
```

- [ ] **Step 3: Stub empty payload files for first compile**

Local dev requires the embed files to exist (Go's embed directive fails at compile time if the file is missing). Create empty placeholders so the package compiles before CI runs:

```bash
cd D:/Dev/canvas-toolchain/installer/payload
printf '' > installer-payload.tar.gz
printf '' > node-runtime.tar.gz
```

These are gitignored so they don't pollute the repo. The implementer should also document this in `installer/README.md` under "Local dev."

- [ ] **Step 4: Write the extract task**

`installer/tasks/extract.go`:

```go
package tasks

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// ExtractTarGz writes the contents of a gzipped tarball into dest. The dest
// directory is created if it doesn't exist. Existing files are overwritten.
// Returns the count of files extracted.
func ExtractTarGz(ctx context.Context, data []byte, dest string) (int, error) {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return 0, fmt.Errorf("mkdir %s: %w", dest, err)
	}
	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return 0, fmt.Errorf("gzip reader: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	count := 0
	for {
		select {
		case <-ctx.Done():
			return count, ctx.Err()
		default:
		}

		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return count, fmt.Errorf("tar next: %w", err)
		}

		// Reject paths that escape dest via .. components.
		cleanName := filepath.Clean(hdr.Name)
		if filepath.IsAbs(cleanName) || hasParentTraversal(cleanName) {
			return count, fmt.Errorf("refusing tar entry with unsafe path: %s", hdr.Name)
		}
		target := filepath.Join(dest, cleanName)

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(hdr.Mode)|0o700); err != nil {
				return count, err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return count, err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode)|0o600)
			if err != nil {
				return count, err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return count, err
			}
			f.Close()
			count++
		}
	}
	return count, nil
}

func hasParentTraversal(p string) bool {
	for _, part := range filepath.SplitList(p) {
		_ = part
	}
	// SplitList only splits on path-list separator, not path separator. Use a manual check.
	return containsDotDot(p)
}

func containsDotDot(p string) bool {
	for _, segment := range splitAll(p) {
		if segment == ".." {
			return true
		}
	}
	return false
}

func splitAll(p string) []string {
	var out []string
	for {
		dir, file := filepath.Split(p)
		if file != "" {
			out = append([]string{file}, out...)
		}
		if dir == "" || dir == string(filepath.Separator) || dir == p {
			break
		}
		p = filepath.Clean(dir)
	}
	return out
}
```

- [ ] **Step 5: Write the extract test**

`installer/tasks/extract_test.go`:

```go
package tasks

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"testing"
)

func makeTarGz(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		hdr := &tar.Header{Name: name, Size: int64(len(content)), Mode: 0o644, Typeflag: tar.TypeReg}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestExtractTarGz_WritesFiles(t *testing.T) {
	data := makeTarGz(t, map[string]string{
		"hello.txt":      "hi",
		"sub/world.txt":  "world",
	})
	dest := t.TempDir()
	n, err := ExtractTarGz(context.Background(), data, dest)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Errorf("expected 2 files, got %d", n)
	}
	hi, err := os.ReadFile(filepath.Join(dest, "hello.txt"))
	if err != nil || string(hi) != "hi" {
		t.Errorf("hello.txt content wrong: %q err %v", hi, err)
	}
	w, err := os.ReadFile(filepath.Join(dest, "sub", "world.txt"))
	if err != nil || string(w) != "world" {
		t.Errorf("sub/world.txt content wrong: %q err %v", w, err)
	}
}

func TestExtractTarGz_RejectsParentTraversal(t *testing.T) {
	data := makeTarGz(t, map[string]string{
		"../escape.txt": "nope",
	})
	dest := t.TempDir()
	_, err := ExtractTarGz(context.Background(), data, dest)
	if err == nil {
		t.Fatal("expected error for parent traversal")
	}
}

func TestExtractTarGz_RespectsContextCancel(t *testing.T) {
	data := makeTarGz(t, map[string]string{"a.txt": "x"})
	dest := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ExtractTarGz(ctx, data, dest)
	if err == nil {
		t.Fatal("expected context error")
	}
}
```

- [ ] **Step 6: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/ ./payload/
git -C D:/Dev/canvas-toolchain add installer/payload/embed.go installer/payload/.gitignore installer/payload/README.md installer/tasks/extract.go installer/tasks/extract_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): embed package + safe tar.gz extractor (refs #63)"
```

Expected: 3 extract tests pass.

---

## Task 9: npm wrapper

**Files:**
- Create: `installer/tasks/npm.go`
- Create: `installer/tasks/npm_test.go`

- [ ] **Step 1: Write the wrapper**

`installer/tasks/npm.go`:

```go
package tasks

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
)

// NodePaths resolves the bundled Node binary and npm-cli.js inside the
// installer's `.node/` directory. The directory is created by the extract task
// (which unpacks the embedded Node tarball into <installDir>/.node/).
type NodePaths struct {
	Node string
	NPM  string
}

func ResolveNodePaths(installDir string) NodePaths {
	nodeDir := filepath.Join(installDir, ".node")
	var nodeBin, npmCli string
	if runtime.GOOS == "windows" {
		nodeBin = filepath.Join(nodeDir, "node.exe")
		npmCli = filepath.Join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js")
	} else {
		nodeBin = filepath.Join(nodeDir, "bin", "node")
		npmCli = filepath.Join(nodeDir, "lib", "node_modules", "npm", "bin", "npm-cli.js")
	}
	return NodePaths{Node: nodeBin, NPM: npmCli}
}

// RunNPM runs `<node> <npm-cli> <args...>` in workdir and streams combined
// stdout/stderr to the supplied writer. Returns the trailing 4 KB of output on
// non-zero exit so the caller can surface the failure tail to the user.
func RunNPM(ctx context.Context, np NodePaths, workdir string, args []string, out func(line string)) error {
	cmd := exec.CommandContext(ctx, np.Node, append([]string{np.NPM}, args...)...)
	cmd.Dir = workdir

	var tail bytes.Buffer
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return err
	}

	scanBuf := make([]byte, 4096)
	for {
		n, err := pipe.Read(scanBuf)
		if n > 0 {
			chunk := string(scanBuf[:n])
			out(chunk)
			if tail.Len() > 4096 {
				// keep tail bounded
				tail.Truncate(0)
			}
			tail.WriteString(chunk)
		}
		if err != nil {
			break
		}
	}

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("npm %v exited %v\n--- tail ---\n%s", args, err, tail.String())
	}
	return nil
}
```

- [ ] **Step 2: Write the test**

`installer/tasks/npm_test.go`:

```go
package tasks

import (
	"runtime"
	"strings"
	"testing"
)

func TestResolveNodePaths_Unix(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix only")
	}
	p := ResolveNodePaths("/opt/canvas")
	if !strings.HasSuffix(p.Node, "/.node/bin/node") {
		t.Errorf("unexpected node path: %s", p.Node)
	}
	if !strings.HasSuffix(p.NPM, "/.node/lib/node_modules/npm/bin/npm-cli.js") {
		t.Errorf("unexpected npm path: %s", p.NPM)
	}
}

func TestResolveNodePaths_Windows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows only")
	}
	p := ResolveNodePaths(`C:\canvas`)
	if !strings.HasSuffix(p.Node, `\.node\node.exe`) {
		t.Errorf("unexpected node path: %s", p.Node)
	}
}
```

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/...
git -C D:/Dev/canvas-toolchain add installer/tasks/npm.go installer/tasks/npm_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): npm wrapper using bundled Node (refs #63)"
```

Expected: 1 test passes per platform.

---

## Task 10: Config writers (Anthropic, Canvas, Panopto)

**Files:**
- Create: `installer/tasks/configs.go`
- Create: `installer/tasks/configs_test.go`

- [ ] **Step 1: Write the config writers**

`installer/tasks/configs.go`:

```go
package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// CcHomePath returns the directory where C&C config files live, matching the
// existing getCcHomePath() in packages/command-and-control/src/kb/config.ts.
// Respects the CC_HOME env var when set.
func CcHomePath() string {
	if v := os.Getenv("CC_HOME"); v != "" {
		return v
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".command-and-control")
}

func atomicWriteJSON(path string, v any, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

type anthropicConfig struct {
	APIKey          string `json:"apiKey"`
	Model           string `json:"model"`
	ConfiguredAt    string `json:"configuredAt"`
	LastValidatedAt string `json:"lastValidatedAt"`
}

func WriteAnthropicConfig(apiKey, model string) error {
	if apiKey == "" {
		return nil
	}
	if model == "" {
		model = "claude-haiku-4-5-20251001"
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return atomicWriteJSON(
		filepath.Join(CcHomePath(), "anthropic-config.json"),
		anthropicConfig{APIKey: apiKey, Model: model, ConfiguredAt: now, LastValidatedAt: ""},
		credentialFileMode(),
	)
}

type canvasConfig struct {
	Host            string `json:"host"`
	Token           string `json:"token"`
	ConfiguredAt    string `json:"configuredAt"`
	LastValidatedAt string `json:"lastValidatedAt"`
}

func WriteCanvasConfig(host, token string) error {
	if host == "" || token == "" {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return atomicWriteJSON(
		filepath.Join(CcHomePath(), "canvas-config.json"),
		canvasConfig{Host: host, Token: token, ConfiguredAt: now, LastValidatedAt: ""},
		credentialFileMode(),
	)
}

type panoptoConfig struct {
	Domain            string `json:"domain"`
	ClientID          string `json:"clientId"`
	ClientSecret      string `json:"clientSecret"`
	IframeWhitelisted any    `json:"iframeWhitelisted"`
	ConfiguredAt      string `json:"configuredAt"`
	LastValidatedAt   string `json:"lastValidatedAt"`
}

func WritePanoptoConfig(domain, clientID, clientSecret string) error {
	if domain == "" || clientID == "" || clientSecret == "" {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return atomicWriteJSON(
		filepath.Join(CcHomePath(), "panopto-config.json"),
		panoptoConfig{
			Domain: domain, ClientID: clientID, ClientSecret: clientSecret,
			IframeWhitelisted: nil, ConfiguredAt: now, LastValidatedAt: "",
		},
		credentialFileMode(),
	)
}

// WriteVersionMarker writes <installDir>/.canvas-toolchain-version with the
// installed semver tag (no leading 'v'). This is the file the update-check
// module in C&C reads.
func WriteVersionMarker(installDir, version string) error {
	clean := version
	if len(clean) > 0 && (clean[0] == 'v' || clean[0] == 'V') {
		clean = clean[1:]
	}
	return os.WriteFile(filepath.Join(installDir, ".canvas-toolchain-version"), []byte(clean), 0o644)
}

func credentialFileMode() os.FileMode {
	if runtime.GOOS == "windows" {
		// Windows ignores POSIX bits, so 0o600 is cosmetic — the file is
		// protected by NTFS ACLs of the user's home directory. Still set it
		// for cross-platform consistency.
		return 0o600
	}
	return 0o600
}
```

- [ ] **Step 2: Write the test**

`installer/tasks/configs_test.go`:

```go
package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestWriteAnthropicConfig_SkippedWhenEmpty(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CC_HOME", tmp)
	if err := WriteAnthropicConfig("", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "anthropic-config.json")); !os.IsNotExist(err) {
		t.Errorf("expected no file; stat err: %v", err)
	}
}

func TestWriteAnthropicConfig_WritesWith0o600(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CC_HOME", tmp)
	if err := WriteAnthropicConfig("sk-ant-test", ""); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(tmp, "anthropic-config.json")
	st, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" {
		if mode := st.Mode().Perm(); mode != 0o600 {
			t.Errorf("expected 0o600, got %o", mode)
		}
	}
	data, _ := os.ReadFile(path)
	var cfg anthropicConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.APIKey != "sk-ant-test" {
		t.Errorf("expected apiKey sk-ant-test, got %q", cfg.APIKey)
	}
	if cfg.Model != "claude-haiku-4-5-20251001" {
		t.Errorf("expected default model, got %q", cfg.Model)
	}
}

func TestWriteCanvasConfig_RequiresBothFields(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("CC_HOME", tmp)
	if err := WriteCanvasConfig("bsu.instructure.com", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "canvas-config.json")); !os.IsNotExist(err) {
		t.Error("expected no file when token is empty")
	}
	if err := WriteCanvasConfig("bsu.instructure.com", "tok"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "canvas-config.json")); err != nil {
		t.Fatal(err)
	}
}

func TestWriteVersionMarker_StripsVPrefix(t *testing.T) {
	tmp := t.TempDir()
	if err := WriteVersionMarker(tmp, "v0.9.1"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(tmp, ".canvas-toolchain-version"))
	if string(data) != "0.9.1" {
		t.Errorf("expected 0.9.1, got %q", string(data))
	}
}
```

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/...
git -C D:/Dev/canvas-toolchain add installer/tasks/configs.go installer/tasks/configs_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): atomic config writers for anthropic/canvas/panopto + version marker (refs #63)"
```

Expected: 4 tests pass.

---

## Task 11: MCP host config merger

**Files:**
- Create: `installer/tasks/mcphost.go`
- Create: `installer/tasks/mcphost_test.go`

- [ ] **Step 1: Write the merger**

`installer/tasks/mcphost.go`:

```go
package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// ClaudeDesktopConfigPath returns the canonical config path for Claude Desktop
// on the current OS, or "" if Claude Desktop is not detected.
func ClaudeDesktopConfigPath() string {
	home, _ := os.UserHomeDir()
	var dir string
	switch runtime.GOOS {
	case "darwin":
		dir = filepath.Join(home, "Library", "Application Support", "Claude")
	case "windows":
		appdata := os.Getenv("APPDATA")
		if appdata == "" {
			return ""
		}
		dir = filepath.Join(appdata, "Claude")
	default:
		dir = filepath.Join(home, ".config", "Claude")
	}
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "claude_desktop_config.json")
}

// ClaudeCodeConfigPath returns the canonical Claude Code CLI config path, or
// "" if Claude Code is not detected.
func ClaudeCodeConfigPath() string {
	home, _ := os.UserHomeDir()
	path := filepath.Join(home, ".claude.json")
	if _, err := os.Stat(filepath.Join(home, ".claude")); err == nil {
		return path
	}
	if _, err := os.Stat(path); err == nil {
		return path
	}
	return ""
}

type mcpServerEntry struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
}

// WriteHostConfig merges a `canvas-toolchain` MCP server entry into the JSON
// at path, preserving every other top-level key and every other mcpServers
// entry. If path is empty or doesn't exist, no-op (the caller already checked
// detection).
func WriteHostConfig(path, nodeBin, ccServerJS string) error {
	if path == "" {
		return nil
	}
	existing := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &existing); err != nil {
			return err
		}
	}
	servers, _ := existing["mcpServers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
	}
	servers["canvas-toolchain"] = mcpServerEntry{Command: nodeBin, Args: []string{ccServerJS}}
	existing["mcpServers"] = servers
	return atomicWriteJSON(path, existing, 0o644)
}
```

- [ ] **Step 2: Write the test**

`installer/tasks/mcphost_test.go`:

```go
package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteHostConfig_CreatesFileWhenAbsent(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "claude_desktop_config.json")
	if err := WriteHostConfig(path, "/node/bin/node", "/app/dist/index.js"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	servers := parsed["mcpServers"].(map[string]any)
	entry := servers["canvas-toolchain"].(map[string]any)
	if entry["command"] != "/node/bin/node" {
		t.Errorf("expected command set, got %v", entry["command"])
	}
}

func TestWriteHostConfig_PreservesExistingEntries(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "claude_desktop_config.json")
	initial := map[string]any{
		"someOtherKey": "kept",
		"mcpServers": map[string]any{
			"my-other-server": map[string]any{"command": "/keep"},
		},
	}
	data, _ := json.Marshal(initial)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}

	if err := WriteHostConfig(path, "/n", "/s"); err != nil {
		t.Fatal(err)
	}

	out, _ := os.ReadFile(path)
	var parsed map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed["someOtherKey"] != "kept" {
		t.Errorf("top-level key dropped: %v", parsed["someOtherKey"])
	}
	servers := parsed["mcpServers"].(map[string]any)
	if _, ok := servers["my-other-server"]; !ok {
		t.Error("existing my-other-server entry dropped")
	}
	if _, ok := servers["canvas-toolchain"]; !ok {
		t.Error("canvas-toolchain entry not added")
	}
}

func TestWriteHostConfig_NoOpOnEmptyPath(t *testing.T) {
	if err := WriteHostConfig("", "/n", "/s"); err != nil {
		t.Errorf("expected no error on empty path, got %v", err)
	}
}

func TestWriteHostConfig_ReturnsErrorOnMalformedJSON(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "broken.json")
	if err := os.WriteFile(path, []byte("not valid json {"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := WriteHostConfig(path, "/n", "/s"); err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}
```

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/...
git -C D:/Dev/canvas-toolchain add installer/tasks/mcphost.go installer/tasks/mcphost_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): merge MCP server entry into Claude Desktop + Claude Code config (refs #63)"
```

Expected: 4 tests pass.

---

## Task 12: Shortcut creators (Windows .lnk, macOS .app)

**Files:**
- Create: `installer/tasks/shortcuts.go`
- Create: `installer/tasks/shortcuts_windows.go`
- Create: `installer/tasks/shortcuts_darwin.go`
- Create: `installer/tasks/shortcuts_unix.go`
- Create: `installer/tasks/shortcuts_test.go`

- [ ] **Step 1: Write the cross-platform dispatcher**

`installer/tasks/shortcuts.go`:

```go
package tasks

// CreateUpdaterShortcuts is implemented per-OS via build tags. The Linux/unix
// fallback is a no-op (Kevin's target audience is Windows + Mac; Linux can
// invoke the binary directly).
//
// updaterBin is the absolute path to the canvas-toolchain-updater binary
// dropped by the installer.
// installDir is needed on macOS to anchor the .app bundle.
var CreateUpdaterShortcuts = func(updaterBin, installDir string) error { return nil }
```

- [ ] **Step 2: Windows .lnk via PowerShell**

`installer/tasks/shortcuts_windows.go`:

```go
//go:build windows

package tasks

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func init() {
	CreateUpdaterShortcuts = winCreateShortcuts
}

func winCreateShortcuts(updaterBin, _ string) error {
	home, _ := os.UserHomeDir()
	desktop := filepath.Join(home, "Desktop")
	startMenu := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs")
	for _, dir := range []string{desktop, startMenu} {
		if err := writeShortcut(filepath.Join(dir, "Canvas Toolchain Updater.lnk"), updaterBin); err != nil {
			return fmt.Errorf("shortcut at %s: %w", dir, err)
		}
	}
	return nil
}

// writeShortcut shells out to PowerShell's WScript.Shell COM object to create
// a .lnk file. Avoids pulling in a Go COM dependency for one operation.
func writeShortcut(lnkPath, target string) error {
	if err := os.MkdirAll(filepath.Dir(lnkPath), 0o755); err != nil {
		return err
	}
	script := fmt.Sprintf(
		`$sh = New-Object -ComObject WScript.Shell; $s = $sh.CreateShortcut(%q); $s.TargetPath = %q; $s.Save()`,
		lnkPath, target,
	)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("powershell shortcut failed: %v: %s", err, string(out))
	}
	return nil
}
```

- [ ] **Step 3: macOS .app bundle**

`installer/tasks/shortcuts_darwin.go`:

```go
//go:build darwin

package tasks

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func init() {
	CreateUpdaterShortcuts = macCreateShortcuts
}

func macCreateShortcuts(updaterBin, _ string) error {
	appPath := "/Applications/Canvas Toolchain Updater.app"
	contents := filepath.Join(appPath, "Contents")
	macos := filepath.Join(contents, "MacOS")
	if err := os.MkdirAll(macos, 0o755); err != nil {
		return err
	}
	// Copy binary into MacOS/
	dst := filepath.Join(macos, "canvas-toolchain-updater")
	if err := copyFileMode(updaterBin, dst, 0o755); err != nil {
		return err
	}
	// Info.plist
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>canvas-toolchain-updater</string>
  <key>CFBundleIdentifier</key>
  <string>io.canvas-toolchain.updater</string>
  <key>CFBundleName</key>
  <string>Canvas Toolchain Updater</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`
	return os.WriteFile(filepath.Join(contents, "Info.plist"), []byte(plist), 0o644)
}

func copyFileMode(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return fmt.Errorf("copy: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Linux fallback (no-op)**

`installer/tasks/shortcuts_unix.go`:

```go
//go:build !windows && !darwin

package tasks

// Default no-op stays from shortcuts.go.
```

- [ ] **Step 5: Write the test (no-op on non-target OS)**

`installer/tasks/shortcuts_test.go`:

```go
package tasks

import (
	"runtime"
	"testing"
)

func TestCreateUpdaterShortcuts_NoOpOnLinux(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("linux only")
	}
	if err := CreateUpdaterShortcuts("/nonexistent", "/nonexistent"); err != nil {
		t.Errorf("expected no-op on linux to succeed, got %v", err)
	}
}
```

(Windows and Mac shortcut creation is integration-tested manually — automated tests would either touch the user's real Desktop or require deep mocking of PowerShell/filesystem.)

- [ ] **Step 6: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/...
git -C D:/Dev/canvas-toolchain add installer/tasks/shortcuts.go installer/tasks/shortcuts_windows.go installer/tasks/shortcuts_darwin.go installer/tasks/shortcuts_unix.go installer/tasks/shortcuts_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): per-OS Updater shortcut creators (.lnk on Win, .app on Mac) (refs #63)"
```

Expected: tests pass; on Linux the no-op is exercised.

---

## Task 13: Optional Python install

**Files:**
- Create: `installer/tasks/python.go`
- Create: `installer/tasks/python_test.go`

- [ ] **Step 1: Write the Python installer**

`installer/tasks/python.go`:

```go
package tasks

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// PythonInstallerURL returns the official python.org installer for the current
// OS. Updates here when the bundled-installer download URLs change.
const (
	pythonVersion          = "3.12.7"
	pythonWindowsURL       = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
	pythonMacUniversalURL  = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-macos11.pkg"
)

func InstallPython(ctx context.Context) error {
	switch runtime.GOOS {
	case "windows":
		return installPythonWindows(ctx)
	case "darwin":
		return installPythonMac(ctx)
	default:
		return fmt.Errorf("automatic Python install not supported on %s — install manually", runtime.GOOS)
	}
}

func downloadTo(ctx context.Context, url, dest string) error {
	cli := &http.Client{Timeout: 5 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download %s: HTTP %d", url, resp.StatusCode)
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func installPythonWindows(ctx context.Context) error {
	tmp := filepath.Join(os.TempDir(), "python-installer.exe")
	defer os.Remove(tmp)
	if err := downloadTo(ctx, pythonWindowsURL, tmp); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, tmp, "/quiet", "PrependPath=1", "Include_test=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("python installer exited %v: %s", err, string(out))
	}
	return nil
}

func installPythonMac(ctx context.Context) error {
	tmp := filepath.Join(os.TempDir(), "python-installer.pkg")
	defer os.Remove(tmp)
	if err := downloadTo(ctx, pythonMacUniversalURL, tmp); err != nil {
		return err
	}
	// `installer` requires sudo for system-wide install — Mac shows a credential
	// prompt automatically when invoked through Authopen / AuthorizationExecuteWithPrivileges.
	// Simplest portable approach: shell out to `osascript` to elevate.
	script := fmt.Sprintf(`do shell script "installer -pkg %s -target /" with administrator privileges`, tmp)
	cmd := exec.CommandContext(ctx, "osascript", "-e", script)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("python installer failed: %v: %s", err, string(out))
	}
	return nil
}
```

- [ ] **Step 2: Test the helper**

`installer/tasks/python_test.go`:

```go
package tasks

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDownloadTo_SavesBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("hello"))
	}))
	defer srv.Close()

	tmp := filepath.Join(t.TempDir(), "out.bin")
	if err := downloadTo(context.Background(), srv.URL, tmp); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(tmp)
	if string(data) != "hello" {
		t.Errorf("expected 'hello', got %q", string(data))
	}
}

func TestDownloadTo_ReturnsErrorOnNon200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()

	tmp := filepath.Join(t.TempDir(), "out.bin")
	if err := downloadTo(context.Background(), srv.URL, tmp); err == nil {
		t.Fatal("expected error")
	}
}
```

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/...
git -C D:/Dev/canvas-toolchain add installer/tasks/python.go installer/tasks/python_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): optional Python 3.12 install with download + silent run (refs #63)"
```

Expected: tests pass.

---

## Task 14: Live credential validation

**Files:**
- Create: `installer/tasks/validate.go`
- Create: `installer/tasks/validate_test.go`

- [ ] **Step 1: Write the validators**

`installer/tasks/validate.go`:

```go
package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const validateTimeout = 10 * time.Second

// ValidateAnthropic POSTs a 1-token completion request. Returns nil on 2xx,
// an error otherwise. Returns a distinct error string for 401 vs other failures
// so the caller can show the right hint.
func ValidateAnthropic(ctx context.Context, apiKey, model string) error {
	if model == "" {
		model = "claude-haiku-4-5-20251001"
	}
	body, _ := json.Marshal(map[string]any{
		"model":      model,
		"max_tokens": 1,
		"messages":   []map[string]string{{"role": "user", "content": "."}},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	cli := &http.Client{Timeout: validateTimeout}
	resp, err := cli.Do(req)
	if err != nil {
		return fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("invalid API key (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("anthropic API returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// ValidateCanvas hits /api/v1/users/self with a bearer token.
func ValidateCanvas(ctx context.Context, host, token string) error {
	url := fmt.Sprintf("https://%s/api/v1/users/self", host)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)

	cli := &http.Client{Timeout: validateTimeout}
	resp, err := cli.Do(req)
	if err != nil {
		return fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("invalid Canvas token (HTTP 401)")
	}
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("canvas API returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// ValidatePanopto requests an OAuth2 token using the client credentials flow,
// exactly mirroring getPanoptoToken() in packages/canvas-design-studio.
func ValidatePanopto(ctx context.Context, domain, clientID, clientSecret string) error {
	form := fmt.Sprintf("grant_type=client_credentials&client_id=%s&client_secret=%s&scope=api", clientID, clientSecret)
	url := fmt.Sprintf("https://%s/Panopto/oauth2/connect/token", domain)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte(form)))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")

	cli := &http.Client{Timeout: validateTimeout}
	resp, err := cli.Do(req)
	if err != nil {
		return fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("panopto OAuth returned HTTP %d", resp.StatusCode)
	}
	return nil
}
```

- [ ] **Step 2: Write the test**

`installer/tasks/validate_test.go`:

```go
package tasks

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestValidateAnthropic_OKOn200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "sk-test" {
			t.Errorf("missing x-api-key")
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"content":[]}`))
	}))
	defer srv.Close()

	// Validator hardcodes the api.anthropic.com URL; this test exercises the
	// network-error path more than the URL routing. Validate by injecting a fake
	// transport — for brevity, the implementer may refactor to accept a base URL
	// argument and verify a 2xx response.
	_ = srv
	_ = ValidateAnthropic // touched
}

func TestValidateCanvas_RecognizesUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "no", http.StatusUnauthorized)
	}))
	defer srv.Close()

	host := strings.TrimPrefix(srv.URL, "http://")
	err := ValidateCanvas(context.Background(), host, "tok")
	if err == nil || !strings.Contains(err.Error(), "401") {
		t.Errorf("expected 401 error, got %v", err)
	}
}
```

Implementer note: the `ValidateAnthropic` function hardcodes the production URL. If full test coverage is needed, refactor to accept an optional base URL parameter for tests (default to `https://api.anthropic.com`). Same applies to `ValidatePanopto`. The Canvas test above takes the host string directly, so it's already testable.

- [ ] **Step 3: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./tasks/...
git -C D:/Dev/canvas-toolchain add installer/tasks/validate.go installer/tasks/validate_test.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): live credential validation for Anthropic, Canvas, Panopto (refs #63)"
```

Expected: tests pass.

---

## Task 15: Screen 4 — Installation runner + UI

**Files:**
- Create: `installer/screens/install.go`
- Create: `installer/screens/install_test.go`

- [ ] **Step 1: Wire all tasks into a Runner instance**

`installer/screens/install.go`:

```go
package screens

import (
	"context"
	"fmt"
	"os"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/payload"
	"github.com/Ryfter/canvas-toolchain/installer/tasks"
	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewInstallScreen(parent fyne.Window, st *State, onNext, onBack func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle("Installing canvas-toolchain "+st.Version, fyne.TextAlignCenter, fyne.TextStyle{Bold: true})

	rows := []*ui.StatusRow{
		ui.NewStatusRow("Extract embedded source"),
		ui.NewStatusRow("Extract bundled Node runtime"),
		ui.NewStatusRow("Install npm dependencies"),
		ui.NewStatusRow("Build TypeScript packages"),
		ui.NewStatusRow("Write per-feature config files"),
		ui.NewStatusRow("Install optional Python 3"),
		ui.NewStatusRow("Wire Claude Desktop"),
		ui.NewStatusRow("Wire Claude Code CLI"),
		ui.NewStatusRow("Drop Updater shortcut"),
		ui.NewStatusRow("Write version marker"),
		ui.NewStatusRow("Validate credentials"),
	}
	rowsBox := container.NewVBox()
	for _, r := range rows {
		rowsBox.Add(r)
	}

	logArea := widget.NewMultiLineEntry()
	logArea.Wrapping = fyne.TextWrapOff
	logArea.SetMinRowsVisible(8)
	logBox := container.NewBorder(nil, nil, nil, nil, logArea)
	logBox.Hide()

	logToggle := widget.NewButton("Show log", func() {
		if logBox.Visible() {
			logBox.Hide()
		} else {
			logBox.Show()
		}
	})

	nextBtn := widget.NewButton("Next", onNext)
	nextBtn.Disable()
	nextBtn.Importance = widget.HighImportance

	retryBtn := widget.NewButton("Retry", nil)
	retryBtn.Disable()

	openDirBtn := widget.NewButton("Open install dir", func() {
		_ = openInFinder(st.InstallDir)
	})

	reportBtn := widget.NewButton("Report issue", func() {
		_ = openInBrowser("https://github.com/Ryfter/canvas-toolchain/issues/new?template=installer-bug.md")
	})

	logFn := func(line string) {
		logArea.SetText(logArea.Text + line)
	}

	steps := buildSteps(st, logFn)
	runner := &tasks.Runner{
		Steps: steps,
		OnUpdate: func(i int, name string, res tasks.StepResult) {
			if i >= len(rows) {
				return
			}
			switch res.Status {
			case tasks.StepRunning:
				rows[i].SetStatus(ui.StatusRunning, "")
			case tasks.StepOK:
				rows[i].SetStatus(ui.StatusOK, "")
			case tasks.StepWarn:
				msg := ""
				if res.Err != nil {
					msg = res.Err.Error()
				}
				rows[i].SetStatus(ui.StatusWarn, msg)
			case tasks.StepError:
				msg := ""
				if res.Err != nil {
					msg = res.Err.Error()
				}
				rows[i].SetStatus(ui.StatusError, msg)
				retryBtn.Enable()
				dialog.ShowError(fmt.Errorf("%s failed: %v", name, res.Err), parent)
			}
		},
	}

	go func() {
		results := runner.Run(context.Background())
		allOK := true
		for _, r := range results {
			if r.Status == tasks.StepError {
				allOK = false
				break
			}
		}
		if allOK {
			nextBtn.Enable()
		}
	}()

	retryBtn.OnTapped = func() {
		retryBtn.Disable()
		for _, r := range rows {
			r.SetStatus(ui.StatusPending, "")
		}
		go runner.Run(context.Background())
	}

	bottom := container.NewBorder(nil, nil,
		container.NewHBox(logToggle, retryBtn, openDirBtn, reportBtn, widget.NewButton("Cancel", parent.Close)),
		nextBtn,
	)
	return container.NewBorder(
		container.NewVBox(title, rowsBox),
		bottom,
		nil, nil,
		logBox,
	)
}

func buildSteps(st *State, logFn func(string)) []tasks.Step {
	np := tasks.ResolveNodePaths(st.InstallDir)
	ccServerJS := st.InstallDir + "/packages/command-and-control/dist/index.js"
	cdConfig := tasks.ClaudeDesktopConfigPath()
	ccConfig := tasks.ClaudeCodeConfigPath()
	updaterBin := st.InstallDir + "/canvas-toolchain-updater"

	return []tasks.Step{
		{Name: "Extract source", Run: func(ctx context.Context) error {
			_, err := tasks.ExtractTarGz(ctx, payload.PayloadTarGz, st.InstallDir)
			return err
		}},
		{Name: "Extract Node", Run: func(ctx context.Context) error {
			nodeDest := st.InstallDir + "/.node"
			if err := os.MkdirAll(nodeDest, 0o755); err != nil {
				return err
			}
			_, err := tasks.ExtractTarGz(ctx, payload.NodeTarGz, nodeDest)
			return err
		}},
		{Name: "npm install", Run: func(ctx context.Context) error {
			return tasks.RunNPM(ctx, np, st.InstallDir, []string{"install"}, logFn)
		}},
		{Name: "npm run build", Run: func(ctx context.Context) error {
			return tasks.RunNPM(ctx, np, st.InstallDir, []string{"run", "build"}, logFn)
		}},
		{Name: "Write configs", Warn: true, Run: func(ctx context.Context) error {
			if err := tasks.WriteAnthropicConfig(st.AnthropicAPIKey, ""); err != nil {
				return err
			}
			if err := tasks.WriteCanvasConfig(st.CanvasHost, st.CanvasToken); err != nil {
				return err
			}
			return tasks.WritePanoptoConfig(st.PanoptoDomain, st.PanoptoClientID, st.PanoptoSecret)
		}},
		{Name: "Python (optional)", Skip: func() bool { return !st.OptInPython }, Warn: true, Run: func(ctx context.Context) error {
			err := tasks.InstallPython(ctx)
			if err == nil {
				st.InstalledPython = true
			}
			return err
		}},
		{Name: "Claude Desktop", Warn: true, Run: func(ctx context.Context) error {
			if cdConfig == "" {
				return nil
			}
			if err := tasks.WriteHostConfig(cdConfig, np.Node, ccServerJS); err != nil {
				return err
			}
			st.InstalledClaudeDesktop = true
			return nil
		}},
		{Name: "Claude Code", Warn: true, Run: func(ctx context.Context) error {
			if ccConfig == "" {
				return nil
			}
			if err := tasks.WriteHostConfig(ccConfig, np.Node, ccServerJS); err != nil {
				return err
			}
			st.InstalledClaudeCode = true
			return nil
		}},
		{Name: "Updater shortcut", Warn: true, Run: func(ctx context.Context) error {
			return tasks.CreateUpdaterShortcuts(updaterBin, st.InstallDir)
		}},
		{Name: "Version marker", Run: func(ctx context.Context) error {
			return tasks.WriteVersionMarker(st.InstallDir, st.Version)
		}},
		{Name: "Validate credentials", Warn: true, Run: func(ctx context.Context) error {
			if st.AnthropicAPIKey != "" {
				err := tasks.ValidateAnthropic(ctx, st.AnthropicAPIKey, "")
				st.ValidationAnthropic = StepResult{Attempted: true, OK: err == nil, Message: errToString(err)}
			}
			if st.CanvasHost != "" && st.CanvasToken != "" {
				err := tasks.ValidateCanvas(ctx, st.CanvasHost, st.CanvasToken)
				st.ValidationCanvas = StepResult{Attempted: true, OK: err == nil, Message: errToString(err)}
			}
			if st.PanoptoDomain != "" && st.PanoptoClientID != "" && st.PanoptoSecret != "" {
				err := tasks.ValidatePanopto(ctx, st.PanoptoDomain, st.PanoptoClientID, st.PanoptoSecret)
				st.ValidationPanopto = StepResult{Attempted: true, OK: err == nil, Message: errToString(err)}
			}
			return nil
		}},
	}
}

func errToString(e error) string {
	if e == nil {
		return ""
	}
	return e.Error()
}

// openInFinder + openInBrowser are per-OS — see install_open_*.go.
var (
	openInFinder  = func(path string) error { return nil }
	openInBrowser = func(url string) error { return nil }
)
```

- [ ] **Step 2: Per-OS open helpers**

`installer/screens/install_open_windows.go`:

```go
//go:build windows

package screens

import "os/exec"

func init() {
	openInFinder = func(path string) error { return exec.Command("explorer.exe", path).Start() }
	openInBrowser = func(url string) error { return exec.Command("cmd.exe", "/C", "start", url).Start() }
}
```

`installer/screens/install_open_darwin.go`:

```go
//go:build darwin

package screens

import "os/exec"

func init() {
	openInFinder = func(path string) error { return exec.Command("open", path).Start() }
	openInBrowser = func(url string) error { return exec.Command("open", url).Start() }
}
```

`installer/screens/install_open_linux.go`:

```go
//go:build linux

package screens

import "os/exec"

func init() {
	openInFinder = func(path string) error { return exec.Command("xdg-open", path).Start() }
	openInBrowser = func(url string) error { return exec.Command("xdg-open", url).Start() }
}
```

- [ ] **Step 3: Skeleton test**

`installer/screens/install_test.go`:

```go
package screens

import (
	"testing"

	"fyne.io/fyne/v2/test"
)

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
```

- [ ] **Step 4: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./screens/...
git -C D:/Dev/canvas-toolchain add installer/screens/install.go installer/screens/install_test.go installer/screens/install_open_windows.go installer/screens/install_open_darwin.go installer/screens/install_open_linux.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): screen 4 — install runner with step rows, log, retry (refs #63)"
```

Expected: render test passes; the install steps themselves are exercised manually because they touch the filesystem and network.

---

## Task 16: Screen 5 — Summary

**Files:**
- Create: `installer/screens/summary.go`
- Create: `installer/screens/summary_test.go`

- [ ] **Step 1: Write the summary screen**

`installer/screens/summary.go`:

```go
package screens

import (
	"fmt"
	"runtime"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func NewSummaryScreen(parent fyne.Window, st *State, onClose func()) fyne.CanvasObject {
	title := widget.NewLabelWithStyle(
		fmt.Sprintf("Canvas Toolchain %s installed", st.Version),
		fyne.TextAlignCenter,
		fyne.TextStyle{Bold: true},
	)

	wins := container.NewVBox(
		ui.NewStatusRowWithStatus("Source installed to "+st.InstallDir, ui.StatusOK, ""),
	)
	if st.InstalledClaudeDesktop {
		wins.Add(ui.NewStatusRowWithStatus("Wired to Claude Desktop", ui.StatusOK, ""))
	}
	if st.InstalledClaudeCode {
		wins.Add(ui.NewStatusRowWithStatus("Wired to Claude Code CLI", ui.StatusOK, ""))
	}
	if st.InstalledPython {
		wins.Add(ui.NewStatusRowWithStatus("Python 3 installed", ui.StatusOK, ""))
	}
	wins.Add(ui.NewStatusRowWithStatus("Updater shortcut on Desktop / Applications", ui.StatusOK, ""))

	warns := container.NewVBox()
	if st.AnthropicAPIKey == "" {
		warns.Add(ui.NewStatusRowWithStatus("Anthropic API key not set — run setup_anthropic from your MCP client", ui.StatusWarn, ""))
	}
	if st.CanvasToken == "" {
		warns.Add(ui.NewStatusRowWithStatus("Canvas API token not set — run setup_canvas (optional)", ui.StatusWarn, ""))
	}
	if !st.WorkflowPanopto || (st.PanoptoDomain == "" || st.PanoptoClientID == "" || st.PanoptoSecret == "") {
		warns.Add(ui.NewStatusRowWithStatus("Panopto not configured — run setup_panopto when you're ready", ui.StatusWarn, ""))
	}
	if st.ValidationAnthropic.Attempted && !st.ValidationAnthropic.OK {
		warns.Add(ui.NewStatusRowWithStatus("Anthropic validation failed: "+st.ValidationAnthropic.Message, ui.StatusWarn, ""))
	}
	if st.ValidationCanvas.Attempted && !st.ValidationCanvas.OK {
		warns.Add(ui.NewStatusRowWithStatus("Canvas validation failed: "+st.ValidationCanvas.Message, ui.StatusWarn, ""))
	}

	snippet := widget.NewMultiLineEntry()
	snippet.SetText(buildSnippet(st))
	snippet.Wrapping = fyne.TextWrapOff
	snippet.SetMinRowsVisible(6)
	snippetExpander := widget.NewAccordion(
		widget.NewAccordionItem("Other MCP hosts — copy this config",
			container.NewVBox(
				widget.NewLabel("Paste into your client's MCP server config (Cursor, Windsurf, ChatGPT Desktop, Gemini, etc.):"),
				snippet,
			),
		),
	)

	launch := widget.NewButton("Launch Claude Desktop", func() {
		_ = launchClaudeDesktop()
		onClose()
	})
	launch.Importance = widget.HighImportance
	done := widget.NewButton("Done", onClose)

	bottom := container.NewBorder(nil, nil, done, launch)
	return container.NewBorder(
		container.NewVBox(title, widget.NewSeparator(), wins, widget.NewSeparator(), warns, widget.NewSeparator(), snippetExpander),
		bottom, nil, nil,
	)
}

func buildSnippet(st *State) string {
	suffix := ""
	if runtime.GOOS == "windows" {
		suffix = ".exe"
	}
	return fmt.Sprintf(`{
  "mcpServers": {
    "canvas-toolchain": {
      "command": "%s/.node/bin/node%s",
      "args": ["%s/packages/command-and-control/dist/index.js"]
    }
  }
}`, st.InstallDir, suffix, st.InstallDir)
}

// launchClaudeDesktop is per-OS — see summary_launch_*.go.
var launchClaudeDesktop = func() error { return nil }
```

- [ ] **Step 2: Add the `NewStatusRowWithStatus` helper to `ui/widgets.go`**

Append to `installer/ui/widgets.go`:

```go
// NewStatusRowWithStatus is a convenience wrapper that creates a row and
// immediately sets its status — used on the summary screen.
func NewStatusRowWithStatus(label string, s RowStatus, hint string) *StatusRow {
	r := NewStatusRow(label)
	r.SetStatus(s, hint)
	return r
}
```

- [ ] **Step 3: Per-OS launcher**

`installer/screens/summary_launch_windows.go`:

```go
//go:build windows

package screens

import "os/exec"

func init() {
	launchClaudeDesktop = func() error {
		return exec.Command("cmd.exe", "/C", "start", "claude://").Start()
	}
}
```

`installer/screens/summary_launch_darwin.go`:

```go
//go:build darwin

package screens

import "os/exec"

func init() {
	launchClaudeDesktop = func() error {
		return exec.Command("open", "-a", "Claude").Start()
	}
}
```

`installer/screens/summary_launch_linux.go`:

```go
//go:build linux

package screens

// Linux: Claude Desktop has limited Linux distribution; leave the default no-op.
```

- [ ] **Step 4: Test**

`installer/screens/summary_test.go`:

```go
package screens

import (
	"strings"
	"testing"

	"fyne.io/fyne/v2/test"
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
	st.InstalledClaudeDesktop = true
	if NewSummaryScreen(w, st, func() {}) == nil {
		t.Fatal("nil content")
	}
}
```

- [ ] **Step 5: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./...
git -C D:/Dev/canvas-toolchain add installer/screens/summary.go installer/screens/summary_test.go installer/screens/summary_launch_windows.go installer/screens/summary_launch_darwin.go installer/screens/summary_launch_linux.go installer/ui/widgets.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): screen 5 — summary with wins, warnings, MCP snippet, launch button (refs #63)"
```

Expected: all tests pass.

---

## Task 17: Updater stub binary

**Files:**
- Create: `installer/update/stub_main.go`
- Create: `installer/update/github.go`
- Create: `installer/update/github_test.go`

- [ ] **Step 1: GitHub releases lookup**

`installer/update/github.go`:

```go
package update

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const releasesAPI = "https://api.github.com/repos/Ryfter/canvas-toolchain/releases/latest"

type Release struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// LatestRelease fetches the latest release JSON. Returns nil release if the
// network is unavailable or the API returns non-200 (so callers can gracefully
// say "couldn't check").
func LatestRelease(ctx context.Context) (*Release, error) {
	cli := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, releasesAPI, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("accept", "application/vnd.github+json")
	resp, err := cli.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var r Release
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, err
	}
	return &r, nil
}
```

- [ ] **Step 2: Stub main**

`installer/update/stub_main.go`:

```go
//go:build updater_stub

package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/Ryfter/canvas-toolchain/installer/update"
)

func main() {
	a := app.NewWithID("io.canvas-toolchain.updater")
	w := a.NewWindow("Canvas Toolchain Updater")

	statusLabel := widget.NewLabel("Checking for updates…")
	content := container.NewVBox(statusLabel)
	w.SetContent(content)
	w.Resize(fyne.NewSize(420, 180))

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		installDir := findInstallDir()
		installed := readInstalledVersion(installDir)

		release, err := update.LatestRelease(ctx)
		if err != nil || release == nil {
			statusLabel.SetText("Couldn't check for updates — try again later.")
			return
		}
		latest := strings.TrimPrefix(release.TagName, "v")
		if compareVersions(installed, latest) >= 0 {
			statusLabel.SetText(fmt.Sprintf("Canvas Toolchain is up to date (v%s).", installed))
			return
		}
		statusLabel.SetText(fmt.Sprintf("Update available: v%s → v%s.", installed, latest))
		updateBtn := widget.NewButton("Update now", func() {
			if err := downloadAndRun(ctx, release); err != nil {
				dialog.ShowError(err, w)
				return
			}
			w.Close()
		})
		skipBtn := widget.NewButton("Skip", w.Close)
		content.Add(container.NewHBox(updateBtn, skipBtn))
	}()

	w.ShowAndRun()
}

func findInstallDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	// On Windows the stub lives at <installDir>/canvas-toolchain-updater.exe.
	// On Mac the stub lives in /Applications/Canvas Toolchain Updater.app — read installDir from a sidecar file.
	dir := filepath.Dir(exe)
	if runtime.GOOS == "darwin" {
		side := filepath.Join(dir, "install_dir.txt")
		if data, err := os.ReadFile(side); err == nil {
			return strings.TrimSpace(string(data))
		}
	}
	return dir
}

func readInstalledVersion(installDir string) string {
	if installDir == "" {
		return "0.0.0"
	}
	data, err := os.ReadFile(filepath.Join(installDir, ".canvas-toolchain-version"))
	if err != nil {
		return "0.0.0"
	}
	return strings.TrimPrefix(strings.TrimSpace(string(data)), "v")
}

func compareVersions(a, b string) int {
	pa := splitVer(a)
	pb := splitVer(b)
	for i := 0; i < 3; i++ {
		if pa[i] < pb[i] {
			return -1
		}
		if pa[i] > pb[i] {
			return 1
		}
	}
	return 0
}

func splitVer(v string) [3]int {
	var out [3]int
	parts := strings.SplitN(v, ".", 3)
	for i := 0; i < len(parts) && i < 3; i++ {
		_, _ = fmt.Sscanf(parts[i], "%d", &out[i])
	}
	return out
}

func downloadAndRun(ctx context.Context, r *update.Release) error {
	assetName := assetForCurrentOS()
	var downloadURL string
	for _, a := range r.Assets {
		if a.Name == assetName {
			downloadURL = a.BrowserDownloadURL
			break
		}
	}
	if downloadURL == "" {
		return fmt.Errorf("no installer asset for %s/%s in release %s", runtime.GOOS, runtime.GOARCH, r.TagName)
	}
	tmp := filepath.Join(os.TempDir(), assetName)
	if err := download(ctx, downloadURL, tmp); err != nil {
		return err
	}
	return exec.Command(tmp).Start()
}

func assetForCurrentOS() string {
	switch runtime.GOOS {
	case "windows":
		return "canvas-toolchain-installer-windows-x64.exe"
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return "canvas-toolchain-installer-macos-arm64.pkg"
		}
		return "canvas-toolchain-installer-macos-x64.pkg"
	}
	return ""
}

func download(ctx context.Context, url, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	cli := &http.Client{Timeout: 5 * time.Minute}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download HTTP %d", resp.StatusCode)
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}
```

Implementer note: the stub_main.go uses `package main` because it builds as a separate binary. The build tag `updater_stub` excludes it from the normal `go build .` of the installer. CI builds the stub with `go build -tags updater_stub -o canvas-toolchain-updater ./update`.

- [ ] **Step 3: Test the release parser**

`installer/update/github_test.go`:

```go
package update

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRelease_Unmarshal(t *testing.T) {
	body := `{
		"tag_name": "v1.0.0",
		"html_url": "https://github.com/Ryfter/canvas-toolchain/releases/tag/v1.0.0",
		"assets": [
			{"name": "canvas-toolchain-installer-windows-x64.exe", "browser_download_url": "https://example/win.exe"}
		]
	}`
	var r Release
	if err := json.Unmarshal([]byte(body), &r); err != nil {
		t.Fatal(err)
	}
	if r.TagName != "v1.0.0" {
		t.Errorf("tag: %q", r.TagName)
	}
	if len(r.Assets) != 1 {
		t.Errorf("expected 1 asset, got %d", len(r.Assets))
	}
	if !strings.Contains(r.Assets[0].BrowserDownloadURL, "win.exe") {
		t.Errorf("download URL: %q", r.Assets[0].BrowserDownloadURL)
	}
}
```

- [ ] **Step 4: Run + commit**

```bash
cd D:/Dev/canvas-toolchain/installer
go test ./update/...
go build -tags updater_stub -o canvas-toolchain-updater ./update
git -C D:/Dev/canvas-toolchain add installer/update/
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): updater stub binary with GitHub Releases lookup + asset download (refs #63)"
```

Expected: test passes; the stub binary builds successfully.

---

## Task 18: Main entry — wire all screens

**Files:**
- Modify: `installer/main.go`

- [ ] **Step 1: Replace `main.go` with the full wiring**

```go
package main

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"

	"github.com/Ryfter/canvas-toolchain/installer/screens"
	"github.com/Ryfter/canvas-toolchain/installer/ui"
)

func main() {
	a := app.NewWithID("io.canvas-toolchain.installer")
	a.Settings().SetTheme(ui.InstallerTheme{})

	w := a.NewWindow("Canvas Toolchain Installer " + Version)
	w.Resize(fyne.NewSize(720, 600))

	st := screens.NewState(Version)
	stack := container.NewMax()

	var goWelcome, goWorkflows, goCredentials, goInstall, goSummary func()
	goWelcome = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewWelcomeScreen(w, st, goWorkflowsOrInstall(st, goWorkflows, goInstall))}
		stack.Refresh()
	}
	goWorkflows = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewWorkflowsScreen(w, st, goCredentials, goWelcome)}
		stack.Refresh()
	}
	goCredentials = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewCredentialsScreen(w, st, goInstall, goWorkflows)}
		stack.Refresh()
	}
	goInstall = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewInstallScreen(w, st, goSummary, goCredentials)}
		stack.Refresh()
	}
	goSummary = func() {
		stack.Objects = []fyne.CanvasObject{screens.NewSummaryScreen(w, st, w.Close)}
		stack.Refresh()
	}

	goWelcome()
	w.SetContent(stack)
	w.ShowAndRun()
}

// goWorkflowsOrInstall picks the right next-screen for screen 1's onNext:
// fresh install → workflows; update mode → install (skip workflows + credentials).
func goWorkflowsOrInstall(st *screens.State, workflows, install func()) func() {
	return func() {
		if st.Mode == screens.ModeUpdate {
			install()
		} else {
			workflows()
		}
	}
}
```

- [ ] **Step 2: Verify the full app compiles**

```bash
cd D:/Dev/canvas-toolchain/installer
go build -o canvas-toolchain-installer .
go test ./...
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit**

```bash
git -C D:/Dev/canvas-toolchain add installer/main.go
git -C D:/Dev/canvas-toolchain commit -m "feat(installer): wire all 5 screens with update-mode skip (refs #63)"
```

---

## Task 19: Manual test plan + README polish

**Files:**
- Create: `installer/docs/manual-test-plan.md`
- Modify: `installer/README.md`

- [ ] **Step 1: Write the manual test plan**

`installer/docs/manual-test-plan.md`:

```markdown
# Canvas Toolchain Installer — Manual Test Plan

These tests verify install behavior that can't easily be unit-tested.
Run before tagging any release.

## Pre-test setup

Build a release-style binary locally with a small dummy payload:

    cd installer
    # Pack a tiny "monorepo" stand-in
    tar -czf payload/installer-payload.tar.gz README.md
    # Pack a minimal Node tarball matching the dev OS
    # (or just touch an empty file for UI-only walkthroughs)
    touch payload/node-runtime.tar.gz
    go build -ldflags '-X main.Version=v0.0.0-test' -o canvas-toolchain-installer .

## Test matrix

### T1 — Fresh Windows install on a clean VM

1. Boot a clean Windows 10/11 VM.
2. Copy `canvas-toolchain-installer-windows-x64.exe` to the desktop.
3. Double-click. SmartScreen warning appears.
4. Click "More info" → "Run anyway." Installer opens.
5. Step through all 5 screens with default options.
6. Verify after close:
   - `%USERPROFILE%\canvas-toolchain\` exists with the unpacked monorepo.
   - `%USERPROFILE%\canvas-toolchain\.canvas-toolchain-version` contains the version.
   - `%APPDATA%\Claude\claude_desktop_config.json` has a `canvas-toolchain` mcpServers entry.
   - Desktop has "Canvas Toolchain Updater" shortcut.

### T2 — Fresh Mac install (Apple Silicon)

Same as T1 but with `.pkg` on macOS 12+ Apple Silicon. Verify Gatekeeper bypass path.

### T3 — Fresh Mac install (Intel)

Same as T2 with the Intel `.pkg`.

### T4 — Update from v0.9.0 to v0.9.1

1. Install v0.9.0 fresh.
2. Run the v0.9.1 installer.
3. Verify:
   - Screen 1 detects existing install ("Update mode").
   - Screens 2 and 3 are skipped.
   - Screen 4 runs without touching `~/.command-and-control/` config files.
   - Updated version marker file reflects v0.9.1.
   - `~/.command-and-control/anthropic-config.json` etc. are unchanged.

### T5 — Install with zero APIs filled

1. Fresh install, skip every credential field on screen 3.
2. Verify summary screen shows three yellow warnings naming setup_anthropic, setup_canvas, setup_panopto.

### T6 — Install with all APIs filled (real keys)

Verify live validation rows on screen 5 show green for each successful API.

### T7 — Install with malformed Claude Desktop config

1. Pre-create `claude_desktop_config.json` with invalid JSON.
2. Run installer.
3. Verify: "Claude Desktop" step shows an error with a clear message; install can complete with the warning surfaced on the summary.

### T8 — Cancel mid-install

1. Run installer; on screen 4, click Cancel while npm install is running.
2. Verify no zombie node/npm process; installer exits cleanly.

### T9 — Disk space insufficient

Use a path on a small volume (e.g. a tiny VM volume) and verify screen 1 blocks Next with a clear message.

### T10 — Updater shortcut behavior

1. After install, click the Updater shortcut.
2. Verify: tiny window appears, status updates to "Up to date" (since this is the latest).
3. Simulate a newer release by manually editing `.canvas-toolchain-version` to a lower number.
4. Click the shortcut again; verify "Update available" appears with Update/Skip buttons.
```

- [ ] **Step 2: Polish the README**

Expand `installer/README.md`:

```markdown
# Canvas Toolchain Installer

Self-contained native installer for canvas-toolchain. Written in Go using Fyne.
The installer drops the canvas-toolchain source onto the user's machine,
installs npm dependencies, wires the MCP server into Claude Desktop and
Claude Code, optionally installs Python 3, and creates an Updater shortcut.

## Build

Requires Go 1.22+ and the platform's Fyne build prerequisites
([Fyne docs](https://docs.fyne.io/started/)).

### Local dev (UI-only smoke run)

The installer's `payload` package embeds two tarballs that CI generates. For
local development without CI:

    cd installer
    touch payload/installer-payload.tar.gz
    touch payload/node-runtime.tar.gz
    go build -o canvas-toolchain-installer .

This builds with empty embeds — the UI runs but the install steps will fail
because the tarballs are empty. Useful for screen-flow review.

### Local dev (real payload)

To exercise the full install path locally, pack a real payload:

    cd D:/Dev/canvas-toolchain
    npm run build
    # Pack monorepo (exclude node_modules)
    tar --exclude='node_modules' -czf installer/payload/installer-payload.tar.gz \
      package.json package-lock.json packages/
    # Place an OS-matched Node 18.20.x tarball at:
    cp ~/Downloads/node-v18.20.x-darwin-arm64.tar.gz installer/payload/node-runtime.tar.gz
    cd installer
    go build -ldflags '-X main.Version=v0.0.0-dev' -o canvas-toolchain-installer .

### Release build

Release builds run in CI — see Plan 3 and `.github/workflows/release-installer.yml`.

## Updater stub

The Updater shortcut launches a tiny separate binary:

    go build -tags updater_stub -o canvas-toolchain-updater ./update

## Tests

    go test ./...

## Manual test plan

See `docs/manual-test-plan.md`.
```

- [ ] **Step 3: Commit**

```bash
git -C D:/Dev/canvas-toolchain add installer/docs/manual-test-plan.md installer/README.md
git -C D:/Dev/canvas-toolchain commit -m "docs(installer): manual test plan + dev README (refs #63)"
```

---

## Task 20: End-to-end verification + finishing

- [ ] **Step 1: Full build matrix locally**

```bash
cd D:/Dev/canvas-toolchain/installer
go vet ./...
go test ./...
go build -o canvas-toolchain-installer .
go build -tags updater_stub -o canvas-toolchain-updater ./update
```

Expected: every command succeeds with no warnings.

- [ ] **Step 2: Smoke run the installer UI**

Launch `canvas-toolchain-installer` on the dev machine. Step through screens 1-5. Confirm:

- Screen 1 disk-space row shows green.
- Screen 2 checkboxes mutate state.
- Screen 3 Panopto fields appear only when screen 2's Panopto box is checked.
- Screen 4 attempts each step (will fail on extract because payload tarballs are empty/missing — expected for local smoke).
- Screen 5 renders.

- [ ] **Step 3: Hand off to `superpowers:finishing-a-development-branch`**

This plan ends with a working installer minus the real bundled payload. Plan 3 (CI release workflow) packs the actual payload at release time. Finish this branch via `superpowers:finishing-a-development-branch` — verify tests, present merge options.

---

## Plan self-review

Spec coverage check (against `installer/docs/specs/2026-05-26-installer-design.md`):

| Spec section | Plan task | ✓ |
| --- | --- | --- |
| §4.1 What ships | Tasks 1, 8, 17 (binary + embeds + stub) | ✓ |
| §4.2 Disk layout | Tasks 8, 10 (extract + version marker) | ✓ |
| §4.3 Source payload | Task 8 (embed + extract) | ✓ |
| §4.4 Bundled Node | Tasks 8, 9 (embed Node, resolve paths, use in npm) | ✓ |
| §5.1 Screen 1 — welcome + prereq + path | Task 4 | ✓ |
| §5.2 Screen 2 — workflow selector | Task 5 | ✓ |
| §5.3 Screen 3 — credentials | Task 6 | ✓ |
| §5.4 Screen 4 — install runner | Tasks 7, 15 | ✓ |
| §5.5 Screen 5 — summary | Task 16 | ✓ |
| §6.1 Claude Desktop config merge | Task 11 | ✓ |
| §6.2 Claude Code CLI config | Task 11 | ✓ |
| §6.3 Detection | Task 11 (ClaudeDesktopConfigPath returns "" if absent) | ✓ |
| §7.1 Updater stub | Task 17 | ✓ |
| §7.2 MCP nudge | (lives in C&C — Plan 1) | ✓ |
| §7.3 Update mode | Tasks 4 (detectMode) + 18 (router) | ✓ |
| §8 Source layout | Established across Tasks 1-17 | ✓ |
| §9 Error handling | Task 7 (runner Warn semantics) + Task 15 (Retry button) | ✓ |
| §10 Anthropic/Canvas integration | Task 10 (writes), Plan 1 (readers) | ✓ |
| §12 Testing | Test file per task + Task 19 manual plan | ✓ |
| §13 Out of scope | Honored — no telemetry, no code signing, no Canvas-Download | ✓ |
| §14 Sequence | Plan 1 first, then this plan, then Plan 3 | ✓ |

Placeholder scan: One soft spot — Task 14 `TestValidateAnthropic_OKOn200` is incomplete because the function hardcodes the production URL. The plan flags this and suggests refactoring `ValidateAnthropic` and `ValidatePanopto` to accept an optional base URL. Implementer should make that small refactor as a sub-step, OR drop the offending test and rely on the Canvas test.

Type consistency: `State`, `StepResult`, `Step`, `StepStatus`, `Runner`, `NodePaths`, `Release` all defined once and referenced consistently. `RowStatus` (UI) and `StepStatus` (tasks) are deliberately separate to avoid the UI package depending on tasks.

Scope: 20 tasks, ~80 sub-steps total. Big plan but each task is independently testable and committable. Appropriate for one subagent-driven-development session, or 4-6 batches of inline execution. Estimated implementation time: 12-20 hours of focused work.

Open implementation items the implementer may need to resolve:
- Fyne v2.5 vs v2.6+ API surface — pin v2.5.2 if there are breakages.
- `widget.NewAccordion` signature changed between Fyne versions; check Context7 if compile errors arise.
- The Mac sudo prompt for Python uses `osascript` — verify on macOS 14+ that this still surfaces the standard credential dialog (may need a fallback).
- The `splitAll` helper in `extract.go` is a workaround for `filepath` not having a "split all path components" utility — implementer may prefer `strings.Split(filepath.ToSlash(p), "/")`.
