# Canvas Toolchain Installer

## What's new in v1.1.0

- **`publish_course` workflow (#64)** — push an entire Canvas Design Studio course folder to a Canvas course as one reviewed transaction. Three MCP tools work together:
  - `preview_course_publish` — read-only manifest with per-page diffs, FERPA/accessibility warnings, and collision detection (no Canvas writes).
  - `publish_course` — explicit per-entry approvals, stop-on-failure, snapshot bundles for rollback (under `~/.command-and-control/publish-snapshots/`), optional git commit + tag of the source folder.
  - `rollback_course_publish` — restore every successfully-published entry to its prior Canvas state.
  - Verified end-to-end against a real BSU sandbox course before this release.
- **Panopto Whisper transcript comparison (#60)** — opt-in side-by-side accuracy comparison between Panopto's auto-captions and locally-run Whisper. Useful for figuring out which source you trust for a given lecturer's voice + discipline vocabulary. Disabled by default (`setup_transcript_source` to enable).
- **#79 publish_course polish** — rollback URL double-encoding fix for titles with special characters; front-matter title now flows through to `intendedTitle` matching so `wk1-overview.html` correctly matches a Canvas page titled "Week 1 Overview"; `fullDiffFor` parameter now surfaces inline unified diffs in the manifest; HTML entity stripping handles numeric/hex entities (`&#160;`, `&#x2019;`).
- **Two production bugs fixed during #60 verification:** multi-Python-version detection now probes for `faster_whisper` availability before picking a Python; filler-word filter is now case + punctuation insensitive ("Uh," matches "uh").

Full diff: [v1.0.0...v1.1.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.0.0...v1.1.0)

## Download

| OS | File |
| --- | --- |
| Windows 10/11 (64-bit) | `canvas-toolchain-installer-windows-x64.exe` |
| macOS 12+ (Apple Silicon) | `canvas-toolchain-installer-macos-arm64.pkg` |

> **Intel Macs not supported.** Apple Silicon (M1 or later) only. Intel Mac builds were dropped in v0.9.1 because GitHub Actions' `macos-13` runner queue made releases unviable.

## First-run bypass

This installer is **not code-signed** (we ship for free; signing certs aren't free). One-time bypass:

### Windows — SmartScreen

1. Double-click the `.exe`. SmartScreen warns "Windows protected your PC."
2. Click **More info**.
3. Click **Run anyway**.

That's it. Once the installer runs, it sets up canvas-toolchain and never re-prompts.

### macOS — Gatekeeper

1. Double-click the `.pkg`. Gatekeeper says "Apple could not verify…"
2. Click **Done**.
3. Open **System Settings → Privacy & Security**.
4. Scroll to the bottom; click **Open Anyway** next to the canvas-toolchain installer notice.
5. Re-double-click the `.pkg`; click **Open** at the second Gatekeeper prompt.

## What it installs

The installer drops the canvas-toolchain source onto your machine, installs npm dependencies using a bundled Node 18 runtime (no Node prereq required), wires the MCP server into Claude Desktop and Claude Code CLI, and creates a Desktop / Applications "Canvas Toolchain Updater" shortcut for one-click updates.

## What it does NOT install

- Anything outside the install directory you chose
- Anything in `~/.command-and-control/` is preserved across updates
- Telemetry, analytics, or remote calls beyond the optional update check against GitHub Releases

## Reporting issues

Use the [installer-bug issue template](https://github.com/Ryfter/canvas-toolchain/issues/new?template=installer-bug.md).

Include: your OS + version, the last 50 lines of the installer log (click "Show log" on the install screen), and what you were doing when it failed.
