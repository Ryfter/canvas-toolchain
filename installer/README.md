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
    # Place an OS-matched Node 24.x tarball at:
    cp ~/Downloads/node-v18.20.x-darwin-arm64.tar.gz installer/payload/node-runtime.tar.gz
    cd installer
    go build -ldflags '-X main.Version=v0.0.0-dev' -o canvas-toolchain-installer .

### Release build

Release builds run in CI — see Plan 3 and `.github/workflows/release-installer.yml`.

## Updater stub

The Updater shortcut launches a tiny separate binary:

    go build -o canvas-toolchain-updater ./update/cmd/updater

## Tests

    go test ./...

## Manual test plan

See `docs/manual-test-plan.md`.
