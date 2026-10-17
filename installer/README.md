# Canvas Toolchain Installer

Self-contained native installer for canvas-toolchain. Written in Go using Fyne.
The installer unpacks a prebuilt canvas-toolchain onto the user's machine,
installs its runtime dependencies (`npm ci --omit=dev` — the payload already
carries a built `dist/`, so nothing is compiled on this machine), optionally
installs Python 3, and creates an Updater shortcut.

The installer collects no credentials. Setup finishes in the professor's AI app:
the last screen says to open it and say "get started". A config already on disk
is never rewritten — installing over an existing `~/.command-and-control` or
`~/.canvas-design-mcp` leaves those files exactly as they were.

Before the final screen it runs the installed toolchain's own setup check
(`node packages/canvas-toolchain/bin/canvas-toolchain.mjs doctor --json`) and
shows that report — per-capability readiness, every finding, and the operation
that fixes it. If the check cannot run, the summary says the install is
unverified; the doctor never blocks or fails an install.

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

To exercise the full install path locally, pack a payload with the script CI
uses:

    bash installer/scripts/pack-payload.sh
    bash installer/scripts/download-node.sh darwin-arm64   # or win-x64 / darwin-x64
    cd installer
    go build -ldflags '-X main.Version=v0.0.0-dev' -o canvas-toolchain-installer .

`pack-payload.sh` builds the monorepo, then packs `packages/` (with their built
`dist/`) plus `package.json`, `package-lock.json` and `tsconfig.base.json` —
never `node_modules`. Two things about the packed manifest matter:

- **The repo's `prepare` script is stripped from the packed `package.json`.**
  `prepare` is `npm run build`, and npm runs `prepare` on every install (`npm
  install` and `npm ci` alike). The payload ships a prebuilt `dist/`, so leaving
  it in would put `tsc` on the professor's laptop — the work this payload exists
  to remove. Everything else (deps, workspaces, `allowScripts`, `overrides`)
  reaches the client unchanged.
- **`node_modules` is not packed** — it is platform-specific (the Windows
  installer is cross-compiled on an ubuntu runner, so a vendored tree would carry
  Linux binaries for `better-sqlite3` and `sqlite-vec`). The installer therefore
  still runs `npm ci --omit=dev` on the client to fetch runtime dependencies.

For a script-only check without a build (used by
`installer/scripts/pack_payload_test.go`):

    PACK_PAYLOAD_SKIP_BUILD=1 PACK_PAYLOAD_OUT=/tmp/payload.tar.gz \
      bash installer/scripts/pack-payload.sh

### Release build

Release builds run in CI — see Plan 3 and `.github/workflows/release-installer.yml`.

## Updater stub

The Updater shortcut launches a tiny separate binary:

    go build -o canvas-toolchain-updater ./update/cmd/updater

## Tests

    go test ./...

## Manual test plan

See `docs/manual-test-plan.md`.
