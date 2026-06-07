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

(Intel Mac is intentionally out of scope. The release matrix only builds `macos-arm64`; see `.github/RELEASE_TEMPLATE/installer-release.md`.)

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
