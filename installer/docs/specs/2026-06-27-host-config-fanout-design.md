# Host Config Fan-Out — Design (Sub-project A)

**Date:** 2026-06-27
**Status:** Approved (design); pending spec review
**Scope:** Installer only. The MCP server and skills layers are out of scope here.

## Context

Making canvas-toolchain model-agnostic is decomposed into three sub-projects:

- **A — Host config fan-out** (this spec): the installer wires the MCP server into
  every supported agent/IDE, not just Claude.
- **B — LLM backend agnosticism**: `shared-llm` gains OpenAI + Gemini clients so a
  user without an Anthropic key can run generation start to finish. (Separate spec.)
- **C — Guidance/skills portability**: neutralize Claude-specific wording in tool
  output and instruction files. (Separate spec.)

The `command-and-control` server is a **stdio MCP server**, so it already speaks the
cross-client protocol. "Runs in Claude only" is therefore an *installer reach*
problem: today `installer/tasks/mcphost.go` writes the MCP entry into exactly two
files — Claude Desktop's `claude_desktop_config.json` and Claude Code's
`~/.claude.json`. This sub-project extends that to all supported hosts.

## Goals

- Detect every supported host present on the machine and write its `canvas-toolchain`
  MCP entry in that host's native format and location.
- Surface the detected hosts on the existing workflows screen as pre-checked,
  user-overridable checkboxes (no new wizard screen).
- Preserve existing config content; writes are namespaced and idempotent (re-running
  the installer never duplicates the entry).

## Non-goals

- LLM backend selection (sub-project B).
- Any change to the MCP server itself or its tools.
- Per-workspace/project-scoped configs — we target user/global configs only.
- VS Code Insiders, Cursor project-scoped configs, Antigravity CLI — deferred; the
  adapter table makes them one-row additions later.

## Supported host matrix

| Host | Config path (user/global) | Format | Top-level key | Detect by |
|---|---|---|---|---|
| Claude Desktop | per-OS `claude_desktop_config.json` | JSON | `mcpServers` | existing |
| Claude Code | `~/.claude.json` | JSON | `mcpServers` | existing |
| Codex CLI | `~/.codex/config.toml` | TOML | `[mcp_servers.<name>]` | `~/.codex/` exists |
| Gemini CLI | `~/.gemini/settings.json` | JSON | `mcpServers` | `~/.gemini/` exists |
| Cursor | `~/.cursor/mcp.json` | JSON | `mcpServers` | `~/.cursor/` exists |
| VS Code | per-OS `…/Code/User/mcp.json` | JSON | `servers` | `…/Code/User/` exists |
| Kiro | `~/.kiro/settings/mcp.json` | JSON | `mcpServers` | `~/.kiro/` exists |
| Antigravity | `~/.gemini/config/mcp_config.json` | JSON | `mcpServers` | `~/.gemini/config/` exists |

Per-OS paths:

- **Claude Desktop** (unchanged): macOS `~/Library/Application Support/Claude/`,
  Windows `%APPDATA%\Claude\`, Linux `~/.config/Claude/`.
- **VS Code user `mcp.json`**: Windows `%APPDATA%\Code\User\mcp.json`,
  macOS `~/Library/Application Support/Code/User/mcp.json`,
  Linux `~/.config/Code/User/mcp.json`.

The MCP entry value in every case is the existing
`{ "command": <nodeBin>, "args": [<ccServerJS>] }`.

## Architecture

### 1. Host adapter table

Replace the two hard-coded path functions (`ClaudeDesktopConfigPath`,
`ClaudeCodeConfigPath`) with a declarative slice of host descriptors in
`installer/tasks/mcphost.go`:

```go
type ConfigFormat int

const (
    FormatJSONMcpServers ConfigFormat = iota // mcpServers key
    FormatJSONServers                        // servers key (VS Code) + type:stdio
    FormatTOML                               // Codex config.toml
)

type Host struct {
    ID          string                 // "claude-desktop", "codex", ...
    DisplayName string                 // "Claude Desktop", "Codex CLI", ...
    Format      ConfigFormat
    ResolvePath func() string          // "" when host not detected
}

func SupportedHosts() []Host { ... }
```

`ResolvePath` returns `""` when the host's marker dir/file is absent, preserving the
existing "no-op on empty path" idiom. The existing two Claude functions become the
`ResolvePath` of their rows.

### 2. Writers dispatched by format

A single entry point dispatches on `Host.Format`:

```go
func WriteHostConfigFor(h Host, nodeBin, ccServerJS string) error
```

- `FormatJSONMcpServers` → today's `WriteHostConfig` logic (unchanged), reused by
  Claude Desktop/Code, Gemini, Cursor, Kiro, Antigravity.
- `FormatJSONServers` → same read-merge-write, but under the `servers` key and the
  entry includes `"type": "stdio"` (VS Code).
- `FormatTOML` → Codex. Read existing `config.toml` into `map[string]any` via
  `github.com/BurntSushi/toml` (already vendored in `go.mod` as an indirect dep —
  promoted to direct, no new module added), set
  `mcp_servers.canvas-toolchain = {command, args}`, marshal back, atomic write.
  (Comments in the file are not preserved — accepted trade-off.)

All writers: create parent dirs, preserve unrelated existing keys, write atomically
(`.tmp` + rename, matching `atomicWriteJSON`), and are idempotent.

### 3. Detection on the workflows screen

Add a "Connect to these apps" section to `installer/screens/workflows.go`:

- On screen build, call `tasks.DetectConnectHosts()` inline (synchronous — a file-stat
  per host is instant) and assign the result to `st.ConnectHosts`.
- Render one `widget.Check` per supported host: detected hosts are pre-checked and
  enabled; undetected hosts are unchecked and labelled with a "(not detected)" suffix.
- The user may override any checkbox before proceeding.
- Each checkbox binds to `State.ConnectHosts[hostID] bool`.

### 4. Install step

Replace the two hard-coded "Claude Desktop" / "Claude Code" steps in
`installer/screens/install.go` with one step that loops `SupportedHosts()`:

```
for each host:
    if !state.ConnectHosts[host.ID]: skip
    path := host.ResolvePath()
    if path == "": skip
    WriteHostConfigFor(host, nodeBin, ccServerJS)
    state.WiredHosts[host.ID] = true
```

The step keeps `Warn: true` (a single host failing must not abort the install).

### 5. State changes

In `installer/screens/state.go`:

- Add `ConnectHosts map[string]bool` (user selection, defaults to detected set).
- Add `WiredHosts map[string]bool` (post-install result, source of truth for summary).
- Remove the `InstalledClaudeDesktop` / `InstalledClaudeCode` bools; the summary
  screen reads `WiredHosts` instead. Update any test referencing the removed fields.

### 6. Summary screen

Update `installer/screens/summary.go` to list every wired host from `WiredHosts`
instead of the two hard-coded Claude lines.

## Error handling

- A host whose config file is malformed JSON/TOML surfaces a warning for that host
  only (step is `Warn: true`); other hosts still get wired.
- Empty/undetected path → silent skip (existing idiom).
- Atomic writes prevent partial/corrupt config files on crash.

## Testing

Extend `installer/tasks/mcphost_test.go` and add `configs`/path tests:

- Per format: creates file when absent; preserves existing unrelated entries; updates
  in place without duplicating on re-run (idempotency); no-op on empty path; returns
  error on malformed existing file.
- VS Code: writes under `servers` with `type: stdio`.
- Codex TOML: round-trips an existing `[some.other]` table while adding
  `[mcp_servers.canvas-toolchain]`.
- Path resolution: per-OS table test (using `CC_HOME`-style env or `t.TempDir()` +
  `HOME`/`APPDATA` overrides) confirming detected vs. `""` results.

## Dependencies

- `github.com/BurntSushi/toml` (already present in `go.mod` as an indirect dependency)
  is promoted to a direct dependency for the Codex TOML writer. No new module is added.

## Rollout

Pure installer change; no server or schema migration. Ships in the next installer
release via the existing release-installer workflow.
