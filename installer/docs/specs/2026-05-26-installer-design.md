# Canvas Toolchain Native Installer — Design Spec

**Status:** Approved 2026-05-26. Ready for plan writing.
**Owner:** the toolchain author. **Implementer:** Codex (via `codex:codex-rescue` subagent type).
**GitHub issue:** [#63 — Native installer (Go+Fyne)](https://github.com/Ryfter/canvas-toolchain/issues/63).
**Tracks toward:** Milestone `v1.0 — Native Installer`.

---

## 1. Goal

Reduce professor setup of canvas-toolchain from "eight manual terminal commands" to one double-click. Ship a self-contained native installer for Windows and macOS that drops the toolchain, wires the MCP server into Claude Desktop and Claude Code, and never blocks on missing optional credentials. Provide an auto-update path that keeps the install current without re-instructing the professor.

## 2. Background

Today, installing canvas-toolchain requires: install Node 18+, install Git, clone the repo, `npm install`, `npm run build`, edit `claude_desktop_config.json` manually, run a per-feature `setup_*` MCP tool from Claude Desktop for each API integration. Eight steps, three of them terminal-only. The target audience — university professors at University and elsewhere — abandons software the moment it asks them to open a terminal.

The installer is the **v1.0 gating item**. v0.9 (workflow tools, kb-bridge, page-renderer, update_course_materials) is complete.

## 3. Non-goals

- Replace the existing `setup_*` MCP tools — they remain the authoritative way to add/edit credentials after install.
- Configure Canvas-Download (the Python sidecar). Out of v1.0 scope. Optional Python install is the only crossover.
- Auto-wire ChatGPT Desktop, Gemini CLI / Antigravity, or other MCP hosts. The summary screen shows a copy-paste snippet for any non-Claude client.
- Telemetry, crash reporting, analytics. None.
- Localization. English only.
- Self-update of the installer itself beyond "re-run = upgrade." No background service.
- University-specific branding. The installer ships with a generic-enough palette and logo to share with peers.

## 4. Architecture

### 4.1 What ships

One artifact per OS, attached to a GitHub Release tagged `v*.*.*`:

| Artifact | OS | Approx size |
| --- | --- | --- |
| `canvas-toolchain-installer-windows-x64.exe` | Windows 10/11 | ~45 MB |
| `canvas-toolchain-installer-macos-arm64.pkg` | macOS 12+ Apple Silicon | ~40 MB |
| `canvas-toolchain-installer-macos-x64.pkg` | macOS 12+ Intel | ~40 MB |

Each artifact embeds:

- The Go + Fyne installer binary (~5 MB)
- A version-matched Node 18 LTS runtime for the target OS (~30 MB)
- A version-matched canvas-toolchain source payload (~5 MB, see §4.3)
- UI assets — color palette, logo, screen images (~1 MB)

No code signing. Release notes include a labelled screenshot of the Windows SmartScreen "More info → Run anyway" path and the macOS "System Settings → Privacy & Security → Open Anyway" path.

### 4.2 What it installs on the user's machine

After a successful run, the user's machine has:

```
<install-dir>/                            # default: %USERPROFILE%\canvas-toolchain or ~/canvas-toolchain
├── .canvas-toolchain-version             # text file, single line: installed semver tag
├── .node/                                # bundled Node runtime (private to this install)
│   └── node{.exe}, npm
├── packages/                             # full TS monorepo, post-build
│   ├── command-and-control/
│   ├── canvas-design-studio/
│   ├── curriculum-intelligence/
│   └── shared-types/
├── node_modules/                         # populated by npm install at install time
├── package.json
└── ...
```

And in the user's home directory (untouched on update):

```
~/.command-and-control/
├── config.json                           # written by saveConfig; installer seeds defaults only
├── panopto-config.json                   # written only if user filled Panopto fields, mode 0o600
└── ...
~/.canvas-design-studio/                  # if/when CDS adopts the same pattern
```

And in MCP host config (one or both — never destructive):

```
# Claude Desktop (Mac path)
~/Library/Application Support/Claude/claude_desktop_config.json

# Claude Desktop (Windows path)
%APPDATA%\Claude\claude_desktop_config.json

# Claude Code CLI
~/.claude.json
```

In each, the installer adds or updates the `canvas-toolchain` MCP server entry only — preserves all other MCP entries the user has.

And shortcuts:

| OS | Shortcut location | Target |
| --- | --- | --- |
| Windows | Desktop + Start Menu | `Canvas Toolchain Updater.lnk` → updater stub |
| macOS | `/Applications/Canvas Toolchain Updater.app` | updater stub |

### 4.3 Source payload

The "embedded canvas-toolchain payload" is a `installer-payload.tar.gz` built by CI on tag push. It contains the post-`npm run build` monorepo minus `node_modules/` (which is regenerated on the user's machine — same Node version, so reproducible). Embedded into the Go binary via `//go:embed installer-payload.tar.gz`.

Rationale for shipping post-build rather than source-only: avoids needing a working `tsc` on the user's machine, and avoids subtle TypeScript version drift. The user's `npm install` only resolves runtime deps.

### 4.4 Bundled Node runtime

Downloaded from `nodejs.org/dist/v18.20.x/` during CI build, per-OS:

- Windows: `node-v18.20.x-win-x64.zip`
- macOS Intel: `node-v18.20.x-darwin-x64.tar.gz`
- macOS Apple Silicon: `node-v18.20.x-darwin-arm64.tar.gz`

Unpacked at CI time, the OS-appropriate version is embedded into that artifact's Go binary. The installer extracts the bundled Node to `<install-dir>/.node/` and uses that explicit path for `npm install` and `npm run build` — never relies on the user's `PATH`.

The MCP server registration in Claude Desktop config uses the bundled Node's absolute path too:

```json
{
  "mcpServers": {
    "canvas-toolchain": {
      "command": "<install-dir>/.node/node",
      "args": ["<install-dir>/packages/command-and-control/dist/index.js"]
    }
  }
}
```

This means an MCP host launching the server doesn't depend on user PATH or system Node either.

## 5. The 5-screen wizard

### Screen 1 — Welcome, prereqs, install location

**Top half:** Logo + "Canvas Toolchain Installer" title + version string + one-paragraph what-this-is.

**Middle:** A single prereq row.

- Disk space (~500 MB free at install path) — green check if OK, red X with byte count if not.

No Node check (bundled). No Git check (source bundled). No Python check unless the optional Python toggle on screen 2 is selected (in which case we re-validate after this screen).

**Bottom:** Install location row.

```
Install to: [%USERPROFILE%\canvas-toolchain                 ] [Browse...]
            ▶ Advanced
```

Clicking the "▶ Advanced" disclosure expands to show:

- A "Reset to default" button
- A note: "The installer creates this directory if it doesn't exist."

If the user picks an existing canvas-toolchain install (detected by `.canvas-toolchain-version` file), the installer switches into update mode — see §7.

[ Next > ]   [ Cancel ]

### Screen 2 — Workflow selector

Checkboxes (default state in brackets):

- ☑ Canvas course management — generate, review, publish pages
- ☐ Panopto pipeline — bulk transcript download + enrichment
- ☐ Curriculum Intelligence — semester comparison + course analysis
- ☐ Registry — multi-course tracking

The selection affects which API fields appear on screen 3 and which `setup_*` reminders appear on screen 5. It does **not** slice the source — the whole monorepo always installs.

Below, a separator and an "Optional extras" group with one toggle:

- ☐ Install Python 3 (needed later for Canvas Backup — not configured here)

If checked, screen 4 will download and silently install the official Python 3.12.x installer from python.org for the user's OS.

[ < Back ]   [ Next > ]   [ Cancel ]

### Screen 3 — API credentials

All fields optional. Fields shown depend on screen 2 selections.

**Always shown:**

- **Anthropic API key** — `sk-ant-...` — "Powers all AI features." Link: `platform.anthropic.com/account/api-keys`. Masked input.
- **Canvas host** (optional, paired with token) — defaults to `example.instructure.com`. Editable. Help text: "Your school's Canvas URL — usually `<school>.instructure.com`."
- **Canvas API token** (optional) — "Needed only to publish pages directly to Canvas — manual paste workflow always works without this." Link: "Canvas → Account → Settings → New Access Token." Masked input.

**Shown if Panopto checked:**

- **Panopto domain** — e.g. `example.hosted.panopto.com`
- **Panopto OAuth client ID** — "Panopto admin → API Clients." Masked input.
- **Panopto OAuth client secret** — "Same place as the client ID." Masked input.
- "Iframe whitelisted?" — radio: Yes / No / Don't know.

A "Skip — I'll add these later" link at the bottom moves the user to screen 4 with nothing entered. The summary screen will explain which `setup_*` MCP tool to run for each skipped item.

Validation on "Next": for fields the user filled, basic format check only (Anthropic key starts with `sk-ant-`, Panopto domain looks like a host). Live API validation happens inside screen 4 step "Validate credentials" — failures there surface as warnings, not blocks, because the user might be on a flaky network.

[ < Back ]   [ Next > ]   [ Skip — I'll add these later ]   [ Cancel ]

### Screen 4 — Installation

A vertical task list with a per-task spinner, check, or error icon. Each task logs to a hidden text area, surfaced by "Show log."

Step order:

1. Create install directory (if new) or detect existing version (if update).
2. Extract embedded Node runtime to `<install-dir>/.node/`.
3. Extract embedded source payload to `<install-dir>/`.
4. Run `npm install` using bundled Node (`<install-dir>/.node/node <install-dir>/.node/lib/node_modules/npm/bin/npm-cli.js install`). Working directory: `<install-dir>`. Streams output to log.
5. Write per-feature config files under `~/.command-and-control/` (config.json defaults always; panopto-config.json only if user filled all three Panopto fields). Mode `0o600`, atomic write (write `.tmp`, rename) — matching the existing `setupPanopto` pattern in `packages/command-and-control/src/tools/setup_panopto.ts`.
6. If user filled Anthropic key, store it as `~/.command-and-control/anthropic-config.json` (mode `0o600`). C&C reads this at runtime — see §10.
7. If user filled Canvas token, store it as `~/.command-and-control/canvas-config.json` (mode `0o600`).
8. If user opted into Python install: download official python.org installer for OS, run silently. Windows: `python-3.12.x-amd64.exe /quiet PrependPath=1 Include_test=0`. macOS: download `.pkg`, run `installer -pkg <path> -target /` (requires sudo on Mac — prompt the user).
9. Write or update Claude Desktop config (`claude_desktop_config.json` at OS-appropriate path). Merge — preserve other `mcpServers` entries; add/replace the `canvas-toolchain` entry.
10. Write or update Claude Code CLI config (`~/.claude.json`). Same merge behavior.
11. Drop `Canvas Toolchain Updater` shortcut/app on Desktop + Start Menu (Win) or Applications (Mac).
12. Live-validate credentials in parallel (non-blocking, results surface on screen 5):
    - Anthropic key: real API call — POST a 1-token completion request to `api.anthropic.com/v1/messages` with `model: claude-haiku-4-5-20251001, max_tokens: 1, messages: [{role:"user", content:"."}]`. 401/403 = invalid key, other errors = network problem (warning, not failure).
    - Canvas token: `GET /api/v1/users/self` against the Canvas host the user entered on screen 3. 401 = invalid token; 200 = valid.
    - Panopto creds: existing `getPanoptoToken` call (imported from `@canvas-toolchain/canvas-design-studio/dist/tools/panopto.js` — already proven against Panopto in `setup_panopto.ts`).

If any step fails, the corresponding row turns red with a one-line error. The bottom of the screen shows three buttons:

- [ Retry ] — re-runs only the failed step
- [ Open install dir ] — opens Explorer / Finder at `<install-dir>`
- [ Report issue ] — opens browser to `github.com/Ryfter/canvas-toolchain/issues/new?template=installer-bug.md` with OS, version, and the last 50 log lines pre-filled

The "Next" button is enabled when all required steps (1-3 always; 4 always; 9-11 if any MCP host was found installed) succeed. Optional credential steps (5-7, 12) failing do NOT block — they show as warnings on screen 5.

[ Show log ]   [ Cancel ]   [ Next > ]

### Screen 5 — Summary + next steps

**Top:** Green checklist of what was installed:

- ✓ Canvas Toolchain v0.9.x installed to `<install-dir>`
- ✓ Wired to Claude Desktop
- ✓ Wired to Claude Code
- ✓ Updater shortcut on Desktop
- (✓ Python 3.12.x installed) — only if opt-in

**Middle:** Yellow notes for anything skipped:

- ⚠ Anthropic API key not set — run `setup_anthropic` in Claude Desktop to add it.
- ⚠ Canvas API token not set — run `setup_canvas` to add it (only needed for direct page publishing).
- ⚠ Panopto credentials not set — run `setup_panopto` to add them when you're ready.

**Lower middle:** A collapsed "Other MCP hosts" expander. Expanded, it shows a copy-paste-ready JSON snippet for any non-Claude MCP host, with the bundled-Node absolute path and the `dist/index.js` path filled in.

**Bottom:** Two buttons:

- [ Launch Claude Desktop ] — primary, blue. Closes installer.
- [ Done ] — secondary. Closes installer without launching.

## 6. MCP host config writes

### 6.1 Claude Desktop

Path:
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Win: `%APPDATA%\Claude\claude_desktop_config.json`

If file doesn't exist, create it as:

```json
{
  "mcpServers": {
    "canvas-toolchain": {
      "command": "<install-dir>/.node/node",
      "args": ["<install-dir>/packages/command-and-control/dist/index.js"]
    }
  }
}
```

If file exists, parse it, set `mcpServers["canvas-toolchain"]` to the above value (replacing any prior entry), preserve all other keys, write back atomically (`.tmp` + rename).

### 6.2 Claude Code CLI

Path: `~/.claude.json`. Same merge logic. If the user is using project-scoped Claude Code config instead of global, the installer notes this on screen 5 and shows the snippet for manual paste — it does not edit project-scoped files.

### 6.3 Detection

Before writing, the installer checks whether Claude Desktop and Claude Code are installed:

- Claude Desktop installed = the parent directory of the config path exists (`~/Library/Application Support/Claude/` or `%APPDATA%\Claude\`).
- Claude Code installed = `claude` is on PATH OR `~/.claude/` directory exists.

If neither host is detected, the installer skips both writes and surfaces the snippet on screen 5 only. Screen 4's MCP wiring step shows "No MCP host detected — see summary for setup instructions" rather than an error.

## 7. Update mechanism

### 7.1 Updater shortcut

The `Canvas Toolchain Updater` shortcut runs a tiny **stub** binary (~500 KB) — not the full installer. The stub:

1. Reads `<install-dir>/.canvas-toolchain-version` to get the installed version.
2. Calls `GET https://api.github.com/repos/Ryfter/canvas-toolchain/releases/latest` to get the latest version.
3. If equal, shows a small modal: "Canvas Toolchain is up to date (v0.9.3)." with an [ OK ] button.
4. If newer, shows: "Update available: v0.9.3 → v0.9.4. Update now?" with [ Update ] / [ Skip ] buttons.
5. On [ Update ]: downloads the appropriate full installer .exe / .pkg for the OS from the release, runs it, exits. The full installer detects existing install and switches into update mode (see §7.3).

The stub never writes anything itself. All write logic stays in the main installer.

### 7.2 MCP nudge

Implemented inside `packages/command-and-control/src/index.ts` (the MCP server's startup path), not in the installer. The installer does not need to add this — it's a feature of C&C that the installer just enables transitively by installing the latest version.

On C&C startup:

1. Read `<install-dir>/.canvas-toolchain-version` (looked up via the package's own location).
2. Read `<install-dir>/.canvas-toolchain-update-cache.json` — if last check was within 24h, skip.
3. Otherwise `GET https://api.github.com/repos/Ryfter/canvas-toolchain/releases/latest` with a 5-second timeout.
4. Cache the result with a fresh timestamp.
5. If latest > installed, set an in-process flag.

When any C&C tool returns a response, if the flag is set, append a single line to the response text: `\n\n_Update available: v0.9.4 — click the Canvas Toolchain Updater shortcut to upgrade._`

This is non-blocking, network-failure-safe (silent skip on timeout), and rate-limited via the 24h cache.

### 7.3 Full installer in update mode

When the main installer runs and detects an existing `.canvas-toolchain-version` at the chosen install path:

- Skip screen 2 (workflow selector — keep existing selections, stored in `<install-dir>/.canvas-toolchain-selected-workflows.json` written by the original install)
- Skip screen 3 (API collection — keep existing config)
- Screen 4 changes label from "Installing" to "Updating," skips Python step (already done if user wanted it), runs all other steps. `npm install` is a no-op if `package-lock.json` matches.
- Screen 5 says "Updated to v0.9.4" instead of "Installed."

Config preservation is automatic: the installer writes only `<install-dir>/` (which it owns) and modifies host MCP configs to point at the new version. It never touches `~/.command-and-control/`, `~/.canvas-design-studio/`, etc. during update.

If the user re-runs the full installer but chooses a different install path, it treats that as a fresh install (no merge with old install).

## 8. Source layout

```
installer/
├── go.mod
├── go.sum
├── main.go                              # Fyne app entry; wires screens
├── screens/
│   ├── welcome.go                       # screen 1
│   ├── workflows.go                     # screen 2
│   ├── credentials.go                   # screen 3
│   ├── install.go                       # screen 4
│   └── summary.go                       # screen 5
├── tasks/
│   ├── extract.go                       # bundle extraction
│   ├── npm.go                           # npm install + build wrapper
│   ├── configs.go                       # ~/.command-and-control/* writers
│   ├── mcphost.go                       # Claude Desktop + Claude Code config merge
│   ├── shortcuts.go                     # OS-specific shortcut creation
│   ├── python.go                        # optional Python install
│   └── validate.go                      # live credential validation
├── update/
│   ├── stub_main.go                     # separate binary; build tag `updater_stub`
│   └── github.go                        # release lookup
├── ui/
│   ├── theme.go                         # university-neutral palette, font setup
│   ├── widgets.go                       # custom widgets (masked input, progress row)
│   └── assets/
│       ├── logo.png
│       └── ...
├── payload/
│   ├── .gitignore                       # ignore *.tar.gz and node-*
│   └── README.md                        # explains: CI puts files here, not committed
├── docs/
│   ├── specs/
│   │   └── 2026-05-26-installer-design.md   # this file
│   └── plans/                                # writing-plans output goes here
└── README.md                                 # build instructions
```

The `payload/` directory holds `installer-payload.tar.gz` and the per-OS Node tarballs at CI build time. Both are gitignored. Go's `embed` directive reads from this directory.

A separate CI workflow (`release-installer.yml` in `.github/workflows/`) handles the build matrix:

```yaml
strategy:
  matrix:
    include:
      - os: ubuntu-latest      # cross-compile Windows from here
        goos: windows
        goarch: amd64
        node-platform: win-x64
      - os: macos-latest       # native Mac arm64
        goos: darwin
        goarch: arm64
        node-platform: darwin-arm64
      - os: macos-13           # native Mac x64
        goos: darwin
        goarch: amd64
        node-platform: darwin-x64
```

Each job:

1. Checks out the tagged commit.
2. Runs `npm install` and `npm run build` at the monorepo root.
3. Packs the monorepo (minus `node_modules`) into `installer/payload/installer-payload.tar.gz`.
4. Downloads the matching Node tarball into `installer/payload/`.
5. `cd installer && go build -tags=updater_stub -o updater-stub ./update` then embeds the stub into the main installer binary.
6. `cd installer && go build -ldflags '-X main.Version=$TAG' -o canvas-toolchain-installer-<os>-<arch>.<ext> .`
7. (macOS only) wraps the binary in a `.pkg` via `pkgbuild`.
8. Attaches the artifact to the GitHub Release.

## 9. Error handling

Per step. Never roll back automatically.

| Failure | Behavior |
| --- | --- |
| Disk space check fails on screen 1 | Block "Next." Show needed vs available. |
| Install path not writable | Block "Next." Show error, suggest a different path. |
| Bundle extract fails (corrupted .exe / permissions) | Screen 4 row red. Retry. If still fails, [ Report issue ]. |
| `npm install` fails | Show last 20 lines of npm output inline. Retry. Common causes: network, disk full mid-install. |
| MCP config file is malformed JSON | Don't overwrite. Show error: "Existing Claude Desktop config has a JSON error — fix it and click Retry, or skip and we'll show you the snippet to paste manually." |
| Anthropic / Canvas / Panopto live validation fails | Warning only. Screen 5 shows "⚠ Anthropic key validation failed — try `setup_anthropic` from Claude Desktop." Not a block. |
| Python installer download fails | Warning only. Screen 5 shows "⚠ Python install failed — download it from python.org when you're ready." |
| GitHub Releases API down (during update check) | Stub: silent skip, show "Up to date" (assume so). MCP nudge: silent skip, don't append the notice. |

User can always quit at any screen via [ Cancel ] / window close. Quitting mid-install leaves whatever partial state exists; rerunning detects what's already done and continues from there.

## 10. Anthropic / Canvas / Python config integration

The C&C package currently doesn't have a `setup_anthropic` or `setup_canvas` MCP tool — only `setup_panopto`. The installer's credential writes for these need a matching read path in C&C.

**Three follow-up C&C issues** to file alongside the installer plan:

- **`setup_anthropic` tool** + `loadAnthropicConfig` reader at `packages/command-and-control/src/tools/setup_anthropic.ts`. Follows the `setupPanopto` pattern: writes `~/.command-and-control/anthropic-config.json` mode 0o600 atomically. The installer depends on this contract for its credential write.
- **`setup_canvas` tool** + `loadCanvasConfig` reader at `packages/command-and-control/src/tools/setup_canvas.ts`. Same pattern. Stores `{host, token, configuredAt, lastValidatedAt}`. The installer depends on this contract.
- **Update-nudge feature** in `packages/command-and-control/src/index.ts` per §7.2 — background GitHub Releases check on server start, 24h cache file at `<install-dir>/.canvas-toolchain-update-cache.json`, appends a single-line notice to tool responses when newer release exists. The installer does not implement this — it ships the C&C build that contains it.

All three follow-ups are smaller than the installer itself and should be done **first**, in parallel, so the installer has contracts to target. They can ship in v0.9.x patch releases before v1.0.

## 11. Open implementation questions

These are resolved in the implementation plan, not the spec:

- Exact Node 18 LTS patch version. Recommend 18.20.x (latest as of plan time).
- Asset compression. Go's `embed` doesn't compress; tar.gz is already compressed. Per-OS Node tarballs ship as-downloaded.
- Whether the Mac `.pkg` is just a `pkgbuild` wrapper (no signing per non-goals).
- Whether the stub updater on Mac is a `.app` bundle or a plain binary. Recommend `.app` for Dock/Spotlight visibility.
- Exact prompt text for the macOS sudo prompt on Python install.
- Specific GitHub Issue template for `?template=installer-bug.md`.
- **GitHub API rate limit handling.** Unauthenticated GitHub API allows 60 requests/hour per IP. The MCP nudge is rate-limited by the 24h cache. The updater stub is not cached — a user clicking it 60+ times an hour is unrealistic but the stub should still handle 403/429 gracefully ("Couldn't check for updates right now — try again later").

## 12. Testing strategy

Unit tests (Go's `testing` package) for everything that doesn't touch the GUI:

- `tasks/extract` — round-trip a known payload, verify file count and checksums.
- `tasks/npm` — exec a fake npm script, verify exit-code handling.
- `tasks/configs` — write to a temp dir, verify atomic write semantics (no partial file on crash mid-write).
- `tasks/mcphost` — merge logic across "no existing file," "existing file with our entry," "existing file without our entry," "existing file with malformed JSON."
- `tasks/shortcuts` — verify .lnk and .app generation via filesystem assertions.
- `update/github` — mock HTTP server returning known release JSON, verify version comparison.

End-to-end manual test plan (documented in `installer/docs/manual-test-plan.md`, written as part of plan execution):

- Fresh Windows install on a clean VM.
- Fresh Mac install on a clean VM (both Intel and Apple Silicon).
- Update from v0.9.0 to v0.9.1 (when v0.9.1 exists) — verify config preservation.
- Install with zero APIs filled — verify summary shows all three `setup_*` prompts.
- Install with all APIs filled — verify validation runs and surfaces correct success/failure.
- Install with malformed existing Claude Desktop config — verify non-destructive behavior.
- Cancel mid-install — verify no zombie processes, partial state is recoverable.

GUI smoke tests (Fyne's `test.NewWindow` etc.) for screen wiring — not for visual layout.

## 13. Out of scope (restated)

- Canvas-Download setup (Python sidecar). Opt-in Python install only.
- ChatGPT / Gemini MCP auto-wiring. Snippet only.
- Telemetry, analytics, error reporting.
- Localization.
- Code signing.
- Auto-launch of MCP server outside of Claude Desktop / Claude Code (the hosts handle launch).

## 14. Sequence to implementation

1. This spec, approved.
2. `superpowers:writing-plans` produces `installer/docs/plans/2026-05-26-installer.md`.
3. File the three C&C follow-up issues (`setup_anthropic`, `setup_canvas`, update-nudge) — execute these first in parallel, ship them in v0.9.x patches, so the installer has stable contracts to target.
4. Hand the Go installer plan to Codex via `codex:codex-rescue`.
5. Hand the GitHub Actions release workflow to Codex via `codex:codex-rescue` (separate subagent — different context).
6. Manual end-to-end testing on the professor's machine + at least one clean VM.
7. Tag `v1.0.0`, ship the release.
