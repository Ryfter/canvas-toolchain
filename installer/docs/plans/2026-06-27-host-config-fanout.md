# Host Config Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the installer to wire the canvas-toolchain MCP server into every supported agent/IDE (Codex, Gemini CLI, Cursor, VS Code, Kiro, Antigravity) in addition to the existing Claude Desktop / Claude Code.

**Architecture:** A declarative host adapter table (`SupportedHosts()`) replaces the two hard-coded Claude path functions. A format dispatcher routes each host to one of three writers — JSON `mcpServers`, JSON `servers` (VS Code), or TOML (Codex). The workflows screen auto-detects installed hosts (synchronous file stat) and pre-checks them as user-overridable checkboxes; the install step loops the table writing only the selected, detected hosts and records results in `State.WiredHosts`.

**Tech Stack:** Go 1.25, Fyne v2.5.2, `encoding/json` (stdlib), `github.com/BurntSushi/toml` (already vendored).

## Global Constraints

- Go module: `github.com/Ryfter/canvas-toolchain/installer`, Go `1.25.0`.
- MCP entry name is always `canvas-toolchain`.
- MCP entry value: `{ command: <nodeBin>, args: [<ccServerJS>] }` (VS Code adds `type: "stdio"`).
- All config writes: create parent dirs, preserve unrelated existing keys, write atomically (`.tmp` + rename), be idempotent (re-run never duplicates), and no-op on empty path.
- The single host-writing install step stays `Warn: true` — one host failing must not abort the install.
- TOML writer uses `github.com/BurntSushi/toml` (promote from indirect to direct; no new module).
- Detection is synchronous file `os.Stat` (fast); do NOT use a goroutine like the Python check.
- Antigravity detection is conservative: marker dir `~/.gemini/config` (avoids false-positive when only Gemini CLI is present).

---

## File Structure

- `installer/tasks/mcphost.go` — host adapter table, path resolvers, three writers, dispatcher, detection. (Modify.)
- `installer/tasks/mcphost_test.go` — writer + dispatcher tests. (Modify.)
- `installer/tasks/mcphost_paths_test.go` — path-resolution + detection tests. (Create.)
- `installer/screens/state.go` — `ConnectHosts` / `WiredHosts` maps; remove `Installed*` bools. (Modify.)
- `installer/screens/state_test.go` — `NewState` map init. (Modify.)
- `installer/screens/workflows.go` — "Connect to these apps" section. (Modify.)
- `installer/screens/workflows_test.go` — detection wired into screen. (Modify.)
- `installer/screens/install.go` — host-write loop step. (Modify.)
- `installer/screens/summary.go` — wired-host list from `WiredHosts`. (Modify.)
- `installer/screens/summary_test.go` — updated for `WiredHosts`. (Modify.)
- `installer/README.md` — supported-host list. (Modify.)
- `go.mod` — `BurntSushi/toml` becomes direct. (Modify via `go mod tidy`.)

---

## Task 1: Host adapter table, path resolvers, detection

**Files:**
- Modify: `installer/tasks/mcphost.go`
- Create: `installer/tasks/mcphost_paths_test.go`

**Interfaces:**
- Consumes: existing `ClaudeDesktopConfigPath()`, `ClaudeCodeConfigPath()` in `mcphost.go`.
- Produces:
  - `type ConfigFormat int` with `FormatJSONMcpServers`, `FormatJSONServers`, `FormatTOML`.
  - `type Host struct { ID, DisplayName string; Format ConfigFormat; ResolvePath func() string }`.
  - `func SupportedHosts() []Host`
  - `func DetectConnectHosts() map[string]bool`
  - New resolvers: `CodexConfigPath`, `GeminiConfigPath`, `CursorConfigPath`, `VSCodeConfigPath`, `KiroConfigPath`, `AntigravityConfigPath` — each `func() string`, returns `""` when undetected.

- [ ] **Step 1: Write the failing tests**

Create `installer/tasks/mcphost_paths_test.go`:

```go
package tasks

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// setHome points the OS home-dir lookup at dir for the duration of the test.
func setHome(t *testing.T, dir string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", dir)
		t.Setenv("APPDATA", filepath.Join(dir, "AppData", "Roaming"))
	} else {
		t.Setenv("HOME", dir)
	}
}

func TestCodexConfigPath_DetectedAndAbsent(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)

	if got := CodexConfigPath(); got != "" {
		t.Fatalf("expected empty path before ~/.codex exists, got %q", got)
	}

	if err := os.MkdirAll(filepath.Join(home, ".codex"), 0o755); err != nil {
		t.Fatal(err)
	}
	got := CodexConfigPath()
	if filepath.Base(got) != "config.toml" {
		t.Fatalf("expected path ending in config.toml, got %q", got)
	}
}

func TestVSCodeConfigPath_Detected(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)

	var userDir string
	switch runtime.GOOS {
	case "darwin":
		userDir = filepath.Join(home, "Library", "Application Support", "Code", "User")
	case "windows":
		userDir = filepath.Join(home, "AppData", "Roaming", "Code", "User")
	default:
		userDir = filepath.Join(home, ".config", "Code", "User")
	}
	if got := VSCodeConfigPath(); got != "" {
		t.Fatalf("expected empty path before Code/User exists, got %q", got)
	}
	if err := os.MkdirAll(userDir, 0o755); err != nil {
		t.Fatal(err)
	}
	got := VSCodeConfigPath()
	if filepath.Base(got) != "mcp.json" {
		t.Fatalf("expected path ending in mcp.json, got %q", got)
	}
}

func TestDetectConnectHosts_MarksDetected(t *testing.T) {
	home := t.TempDir()
	setHome(t, home)
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}
	detected := DetectConnectHosts()
	if !detected["cursor"] {
		t.Errorf("expected cursor detected, got %v", detected)
	}
	if detected["codex"] {
		t.Errorf("expected codex NOT detected, got %v", detected)
	}
}

func TestSupportedHosts_HasExpectedIDs(t *testing.T) {
	ids := map[string]bool{}
	for _, h := range SupportedHosts() {
		ids[h.ID] = true
	}
	for _, want := range []string{"claude-desktop", "claude-code", "codex", "gemini", "cursor", "vscode", "kiro", "antigravity"} {
		if !ids[want] {
			t.Errorf("SupportedHosts missing %q", want)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd installer && go test ./tasks/ -run 'ConfigPath|DetectConnectHosts|SupportedHosts' -v`
Expected: FAIL — `undefined: CodexConfigPath`, `undefined: SupportedHosts`, etc.

- [ ] **Step 3: Add the types, resolvers, table, and detection**

In `installer/tasks/mcphost.go`, add after the existing `ClaudeCodeConfigPath()` function:

```go
type ConfigFormat int

const (
	FormatJSONMcpServers ConfigFormat = iota // JSON, "mcpServers" key
	FormatJSONServers                        // JSON, "servers" key (VS Code)
	FormatTOML                               // TOML, [mcp_servers.*] (Codex)
)

type Host struct {
	ID          string
	DisplayName string
	Format      ConfigFormat
	ResolvePath func() string
}

func CodexConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".codex")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "config.toml")
}

func GeminiConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".gemini")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "settings.json")
}

func CursorConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".cursor")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "mcp.json")
}

func KiroConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".kiro")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "settings", "mcp.json")
}

func AntigravityConfigPath() string {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".gemini", "config")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "mcp_config.json")
}

func VSCodeConfigPath() string {
	home, _ := os.UserHomeDir()
	var dir string
	switch runtime.GOOS {
	case "darwin":
		dir = filepath.Join(home, "Library", "Application Support", "Code", "User")
	case "windows":
		appdata := os.Getenv("APPDATA")
		if appdata == "" {
			return ""
		}
		dir = filepath.Join(appdata, "Code", "User")
	default:
		dir = filepath.Join(home, ".config", "Code", "User")
	}
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return filepath.Join(dir, "mcp.json")
}

func SupportedHosts() []Host {
	return []Host{
		{ID: "claude-desktop", DisplayName: "Claude Desktop", Format: FormatJSONMcpServers, ResolvePath: ClaudeDesktopConfigPath},
		{ID: "claude-code", DisplayName: "Claude Code", Format: FormatJSONMcpServers, ResolvePath: ClaudeCodeConfigPath},
		{ID: "codex", DisplayName: "Codex CLI", Format: FormatTOML, ResolvePath: CodexConfigPath},
		{ID: "gemini", DisplayName: "Gemini CLI", Format: FormatJSONMcpServers, ResolvePath: GeminiConfigPath},
		{ID: "cursor", DisplayName: "Cursor", Format: FormatJSONMcpServers, ResolvePath: CursorConfigPath},
		{ID: "vscode", DisplayName: "VS Code", Format: FormatJSONServers, ResolvePath: VSCodeConfigPath},
		{ID: "kiro", DisplayName: "Kiro", Format: FormatJSONMcpServers, ResolvePath: KiroConfigPath},
		{ID: "antigravity", DisplayName: "Antigravity", Format: FormatJSONMcpServers, ResolvePath: AntigravityConfigPath},
	}
}

func DetectConnectHosts() map[string]bool {
	out := map[string]bool{}
	for _, h := range SupportedHosts() {
		out[h.ID] = h.ResolvePath() != ""
	}
	return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd installer && go test ./tasks/ -run 'ConfigPath|DetectConnectHosts|SupportedHosts' -v`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add installer/tasks/mcphost.go installer/tasks/mcphost_paths_test.go
git commit -m "feat(installer): host adapter table, path resolvers, detection"
```

---

## Task 2: VS Code `servers`-key JSON writer

**Files:**
- Modify: `installer/tasks/mcphost.go`
- Modify: `installer/tasks/mcphost_test.go`

**Interfaces:**
- Consumes: existing `atomicWriteJSON(path, v, mode)` from `configs.go`.
- Produces: `func writeJSONServersHostConfig(path, nodeBin, ccServerJS string) error`.

- [ ] **Step 1: Write the failing tests**

Append to `installer/tasks/mcphost_test.go`:

```go
func TestWriteJSONServers_CreatesWithServersKeyAndType(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "mcp.json")
	if err := writeJSONServersHostConfig(path, "/node", "/app/index.js"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	servers, ok := parsed["servers"].(map[string]any)
	if !ok {
		t.Fatalf("expected top-level 'servers' key, got %v", parsed)
	}
	entry := servers["canvas-toolchain"].(map[string]any)
	if entry["type"] != "stdio" {
		t.Errorf("expected type stdio, got %v", entry["type"])
	}
	if entry["command"] != "/node" {
		t.Errorf("expected command /node, got %v", entry["command"])
	}
}

func TestWriteJSONServers_PreservesExisting(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "mcp.json")
	initial := map[string]any{
		"inputs": []any{"x"},
		"servers": map[string]any{
			"other": map[string]any{"command": "/keep"},
		},
	}
	data, _ := json.Marshal(initial)
	_ = os.WriteFile(path, data, 0o644)

	if err := writeJSONServersHostConfig(path, "/n", "/s"); err != nil {
		t.Fatal(err)
	}
	out, _ := os.ReadFile(path)
	var parsed map[string]any
	_ = json.Unmarshal(out, &parsed)
	if parsed["inputs"] == nil {
		t.Error("top-level inputs dropped")
	}
	servers := parsed["servers"].(map[string]any)
	if _, ok := servers["other"]; !ok {
		t.Error("existing 'other' server dropped")
	}
	if _, ok := servers["canvas-toolchain"]; !ok {
		t.Error("canvas-toolchain not added")
	}
}

func TestWriteJSONServers_ErrorOnMalformed(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "broken.json")
	_ = os.WriteFile(path, []byte("{nope"), 0o644)
	if err := writeJSONServersHostConfig(path, "/n", "/s"); err == nil {
		t.Fatal("expected error on malformed JSON")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd installer && go test ./tasks/ -run 'WriteJSONServers' -v`
Expected: FAIL — `undefined: writeJSONServersHostConfig`.

- [ ] **Step 3: Implement the writer**

Add to `installer/tasks/mcphost.go`:

```go
func writeJSONServersHostConfig(path, nodeBin, ccServerJS string) error {
	if path == "" {
		return nil
	}
	existing := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &existing); err != nil {
			return err
		}
	}
	servers, _ := existing["servers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
	}
	servers["canvas-toolchain"] = map[string]any{
		"type":    "stdio",
		"command": nodeBin,
		"args":    []string{ccServerJS},
	}
	existing["servers"] = servers
	return atomicWriteJSON(path, existing, 0o644)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd installer && go test ./tasks/ -run 'WriteJSONServers' -v`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add installer/tasks/mcphost.go installer/tasks/mcphost_test.go
git commit -m "feat(installer): VS Code servers-key MCP config writer"
```

---

## Task 3: Codex TOML writer

**Files:**
- Modify: `installer/tasks/mcphost.go`
- Modify: `installer/tasks/mcphost_test.go`
- Modify: `installer/go.mod`, `installer/go.sum` (via `go mod tidy`)

**Interfaces:**
- Consumes: `github.com/BurntSushi/toml`.
- Produces: `func writeTOMLHostConfig(path, nodeBin, ccServerJS string) error`.

- [ ] **Step 1: Write the failing tests**

Append to `installer/tasks/mcphost_test.go`:

```go
func TestWriteTOML_CreatesMcpServersTable(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "config.toml")
	if err := writeTOMLHostConfig(path, "/node", "/app/index.js"); err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if _, err := toml.DecodeFile(path, &parsed); err != nil {
		t.Fatal(err)
	}
	servers := parsed["mcp_servers"].(map[string]any)
	entry := servers["canvas-toolchain"].(map[string]any)
	if entry["command"] != "/node" {
		t.Errorf("expected command /node, got %v", entry["command"])
	}
	args := entry["args"].([]any)
	if len(args) != 1 || args[0] != "/app/index.js" {
		t.Errorf("expected args [/app/index.js], got %v", args)
	}
}

func TestWriteTOML_PreservesExistingTables(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "config.toml")
	_ = os.WriteFile(path, []byte("model = \"gpt-5\"\n\n[mcp_servers.other]\ncommand = \"/keep\"\n"), 0o644)

	if err := writeTOMLHostConfig(path, "/n", "/s"); err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if _, err := toml.DecodeFile(path, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed["model"] != "gpt-5" {
		t.Errorf("top-level model dropped: %v", parsed["model"])
	}
	servers := parsed["mcp_servers"].(map[string]any)
	if _, ok := servers["other"]; !ok {
		t.Error("existing other server dropped")
	}
	if _, ok := servers["canvas-toolchain"]; !ok {
		t.Error("canvas-toolchain not added")
	}
}

func TestWriteTOML_ErrorOnMalformed(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "broken.toml")
	_ = os.WriteFile(path, []byte("this = = broken"), 0o644)
	if err := writeTOMLHostConfig(path, "/n", "/s"); err == nil {
		t.Fatal("expected error on malformed TOML")
	}
}
```

Add `"github.com/BurntSushi/toml"` to the import block of `mcphost_test.go`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd installer && go test ./tasks/ -run 'WriteTOML' -v`
Expected: FAIL — `undefined: writeTOMLHostConfig`.

- [ ] **Step 3: Implement the writer**

Add `"bytes"` and `"github.com/BurntSushi/toml"` to the import block of `mcphost.go`, then add:

```go
func writeTOMLHostConfig(path, nodeBin, ccServerJS string) error {
	if path == "" {
		return nil
	}
	existing := map[string]any{}
	if _, err := os.Stat(path); err == nil {
		if _, err := toml.DecodeFile(path, &existing); err != nil {
			return err
		}
	}
	servers, _ := existing["mcp_servers"].(map[string]any)
	if servers == nil {
		servers = map[string]any{}
	}
	servers["canvas-toolchain"] = map[string]any{
		"command": nodeBin,
		"args":    []string{ccServerJS},
	}
	existing["mcp_servers"] = servers

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	var buf bytes.Buffer
	if err := toml.NewEncoder(&buf).Encode(existing); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, buf.Bytes(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
```

- [ ] **Step 4: Tidy modules, then run tests**

Run: `cd installer && go mod tidy && go test ./tasks/ -run 'WriteTOML' -v`
Expected: `go mod tidy` moves `github.com/BurntSushi/toml` out of the indirect block; tests PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add installer/tasks/mcphost.go installer/tasks/mcphost_test.go installer/go.mod installer/go.sum
git commit -m "feat(installer): Codex TOML MCP config writer (BurntSushi/toml)"
```

---

## Task 4: Format dispatcher

**Files:**
- Modify: `installer/tasks/mcphost.go`
- Modify: `installer/tasks/mcphost_test.go`

**Interfaces:**
- Consumes: `WriteHostConfig` (existing mcpServers JSON), `writeJSONServersHostConfig` (Task 2), `writeTOMLHostConfig` (Task 3), `ConfigFormat` (Task 1).
- Produces: `func WriteHostConfigForPath(format ConfigFormat, path, nodeBin, ccServerJS string) error`.

- [ ] **Step 1: Write the failing tests**

Append to `installer/tasks/mcphost_test.go`:

```go
func TestWriteHostConfigForPath_DispatchesJSONServers(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "mcp.json")
	if err := WriteHostConfigForPath(FormatJSONServers, path, "/node", "/app.js"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	var parsed map[string]any
	_ = json.Unmarshal(data, &parsed)
	if _, ok := parsed["servers"]; !ok {
		t.Errorf("expected servers key from JSONServers dispatch, got %v", parsed)
	}
}

func TestWriteHostConfigForPath_DispatchesTOML(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "config.toml")
	if err := WriteHostConfigForPath(FormatTOML, path, "/node", "/app.js"); err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if _, err := toml.DecodeFile(path, &parsed); err != nil {
		t.Fatal(err)
	}
	if _, ok := parsed["mcp_servers"]; !ok {
		t.Errorf("expected mcp_servers table from TOML dispatch, got %v", parsed)
	}
}

func TestWriteHostConfigForPath_DispatchesMcpServers(t *testing.T) {
	tmp := t.TempDir()
	path := filepath.Join(tmp, "claude.json")
	if err := WriteHostConfigForPath(FormatJSONMcpServers, path, "/node", "/app.js"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	var parsed map[string]any
	_ = json.Unmarshal(data, &parsed)
	if _, ok := parsed["mcpServers"]; !ok {
		t.Errorf("expected mcpServers key, got %v", parsed)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd installer && go test ./tasks/ -run 'WriteHostConfigForPath' -v`
Expected: FAIL — `undefined: WriteHostConfigForPath`.

- [ ] **Step 3: Implement the dispatcher**

Add to `installer/tasks/mcphost.go`:

```go
func WriteHostConfigForPath(format ConfigFormat, path, nodeBin, ccServerJS string) error {
	switch format {
	case FormatJSONServers:
		return writeJSONServersHostConfig(path, nodeBin, ccServerJS)
	case FormatTOML:
		return writeTOMLHostConfig(path, nodeBin, ccServerJS)
	default:
		return WriteHostConfig(path, nodeBin, ccServerJS)
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd installer && go test ./tasks/ -v`
Expected: PASS (entire tasks package, including the existing `WriteHostConfig` tests).

- [ ] **Step 5: Commit**

```bash
git add installer/tasks/mcphost.go installer/tasks/mcphost_test.go
git commit -m "feat(installer): format dispatcher for host config writers"
```

---

## Task 5: State — ConnectHosts / WiredHosts maps

**Files:**
- Modify: `installer/screens/state.go`
- Modify: `installer/screens/state_test.go`

**Interfaces:**
- Produces: `State.ConnectHosts map[string]bool`, `State.WiredHosts map[string]bool`, both initialized non-nil by `NewState`.
- Removes: `State.InstalledClaudeDesktop`, `State.InstalledClaudeCode`.

- [ ] **Step 1: Write the failing test**

Append to `installer/screens/state_test.go`:

```go
func TestNewState_InitializesHostMaps(t *testing.T) {
	st := NewState("1.0.0")
	if st.ConnectHosts == nil {
		t.Error("ConnectHosts should be initialized non-nil")
	}
	if st.WiredHosts == nil {
		t.Error("WiredHosts should be initialized non-nil")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd installer && go test ./screens/ -run 'TestNewState_InitializesHostMaps' -v`
Expected: FAIL — compile error (`ConnectHosts` undefined) or nil-map assertion.

- [ ] **Step 3: Update State**

In `installer/screens/state.go`: in the `State` struct, delete the lines:

```go
	InstalledClaudeDesktop bool
	InstalledClaudeCode    bool
```

and add (next to `InstalledPython bool`):

```go
	ConnectHosts map[string]bool
	WiredHosts   map[string]bool
```

In `NewState`, update the returned struct literal to initialize the maps:

```go
func NewState(version string) *State {
	return &State{
		Version:        version,
		InstallDir:     DefaultInstallDir(),
		Mode:           ModeFresh,
		WorkflowCanvas: true,
		ConnectHosts:   map[string]bool{},
		WiredHosts:     map[string]bool{},
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd installer && go test ./screens/ -run 'TestNewState_InitializesHostMaps' -v`
Expected: PASS. (Other `screens` tests/build will break until Tasks 6–9 — that is expected; this task's own test passes.)

- [ ] **Step 5: Commit**

```bash
git add installer/screens/state.go installer/screens/state_test.go
git commit -m "feat(installer): ConnectHosts/WiredHosts state maps"
```

---

## Task 6: Workflows screen "Connect to these apps" section

**Files:**
- Modify: `installer/screens/workflows.go`
- Modify: `installer/screens/workflows_test.go`

**Interfaces:**
- Consumes: `tasks.SupportedHosts()`, `tasks.DetectConnectHosts()` (Task 1), `State.ConnectHosts` (Task 5).
- Produces: workflows screen that populates `st.ConnectHosts` from detection and renders one checkbox per host.

- [ ] **Step 1: Write the failing test**

Append to `installer/screens/workflows_test.go` (mirror the file's existing app/window setup — it already imports `fyne.io/fyne/v2/test`):

```go
func TestWorkflowsScreen_PopulatesConnectHosts(t *testing.T) {
	home := t.TempDir()
	if runtime.GOOS == "windows" {
		t.Setenv("USERPROFILE", home)
		t.Setenv("APPDATA", filepath.Join(home, "AppData", "Roaming"))
	} else {
		t.Setenv("HOME", home)
	}
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o755); err != nil {
		t.Fatal(err)
	}

	app := test.NewApp()
	defer app.Quit()
	w := app.NewWindow("")
	st := NewState("1.0.0")

	screen := NewWorkflowsScreen(w, st, func() {}, func() {})
	if screen == nil {
		t.Fatal("expected non-nil screen")
	}
	if !st.ConnectHosts["cursor"] {
		t.Errorf("expected cursor pre-selected from detection, got %v", st.ConnectHosts)
	}
}
```

Ensure `workflows_test.go` imports include `"os"`, `"path/filepath"`, `"runtime"`, and `"fyne.io/fyne/v2/test"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd installer && go test ./screens/ -run 'TestWorkflowsScreen_PopulatesConnectHosts' -v`
Expected: FAIL — `st.ConnectHosts["cursor"]` is false (section not added yet).

- [ ] **Step 3: Add the section**

In `installer/screens/workflows.go`, after the `registryCheck` block and before the `pythonCheck` block, insert synchronous host detection and checkboxes:

```go
	detected := tasks.DetectConnectHosts()
	st.ConnectHosts = detected
	hostChecks := []fyne.CanvasObject{
		widget.NewLabelWithStyle("Connect to these apps", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		func() fyne.CanvasObject {
			l := widget.NewLabel("Detected MCP-capable apps are pre-checked. Untick any you don't want canvas-toolchain added to.")
			l.Wrapping = fyne.TextWrapWord
			return l
		}(),
	}
	for _, h := range tasks.SupportedHosts() {
		host := h // capture
		label := host.DisplayName
		if !detected[host.ID] {
			label += " (not detected)"
		}
		check := widget.NewCheck(label, func(b bool) { st.ConnectHosts[host.ID] = b })
		check.SetChecked(detected[host.ID])
		hostChecks = append(hostChecks, check)
	}
	hostSection := container.NewVBox(hostChecks...)
```

Then add `hostSection` and a separator into the `form` VBox, immediately before the `"Optional extras"` label:

```go
	form := container.NewVBox(
		title,
		hint,
		widget.NewSeparator(),
		canvasCheck,
		panoptoCheck,
		ciCheck,
		registryCheck,
		widget.NewSeparator(),
		hostSection,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Optional extras", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		pythonCheck,
		pythonStatus,
	)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd installer && go test ./screens/ -run 'TestWorkflowsScreen_PopulatesConnectHosts' -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer/screens/workflows.go installer/screens/workflows_test.go
git commit -m "feat(installer): workflows screen host-connection checkboxes"
```

---

## Task 7: Install step — write loop

**Files:**
- Modify: `installer/screens/install.go`
- Modify: `installer/screens/install_test.go`

**Interfaces:**
- Consumes: `tasks.SupportedHosts()`, `tasks.WriteHostConfigForPath()` (Task 4), `State.ConnectHosts`, `State.WiredHosts`.
- Produces: a single "Connect MCP hosts" step that writes selected+detected hosts and records `st.WiredHosts[id] = true`.

- [ ] **Step 1: Write the failing test**

Append to `installer/screens/install_test.go` (this test calls the step logic via a small helper added in Step 3; if `install_test.go` already exercises `buildSteps`, mirror that pattern instead):

```go
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
```

Ensure imports include `"os"`, `"path/filepath"`, `"runtime"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd installer && go test ./screens/ -run 'TestWriteSelectedHosts' -v`
Expected: FAIL — `undefined: writeSelectedHosts`.

- [ ] **Step 3: Implement the loop helper and step**

In `installer/screens/install.go`, add a helper function (top level):

```go
func writeSelectedHosts(st *State, nodeBin, ccServerJS string) error {
	for _, h := range tasks.SupportedHosts() {
		if !st.ConnectHosts[h.ID] {
			continue
		}
		path := h.ResolvePath()
		if path == "" {
			continue
		}
		if err := tasks.WriteHostConfigForPath(h.Format, path, nodeBin, ccServerJS); err != nil {
			return err
		}
		st.WiredHosts[h.ID] = true
	}
	return nil
}
```

In `buildSteps`, delete the now-unused `cdConfig`/`ccConfig` locals (lines defining `cdConfig := tasks.ClaudeDesktopConfigPath()` and `ccConfig := tasks.ClaudeCodeConfigPath()`), and replace the two steps named `"Claude Desktop"` and `"Claude Code"` with a single step:

```go
		{Name: "Connect MCP hosts", Warn: true, Run: func(ctx context.Context) error {
			return writeSelectedHosts(st, np.Node, ccServerJS)
		}},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd installer && go test ./screens/ -run 'TestWriteSelectedHosts' -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add installer/screens/install.go installer/screens/install_test.go
git commit -m "feat(installer): single MCP-host write loop step"
```

---

## Task 8: Summary screen — wired-host list

**Files:**
- Modify: `installer/screens/summary.go`
- Modify: `installer/screens/summary_test.go`

**Interfaces:**
- Consumes: `tasks.SupportedHosts()` (Task 1), `State.WiredHosts` (Task 5).
- Produces: summary screen listing each wired host by display name.

- [ ] **Step 1: Write the failing test**

In `installer/screens/summary_test.go`, replace any reference to `InstalledClaudeDesktop`/`InstalledClaudeCode` with `WiredHosts`, and add:

```go
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

// dumpLabels walks the widget tree collecting label text.
func dumpLabels(obj fyne.CanvasObject) string {
	var sb strings.Builder
	var walk func(o fyne.CanvasObject)
	walk = func(o fyne.CanvasObject) {
		switch v := o.(type) {
		case *widget.Label:
			sb.WriteString(v.Text + "\n")
		case *fyne.Container:
			for _, c := range v.Objects {
				walk(c)
			}
		}
	}
	walk(obj)
	return sb.String()
}
```

Ensure imports include `"strings"`, `"fyne.io/fyne/v2"`, `"fyne.io/fyne/v2/widget"`, and `"fyne.io/fyne/v2/test"`. If `dumpLabels` already exists in the test file, reuse it and drop the duplicate.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd installer && go test ./screens/ -run 'TestSummaryScreen_ListsWiredHosts' -v`
Expected: FAIL — wired hosts not rendered (still references removed bools / compile error).

- [ ] **Step 3: Update the summary screen**

In `installer/screens/summary.go`, add `"github.com/Ryfter/canvas-toolchain/installer/tasks"` to the imports. Replace the two blocks:

```go
	if st.InstalledClaudeDesktop {
		wins.Add(ui.NewStatusRowWithStatus("Wired to Claude Desktop", ui.StatusOK, ""))
	}
	if st.InstalledClaudeCode {
		wins.Add(ui.NewStatusRowWithStatus("Wired to Claude Code CLI", ui.StatusOK, ""))
	}
```

with:

```go
	for _, h := range tasks.SupportedHosts() {
		if st.WiredHosts[h.ID] {
			wins.Add(ui.NewStatusRowWithStatus("Wired to "+h.DisplayName, ui.StatusOK, ""))
		}
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd installer && go test ./screens/ -v`
Expected: PASS (whole screens package).

- [ ] **Step 5: Commit**

```bash
git add installer/screens/summary.go installer/screens/summary_test.go
git commit -m "feat(installer): summary lists all wired MCP hosts"
```

---

## Task 9: Full build, docs, and handoff

**Files:**
- Modify: `installer/README.md`
- Modify: `AGENTS.md` (cross-agent handoff note)

**Interfaces:** none (documentation + verification).

- [ ] **Step 1: Full verification build + test**

Run: `cd installer && go build ./... && go test ./...`
Expected: build succeeds; all packages PASS.

- [ ] **Step 2: Update installer README host list**

In `installer/README.md`, find the section describing which apps the installer configures (it currently names Claude Desktop / Claude Code) and replace it with the full supported list:

```markdown
The installer auto-detects and wires the canvas-toolchain MCP server into any of
these apps that are installed on your machine (untick any you don't want on the
"Choose your workflows" screen):

- Claude Desktop
- Claude Code
- Codex CLI (`~/.codex/config.toml`)
- Gemini CLI (`~/.gemini/settings.json`)
- Cursor (`~/.cursor/mcp.json`)
- VS Code (user `mcp.json`)
- Kiro (`~/.kiro/settings/mcp.json`)
- Antigravity (`~/.gemini/config/mcp_config.json`)
```

- [ ] **Step 3: Add cross-agent handoff note**

In `AGENTS.md`, add a short bullet under the installer/recent-work section:

```markdown
- Installer now fans out the MCP config to all detected hosts (Claude Desktop/Code,
  Codex, Gemini CLI, Cursor, VS Code, Kiro, Antigravity) via a host adapter table in
  `installer/tasks/mcphost.go` (`SupportedHosts()` + format dispatcher). Sub-project A
  of the model-agnostic effort; see `installer/docs/specs/2026-06-27-host-config-fanout-design.md`.
```

- [ ] **Step 4: Verify docs build (no command — visual check)**

Confirm the README and AGENTS.md edits read correctly and the host list matches `SupportedHosts()` in `mcphost.go`.

- [ ] **Step 5: Commit**

```bash
git add installer/README.md AGENTS.md
git commit -m "docs(installer): document multi-host MCP config fan-out"
```

---

## Self-Review

**Spec coverage:**
- Host adapter table → Task 1. ✓
- Per-OS path resolution (incl. VS Code user dir) → Task 1. ✓
- JSON `mcpServers` writer (reused) → Task 4 dispatch + existing `WriteHostConfig`. ✓
- JSON `servers` writer (VS Code, `type:stdio`) → Task 2. ✓
- TOML writer (Codex, BurntSushi/toml) → Task 3. ✓
- Format dispatcher → Task 4. ✓
- Detection on workflows screen (synchronous, pre-checked, overridable) → Tasks 1 + 6. ✓
- State `ConnectHosts`/`WiredHosts`, remove `Installed*` bools → Task 5. ✓
- Install loop honoring selection + detection, `Warn:true` → Task 7. ✓
- Summary lists wired hosts → Task 8. ✓
- Idempotency / preserve-existing / atomic / no-op-empty → covered by tests in Tasks 2, 3, 4 and inherited `WriteHostConfig` tests. ✓
- Dependency promotion (BurntSushi/toml) → Task 3. ✓
- Docs/rollout → Task 9. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete and concrete.

**Type consistency:** `ConfigFormat` constants, `Host` fields (`ID`/`DisplayName`/`Format`/`ResolvePath`), `WriteHostConfigForPath` signature, `DetectConnectHosts` return type, and `ConnectHosts`/`WiredHosts` map types are used identically across Tasks 1, 4, 5, 6, 7, 8. ✓
