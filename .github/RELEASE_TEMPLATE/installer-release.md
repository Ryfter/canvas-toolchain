# Canvas Toolchain Installer

## What's new in v1.11.1

A small hardening release — no new tools, no setup changes, nothing to migrate.

### Safer storage for your Canvas credentials

- **The institution config is now written atomically with owner-only permissions.** `~/.canvas-design-mcp/institution.json` holds your Canvas API token (and WAVE key, if you set one). It is now saved via a temp-file-plus-rename write with `0o600` permissions on Mac/Linux, so a crash mid-save can never leave a partial or world-readable config. Existing configs keep working unchanged. ([#119](https://github.com/Ryfter/canvas-toolchain/pull/119))
- **`CANVAS_DESIGN_HOME`** — the environment variable the coordinator server already honored for this directory now works everywhere, letting tests and multi-profile setups point the toolchain at an alternate home.

### Generic examples throughout

- Documentation, sample configs, and test fixtures now use neutral placeholders (`example.edu`-style hostnames and placeholder course IDs) instead of one university's real values. Purely cosmetic for users — nothing behavioral. ([#118](https://github.com/Ryfter/canvas-toolchain/pull/118))

Full diff: [v1.11.0...v1.11.1](https://github.com/Ryfter/canvas-toolchain/compare/v1.11.0...v1.11.1)

## What's new in v1.11.0

Accessibility Phase 3: your institution's policy becomes the anchor for every check, and two new tools join the kit — one to keep the policy current, one for optional deep checks via WAVE. Nothing changes until you opt in: with no policy configured, every check behaves exactly as it did in v1.10.x.

### Your institution's accessibility policy, on file

- **New tool `review_accessibility_policy`** — records your institution's accessibility policy links, the WCAG conformance level your courses must meet (default stays **WCAG 2.1 AA**, the ADA Title II baseline), and how often you want to be reminded to re-read the policy (default every 4 weeks). Call it with `confirm: true` after re-reading the policy and it stamps the date; when the reminder comes due, a gentle nudge appears at the end of accessibility reports — it never blocks anything.
- **The required level moves the gate line, not the checks.** Every page is still checked against the full WCAG 2.2 catalog; the policy level only decides which findings can hold a publish back. Set it to 2.2 AA when your institution adopts it and the gate follows — no other changes needed.

### A preview of WCAG 3 (optional, informational only)

- Turn on `wcag3Advisory` in the policy and accessibility reports gain a short section mapping your findings to the corresponding **WCAG 3 draft outcomes** — a low-effort way to watch where the standard is heading. It is clearly labeled as draft material and **can never block a publish**.

### Deep checks with WAVE (WebAIM)

- **New tool `wave_deep_check`** — runs a publicly visible page through the paid WAVE API for a second opinion beyond the built-in engines. Spending is always deliberate: the first call only previews the cost (~2 credits) and runs nothing; call again with `confirm: true` to spend. Login-gated Canvas pages are refused **before** any credits are spent — for those, the report points you at the free WAVE browser extension instead.

### Sturdier record-keeping at publish time

- The per-page `approvals` and `a11yAcknowledgments` maps in `publish_course` are now keyed by each page's output file path. A bare filename still works as a convenience — but only when it matches exactly one page, so an acknowledgment can never silently apply to a page you didn't review. ([#108](https://github.com/Ryfter/canvas-toolchain/issues/108))

Full diff: [v1.10.1...v1.11.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.10.1...v1.11.0)

## What's new in v1.10.1

A small polish release for the v1.10.0 accessibility publishing gate — clearer guidance when a publish is held back, and tidier record-keeping. No new tools, no setup changes.

### Clearer instructions when a course publish is held back

- **The block message now tells you exactly what to do.** During a whole-course publish, a page can pass the up-front accessibility check but still get held at the final step — the page's HTML is re-checked after widget links are swapped for their Canvas URLs, and that final version is what students actually get. Previously the hold message pointed at an option that `publish_course` doesn't accept. Now it spells out the exact `a11yAcknowledgments` entry to pass for that file — naming each failing criterion when the failures are clear-cut, or a simple `true` for near-misses — plus `resume:true` so the publish continues right where it stopped. ([#112](https://github.com/Ryfter/canvas-toolchain/issues/112))

### Consistent record-keeping in the acknowledgment trail

- **Every entry in `.a11y/acknowledgments.json` now identifies its page the same way** — by the page's output file path. Previously, acknowledgments recorded for pages used the Canvas page title while those for assignments used the file path, so one course's audit trail mixed two labeling styles. Existing entries stay exactly as they are and remain valid; nothing to migrate. ([#113](https://github.com/Ryfter/canvas-toolchain/issues/113))

Full diff: [v1.10.0...v1.10.1](https://github.com/Ryfter/canvas-toolchain/compare/v1.10.0...v1.10.1)

## What's new in v1.10.0

Accessibility moves from **advice** to a **gate** — with you as the final decision-maker. Since v1.9.0 the toolchain has run a full WCAG 2.2 conformance check on every page and reported the results. This release makes that check matter at publish time: it can now hold a page back until you've seen the problems and decided to proceed anyway.

### The two-tier publishing gate

When you publish to Canvas (`publish_to_canvas`, or a whole course with `publish_course`), each page's accessibility result decides what's required:

- **Clean page** — publishes exactly as before.
- **Near-miss (borderline)** — publishes once you acknowledge it, by passing `acknowledgeAccessibility: true`. A quick "yes, I've seen it."
- **Clear failure** — publishes once you acknowledge **each failing criterion by name** (e.g. `["1.4.3", "1.3.1"]`). If the block message lists three failures, your acknowledgment has to name all three — so you can't wave past problems you haven't actually looked at.

**You are always the final arbiter.** Nothing is ever permanently blocked: the gate exists to make sure a failure is a *decision*, not an accident. The blocked message spells out exactly what to acknowledge and how. The FERPA scan and the Canvas-HTML validation checks are unchanged and still absolute — those are not accessibility findings and cannot be acknowledged away. The manual generate-and-paste workflow is not gated at all.

### A record of what you approved, and a worklist of what to revisit

- **Acknowledgment trail.** Every acknowledgment is recorded in a per-course `.a11y/acknowledgments.json` — what page, which criteria, when, against which conformance level. An append-only log you can point to later.
- **Review queue.** Pages that were borderline (or that a course audit flagged) land on a `.a11y/review-queue.json` worklist, sorted worst-first so the closest calls are at the top. Two new tools work it:
  - **`accessibility_review_queue`** — list the pages that deserve a human look (with links to free checkers like the WAVE browser extension and Microsoft Accessibility Insights), and mark one reviewed when you've handled it.
  - **`audit_course_accessibility`** — re-scan every generated page of a course in one pass and refresh the worklist, so you can sweep a whole course before publishing.

No new credentials, no new setup — the gate and the queue are built into the publish tools you already use. The required conformance level is the ADA Title II baseline (WCAG 2.1 AA); making that configurable per institution is the next step (Phase 3).

Full diff: [v1.9.0...v1.10.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.9.0...v1.10.0)

## What's new in v1.9.0

The installer now connects Canvas Toolchain to **any** AI coding host you have — not just Claude.

### Model-agnostic: wire up every supported host automatically

- **One install, all your hosts.** The installer detects which AI coding apps are on your machine and connects the Canvas Toolchain MCP server to each one, in that host's own config format and location: **Claude Desktop**, **Claude Code**, **Codex CLI**, **Gemini CLI**, **Cursor**, **VS Code**, **Kiro**, and **Antigravity**. Previously it only wired Claude Desktop and Claude Code.
- **You stay in control.** The workflows screen shows a "Connect to these apps" checklist: detected hosts are pre-checked, undetected hosts are listed but unchecked, and you can override any of them before installing.
- **Safe and repeatable.** Each host's config is written in its native shape (JSON `mcpServers`, VS Code's `servers` with `type: stdio`, or Codex's TOML `[mcp_servers]`), existing entries are preserved, and re-running the installer never duplicates the entry.

Because the `command-and-control` server already speaks the cross-client MCP protocol, this was purely an installer-reach change — no server or tool changes. It's the first piece (sub-project A) of making the whole toolchain runnable from Codex, Gemini, and IDE hosts end to end.

### Documentation

- New [**Feature overview**](https://github.com/Ryfter/canvas-toolchain/blob/main/docs/tool-overview.md) and a full [**accessibility checks reference**](https://github.com/Ryfter/canvas-toolchain/blob/main/docs/accessibility.md), both linked from the README.

Full diff: [v1.8.2...v1.9.0](https://github.com/Ryfter/canvas-toolchain/compare/v1.8.2...v1.9.0)

## What's new in v1.8.2

A dependency-security release — no behavior changes, just a cleaner and safer dependency tree.

### Security: removed an unmaintained YAML parser

- **Replaced `gray-matter` with an in-house front-matter reader.** The `gray-matter` library was the only thing pulling in the old, unmaintained `js-yaml` v3, the source of two YAML advisories (including a quadratic-complexity denial-of-service, [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68)). It couldn't be patched in place, so it's gone — the toolchain now reads page/brief front matter with the maintained `yaml` package it already uses everywhere else. Both `gray-matter` **and** `js-yaml` are fully removed from the dependency tree. Closes [#103](https://github.com/Ryfter/canvas-toolchain/issues/103).
- **Patched a second high-severity `undici` advisory.** A separate copy of `undici` (`6.26.0`, reached through `juice` → `cheerio`) was bumped in-place to the patched `6.27.0`.

`npm audit` now reports **zero vulnerabilities**. Behavior is unchanged and verified — full build, ~1,700 tests, and the cross-app integration smoke all green; the front-matter swap was done test-first with characterization tests locking the existing parse/serialize behavior.

Full diff: [v1.8.1...v1.8.2](https://github.com/Ryfter/canvas-toolchain/compare/v1.8.1...v1.8.2)

## What's new in v1.8.1

A small installer fix for the **Canvas host** field on the credentials screen.

### Forgiving Canvas host entry

- **A bare school name now works.** Entering just `yourschool` is completed to `yourschool.instructure.com` automatically, instead of failing validation with `dial tcp: lookup yourschool: no such host`. The field also accepts a pasted full `https://…` URL (scheme and path are stripped) and tolerates trailing slashes, stray whitespace, and casing. Vanity Canvas domains that already contain a dot (e.g. `canvas.yourschool.edu`) pass through untouched.
- **Clearer field guidance.** The placeholder and hint now read as an example rather than a pre-filled prefix, and spell out that a bare name works and a full URL can be pasted — so nobody types only the first label expecting `.instructure.com` to be appended for them.

Normalization is applied to both credential validation and the written `canvas-config.json`, so the validated host always matches what's saved. Covered by unit tests (bare label, scheme/path strip, vanity domain, idempotence).

### Dependency hygiene

- Bumped the transitive `undici` (via `cheerio`) from 7.27.2 → 7.28.0 to clear a newly-disclosed **high**-severity advisory ([GHSA-vmh5-mc38-953g](https://github.com/advisories/GHSA-vmh5-mc38-953g)). Non-breaking; full suite green. The deferred `gray-matter`/`js-yaml` moderate advisory remains tracked as [#103](https://github.com/Ryfter/canvas-toolchain/issues/103).

Full diff: [v1.8.0...v1.8.1](https://github.com/Ryfter/canvas-toolchain/compare/v1.8.0...v1.8.1)

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

The installer drops the canvas-toolchain source onto your machine, installs npm dependencies using a bundled Node 24 runtime (no Node prereq required), wires the MCP server into Claude Desktop and Claude Code CLI, and creates a Desktop / Applications "Canvas Toolchain Updater" shortcut for one-click updates.

## What it does NOT install

- Anything outside the install directory you chose
- Anything in `~/.command-and-control/` is preserved across updates
- Telemetry, analytics, or remote calls beyond the optional update check against GitHub Releases

## Reporting issues

Use the [installer-bug issue template](https://github.com/Ryfter/canvas-toolchain/issues/new?template=installer-bug.md).

Include: your OS + version, the last 50 lines of the installer log (click "Show log" on the install screen), and what you were doing when it failed.
