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
5. Step through all 4 screens (welcome → workflows → install → summary) with default options.
6. Verify after close:
   - `%USERPROFILE%\canvas-toolchain\` exists with the unpacked monorepo.
   - `%USERPROFILE%\canvas-toolchain\.canvas-toolchain-version` contains the version.
   - `%APPDATA%\Claude\claude_desktop_config.json` has a `canvas-toolchain` mcpServers entry.
   - `%USERPROFILE%\canvas-toolchain\canvas-toolchain-updater.exe` exists (the embedded updater, written during install).
   - Desktop has "Canvas Toolchain Updater" shortcut, and its target resolves to that `.exe`.
   - The install screen listed **no build row**, and its log's only npm line is `ci --omit=dev`.
   - `%USERPROFILE%\canvas-toolchain\packages\command-and-control\dist\index.js` exists — it came from the payload, not from a build on this machine.

### T2 — Fresh Mac install (Apple Silicon)

Same as T1 but with `.pkg` on macOS 12+ Apple Silicon. Verify Gatekeeper bypass path.

(Intel Mac is intentionally out of scope. The release matrix only builds `macos-arm64`; see `.github/RELEASE_TEMPLATE/installer-release.md`.)

### T4 — Update from v0.9.0 to v0.9.1

1. Install v0.9.0 fresh.
2. Run the v0.9.1 installer.
3. Verify:
   - Screen 1 detects existing install ("Update mode").
   - The workflows screen is skipped; the wizard goes straight to the install screen.
   - The install runs without touching `~/.command-and-control/` config files.
   - Updated version marker file reflects v0.9.1.
   - `anthropic-config.json`, `canvas-config.json` and `panopto-config.json` under
     `~/.command-and-control/`, and `institution.json` under `~/.canvas-design-mcp/`,
     are byte-identical to before (compare hashes).

### T5 — Install collects no credentials

There is no credentials screen: the wizard cannot take a key or token at all.

1. Fresh install; click through the wizard (welcome → workflows → install → summary).
2. Verify the summary screen's **Setup readiness** section (it shows what the
   installed toolchain's own setup check reports, not the installer's guesses):
   - "Local authoring", "Canvas connected" and "AI assisted" each show a yellow
     ⚠ with "not set up yet".
   - Each warn check is listed with the operation that fixes it, e.g.
     `Fix: ct_setup canvas — Run ct_setup action canvas with your Canvas host and API token.`
   - "Panopto workflow selected — your AI app finishes Panopto setup
     (setup_panopto)." appears only if the Panopto workflow was ticked.
   - The screen ends with `Next step: open your AI app and say "get started".`
3. Verify the installer wrote none of `~/.command-and-control/anthropic-config.json`,
   `canvas-config.json` or `panopto-config.json` when they did not already exist.
4. Run `get started` inside an MCP client: it should walk through the same list.

### T6 — Setup finishes in the AI app

1. Install, then open the wired MCP client and say "get started".
2. Verify the assistant walks through what is left (Canvas / Anthropic / Panopto)
   and that `ct_setup` applies it; afterwards `ct_setup doctor` (or
   `npx canvas-toolchain doctor --json`) reports those capabilities green.
3. Re-run the installer (update mode) and verify the credentials written in step 2
   are byte-identical: the installer merges `modules.json` and never rewrites a
   credential file.

### T11 — Summary when the setup check cannot run

The setup check runs at the end of the install and reads what the earlier steps
wrote, so the way to break it by hand is to take part of it away while those
steps are still running (the runtime-dependency install takes minutes):

1. Fresh install; click through to the install screen.
2. While "Install runtime dependencies" is running, delete the entrypoint the
   check spawns:
   `rm "<install dir>/packages/canvas-toolchain/bin/canvas-toolchain.mjs"`.
3. Verify:
   - The install still completes — "Setup check (doctor)" shows a yellow ⚠, and
     nothing on the install screen turns red.
   - The summary's setup section shows a short `Setup check unavailable — installed
     entrypoint missing at …` note and the `not verified yet` line.
   - No "Local authoring / Canvas connected / AI assisted" rows appear: the
     installer never invents a readiness verdict it did not get.
   - The `Next step: open your AI app and say "get started"` line still appears.
4. Reinstall (or restore the file) to get back to a working tree.

The same fallback is covered by unit tests for the other causes: missing node
runtime, a timeout, and an unreadable report.

### T12 — Version marker semantics

The marker (`.canvas-toolchain-version`) is written unless the setup check
reports `fail`. On a real machine the check runs the full journey, which reports
`warn` at worst — so the marker is written as it always has been, and update mode
(T4) is unaffected. The withheld case is unit-tested
(`installer/screens/install_test.go`, `TestVersionMarkerStep_FollowsTheDoctor`),
because it cannot be produced by a working toolchain.

### T7 — Install with malformed Claude Desktop config

1. Pre-create `claude_desktop_config.json` with invalid JSON.
2. Run installer.
3. Verify: "Claude Desktop" step shows an error with a clear message; install can complete with the warning surfaced on the summary.

### T8 — Cancel mid-install

1. Run installer; on the install screen, click Cancel while the runtime-dependency install is running.
2. Verify no zombie node/npm process; installer exits cleanly.

### T9 — Disk space insufficient

Use a path on a small volume (e.g. a tiny VM volume) and verify screen 1 blocks Next with a clear message.

### T10 — Updater shortcut behavior

1. After install, click the Updater shortcut.
2. Verify: tiny window appears, status updates to "Up to date" (since this is the latest).
3. Simulate a newer release by manually editing `.canvas-toolchain-version` to a lower number.
4. Click the shortcut again; verify "Update available" appears with Update/Skip buttons.

### T13 — The payload is prebuilt (nothing compiles on this machine)

The installer used to run `npm install` and then `npm run build`. Both are gone:
the payload ships a built `dist/`, and `pack-payload.sh` strips the repo's
`prepare` script — which npm runs on *every* install — so the client install
cannot rebuild either.

1. Fresh install on a clean VM with no TypeScript toolchain of any kind.
2. Verify the install screen's rows: "Install runtime dependencies" is present and
   there is no build row, and the log's only npm line is `ci --omit=dev`.
3. Verify no `tsc` process or `npm run build` appears in the log, and that
   `packages/command-and-control/dist/index.js` exists with the payload's timestamp
   (unpacked, not written during the install).
4. Verify `<install dir>/node_modules` has no `typescript`, `vitest` or `tsx`
   (dev dependencies are omitted).
5. Sanity-check the packed manifest by hand:
   `tar -xzOf installer/payload/installer-payload.tar.gz package.json | grep prepare`
   must print nothing.
