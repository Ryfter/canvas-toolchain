# Canvas Toolchain Installer

## What's new in v1.8.0

Completes the **AI-Friendly Rubric System**. The student-facing rewrite half shipped earlier as `draft_student_rubric` (turn a faculty rubric into plain-English, per-criterion guidance + worked examples + an LLM-paste `.md`). This release adds the missing half — getting the rubric **out of Canvas** in the first place — as a new Command & Control workflow tool.

### Canvas Rubric Sync (`review_canvas_rubric`)

- **Pull the rubric straight from Canvas.** Give it a course and an assignment: it reads the rubric attached to that assignment, and **falls back to a course-rubric pick-list** when the assignment has none attached. No more copy-pasting a rubric out of Canvas to get started.
- **See what changed since last time.** It diffs the freshly-pulled rubric against your last student-facing rewrite, so you know exactly which criteria moved before you regenerate anything — with no extra bookkeeping files.
- **Smart triage before you rewrite.** A single review pass returns a verdict — **acceptable / needs-update / needs-review** — with specific flagged criteria, and *proposes a revised faculty rubric for your approval* when one is warranted. The approved rubric then feeds the existing `draft_student_rubric` unchanged.
- **Read-only and safe.** The tool never writes to Canvas; you stay in control of every change (propose → you approve → commit).

Built as a coordinator workflow (not a new module), following the established Canvas-access and TDD patterns; hermetic tests with Canvas and the LLM injected. A second phase — auto-surfacing last term's student questions as an extra review signal — is designed and deferred pending a data check.

### Known advisory (accepted, tracked)

`npm audit` reports 2 **moderate** advisories via the transitive `js-yaml` pulled in by the unmaintained `gray-matter` front-matter parser. This path only ever parses your **own local course files** (never untrusted input), so real-world risk is negligible. The proper fix — replacing `gray-matter` — is tracked as [#103](https://github.com/Ryfter/canvas-toolchain/issues/103) and deferred from this release to avoid a risky last-minute breaking change.

### Quality

Subagent-driven TDD with per-task spec + code-quality review and a final holistic review (which caught and fixed a faculty-block truncation bug on bold grade anchors, an empty-criteria guard, a file-read race, and a malformed-id filter). Full Command & Control suite green; both installer targets build cleanly.

Full diff: [v1.7.0...v1.8.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.7.0...v1.8.0)

## What's new in v1.7.0

Two more capability **modules** land on the plug-in architecture, completing the term-management "module wave." Both follow the established `CanvasToolchainModule` contract, are enabled at config-time via `~/.command-and-control/modules.json` (no reinstall), and load fail-soft. Together with the existing Oral Assessment and Group Builder modules, they cover the full roster → groups → external-tool pipeline.

### Roster & Identity Manager module (`module-roster`)

- **`propose_roster` / `commit_roster` / `resolve_identity`** — turn a PeopleSoft export into a privacy-preserving course roster. The module matches PeopleSoft rows to live Canvas enrollments (by student number → email → login → name, in priority order), assigns each student a **lifetime pseudonym** persisted in a `0600` identity vault, normalizes majors via batched AI with an alias store, and emits a de-identified `canvas_id,pseudonym,major` roster CSV.
- **Privacy by construction.** The vault is the only place the `canvas_id ↔ student_number` bridge lives; the roster output never carries names or emails. `propose` is read-only and idempotent; `commit` is the single writer, with atomic writes and live-vault collision guards.
- **Resilient to thin tokens.** A teacher-scoped Canvas token often withholds `login_id`/`sis_user_id`; the matcher degrades gracefully and warns rather than failing.

### PeerAssessment.com Export module (`module-peerassessment`)

- **`build_peerassessment_import`** — turn a Canvas group set into the exact import CSV PeerAssessment.com expects (`Team,Login ID,Email,First Name,Last Name,Student ID #`). Canvas-first field sourcing, with the roster vault + PeopleSoft export filling the login/SIS columns Canvas withholds. A `dryRun` flag produces a full pre-upload validation report (incomplete students, ungrouped students, duplicate emails, multi-group students) without writing a file.
- **Import-only and FERPA-aware.** The module produces an upload file only — it never writes Canvas or the vault, and grade round-trip is an explicit non-goal. PII is used transiently at build time; the only at-rest artifact is the import CSV the instructor uploads to a BSU-contracted, FERPA-approved vendor. Output is RFC-4180 escaped with a CSV formula-injection guard.

### Dependency & supply-chain hygiene

- esbuild pinned via override to `^0.28.1` (clears Dependabot #23/#24); `action-gh-release` bumped to v3 for the Node 24 runtime; installer workflows moved to Go 1.25. `npm audit` reports **zero vulnerabilities**.

### Quality

Both modules built with subagent-driven TDD and adversarial whole-implementation review (which caught and fixed a CSV formula-injection gap and a multi-group false-duplicate bug before release). The monorepo test suite now stands at **~1,698 tests**, green, with the integration smoke test and both installer targets building cleanly.

Full diff: [v1.6.0...v1.7.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.6.0...v1.7.0)

## What's new in v1.6.0

Two new capability **modules** land on the plug-in architecture introduced in v1.5, plus a full user guide. Both modules follow the established `CanvasToolchainModule` contract, are enabled at config-time via `~/.command-and-control/modules.json` (no reinstall), and load fail-soft.

### Oral Assessment module (#75)

- **`design_oral_assessment`** — authoring-side design of oral / viva-style assessments. Give it either a finished brief or just a topic + learning goal, and it produces both a Canvas-ready CDS `oral-assessment` page **and** a faculty sidecar (rubric language, prompts, logistics). Carries the AI Assessment Scale callout like the rest of the assignment surface.
- **Capability, not a vendor.** The boundary is the *Oral Assessment capability*; concrete tools are providers behind an adapter. **Rhetorix Lab** ships as the recommended provider #1 (flagged in the discovery catalog), with an optional `oral_assessment_launch_domain` for linking. Rhetorix is already LTI-native in Canvas, so this module is authoring-side — no extra plumbing or credentials required.

### Group Creator / Maintainer module (#101)

- **`create_groups` / `record_groups` / `propose_major_buckets`** — build balanced student project teams from a Canvas roster with a privacy-preserving identity model: groups key on the opaque **Canvas user ID paired with a professor pseudonym** (e.g. `SU26-001`) — the tool never reads or emits student names or emails.
- **Six formation strategies** — random, alphabetical, performance (heterogeneous / homogeneous), accomplishment-weighted, and major-diversity — layered with cross-cutting constraints: a **soft no-repeat-pairing "maintainer"** (per-course pairing history) and group-size balancing, resolved by a seeded **score-and-optimize** engine.
- **Major-diversity** proposes archetype buckets (technical / quantitative / creative / business / other) for the professor to review and persist, rather than guessing silently.
- Outputs a CSV + markdown report with diagnostics, and can optionally push the result straight to a Canvas Group Set.

### Documentation

- **User Guide & tutorial** — a narrative "start here" guide with an end-to-end walkthrough plus a task-by-task command catalog (what each tool does, how it works, and why you'd reach for it) covering ~120 MCP tools.

### Quality

Both modules built with subagent-driven TDD and adversarial whole-implementation review. The monorepo test suite now stands at **~1,610 tests**, green, with the integration smoke test and both installer targets building cleanly.

Full diff: [v1.5.2...v1.6.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.5.2...v1.6.0)

## What's new in v1.5.2

The biggest release since the toolchain shipped — **230+ commits** since v1.2.0 completing the v1.x roadmap and laying the v2.0 platform foundations. This is the "build complete" milestone: the toolchain now does what it set out to do, end to end.

> v1.5.2 is the first-public-release polish pass over v1.5.1: MIT license included, production dependency audit now clean (the optional `transformers-js` embedding fallback is no longer installed by default — `setup_lecture_answers` explains how to add it), a general CI workflow enforcing the full TypeScript suite on every push/PR, and repo security hardening (secret scanning, push protection, Dependabot).

### Plug-in module architecture (the 2.0 foundation)

- **Modules + providers (#78)** — capabilities are now opt-in **modules**, enabled at config-time via `~/.command-and-control/modules.json` (no reinstall). A module is its own npm package exposing a `CanvasToolchainModule` contract; within it, concrete backends are **providers** behind an adapter. First module: **Lecture Video** (`module-video`) with Panopto as provider #1 — the boundary is the *Video capability*, not Panopto, so Teams/Zoom/Meet/YouTube become ~one-file additions. Panopto code was fully extracted out of the core packages; C&C loads modules fail-soft (a broken module is skipped, never crashes the host).
- **`set_module_enabled` / `list_modules` (#94)** — toggle modules post-install without hand-editing the manifest.

### Institutional intelligence

- **Post-install tool discovery (#76)** — `discover_tools` runs a best-effort Canvas scan (account → per-course → self-report, paginated), matches findings against a curated catalog + each module's `handles[]`, and suggests modules to enable. `save_institution_profile` persists an accretive master profile + per-class deltas.
- **Opt-in usage feedback (#77)** — `submit_usage_feedback` turns the institution profile into an **anonymized public GitHub issue** (default-deny privacy, mandatory review-before-send) so real-world tool usage can drive what gets built next.

### Interactive widgets + course publishing

- **Widget renderer (#88)** — `render_widget` / `publish_widget` turn an `InteractiveSpec` into a Canvas-embeddable artifact (6 widget types: card-flip, sortable ordering, drag-to-categorize, branching scenario, multi-step reveal, hotspot image), uploaded to Canvas Files and embedded via iframe.
- **Versioned course publish (V&R System)** — `preview_course_publish` → `publish_course` → `rollback_course_publish` with snapshot bundles, widget-content lifecycle tracking, and full rollback (including restoring prior widget content).

### Lecture answers bot (#61)

- A RAG bot over a course corpus (transcripts + CDS markdown + slide PDFs + FAQ) with **hybrid keyword + semantic retrieval** (FTS5 + sqlite-vec, RRF fusion), platform-agnostic transcript schema, and a setup-time embedding-provider fallback chain. Four tools: `setup_lecture_answers`, `index_course_for_answers`, `ask_course`, `reembed_course_index`.

### Pedagogical metadata

- **Content priority tiers (#66)** — LLM-assigned at-a-glance / working-detail / deep-support tiers with a "Quick Reference" TL;DR card on generated pages.
- **AI Assessment Scale (#92)** — Leon Furze's 5-level AIAS as first-class page metadata with an inline callout on assignment/rubric pages.
- **Course Learning Outcomes mapping (#91)** — per-page CLO tagging that renders a "Supports CLOs" line in the TL;DR card.
- **Rubric system (#67)** — student-facing rubric page type + AI-drafted student rewrites with markdown export for students to paste into an LLM.

### Local LLM, dashboard, and showcase

- **Ollama generation fallback (#89)** — run brainstorm / rubric / answers generation against a local Ollama model as a peer to Anthropic; `setup_ollama` + `set_active_llm_provider`.
- **Local course dashboard (#68)** — read-only "course health" view served locally (`open_dashboard` MCP tool + CLI), with a deterministic green/yellow/red classifier.
- **Canvas capability showcase (#65)** — a browsable catalog of supported Canvas design patterns with standalone HTML previews.

### Quality

Built throughout with subagent-driven TDD and adversarial whole-implementation review. The monorepo test suite stands at **~1,500 tests** across all packages, green, with the installer building cleanly for both targets.

Full diff: [v1.2.0...v1.5.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.2.0...v1.5.0)

## What's new in v1.2.0

Five features landed since v1.1.0, all in the refresh + content-creation surface of the toolchain.

### Refresh workflow improvements

- **Lossless `import_course` (#80)** — new `preserveOriginalHtml: true` mode lifts source HTML body verbatim from a Canvas Backup archive into the imported markdown, bypassing the structural extractor that was silently dropping ~90% of body content for any course whose HTML didn't follow CDS's expected `## Learning Objectives` / `## Activities` section layout. With the flag, ~100× more content survives the import. Default behavior (no flag) is unchanged.
- **Pre-existing whitespace-trim bug fixed in passing** — Canvas's `items.json` sometimes serializes page titles with trailing whitespace, which canvas-backup strips on disk; the exact-match lookup was silently returning empty bodies. Fix benefits extraction mode too.

### Course documentation as a first-class output

- **`snapshot_course` MCP tool (#81)** — writes (and on re-run, updates) a per-course markdown reference doc capturing live course identifiers, assignment groups, modules, and an append-only Update Log. Four auto-managed sections live inside `<!-- AUTO:start id="..." -->` markers; hand-edited prose between markers is preserved verbatim across re-runs. Missing sections (manually deleted) are appended on recovery. Pattern: snapshot the toolchain-observed state alongside the prof's hand-written reference content.

### Rubric system end-to-end

- **`rubric` page type (#67 Part A)** — new CDS page type for student-facing rubrics with three blocks per criterion (student-facing rewrite, worked example, faculty rubric language). `generate_course` produces a Canvas-safe HTML page AND emits a `.md` file alongside for students to download and paste into an LLM for personalized help. Render uses University brand tokens, callouts, and a collapsible `<details>` for the faculty rubric language.
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
  - Verified end-to-end against a real University sandbox course before this release.
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
