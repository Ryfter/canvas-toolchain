# Canvas Toolchain Installer

## What's new in v1.2.0

Five features landed since v1.1.0, all in the refresh + content-creation surface of the toolchain.

### Refresh workflow improvements

- **Lossless `import_course` (#80)** — new `preserveOriginalHtml: true` mode lifts source HTML body verbatim from a Canvas Backup archive into the imported markdown, bypassing the structural extractor that was silently dropping ~90% of body content for any course whose HTML didn't follow CDS's expected `## Learning Objectives` / `## Activities` section layout. With the flag, ~100× more content survives the import. Default behavior (no flag) is unchanged.
- **Pre-existing whitespace-trim bug fixed in passing** — Canvas's `items.json` sometimes serializes page titles with trailing whitespace, which canvas-backup strips on disk; the exact-match lookup was silently returning empty bodies. Fix benefits extraction mode too.

### Course documentation as a first-class output

- **`snapshot_course` MCP tool (#81)** — writes (and on re-run, updates) a per-course markdown reference doc capturing live course identifiers, assignment groups, modules, and an append-only Update Log. Four auto-managed sections live inside `<!-- AUTO:start id="..." -->` markers; hand-edited prose between markers is preserved verbatim across re-runs. Missing sections (manually deleted) are appended on recovery. Pattern: snapshot the toolchain-observed state alongside the prof's hand-written reference content.

### Rubric system end-to-end

- **`rubric` page type (#67 Part A)** — new CDS page type for student-facing rubrics with three blocks per criterion (student-facing rewrite, worked example, faculty rubric language). `generate_course` produces a Canvas-safe HTML page AND emits a `.md` file alongside for students to download and paste into an LLM for personalized help. Render uses BSU brand tokens, callouts, and a collapsible `<details>` for the faculty rubric language.
- **`draft_student_rubric` MCP tool (#67 Part B)** — takes a faculty-facing rubric and uses the Anthropic API to produce a student-facing rewrite + worked examples per criterion. Outputs the markdown matching the Part A schema. Faculty rubric language is preserved verbatim for sync.

### Interactive widget brainstorming

- **`brainstorm_interactive` MCP tool (#45)** — propose 2-3 distinct interactive Canvas widget concepts (sliders, card flips, sortable orderings, branching scenarios, etc.) for a given topic + learning goal. Returns structured `InteractiveSpec`s ready for a future render step. Optional context: professor philosophy KB, student personas, audience tags. Built against the May 2026 design spec already on disk.

### Test coverage

CDS suite: **450 passing** (was 433, +17). C&C suite: **273 passing** (was 247, +26). **Zero regressions.**

Full diff: [v1.1.0...v1.2.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.1.0...v1.2.0)

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
