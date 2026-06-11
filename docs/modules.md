# Canvas Toolchain — Module View

A capability-by-capability breakdown of the toolchain. Each **module** below is a self-contained functional area: what it is, **why it was created** (the problem it solves), what it does, and the commands (MCP tools) that belong to it.

> Two senses of "module" live here:
> - **Plug-in modules** — true opt-in units enabled at config time via `~/.command-and-control/modules.json` (today: Lecture Video). These follow the `CanvasToolchainModule` contract.
> - **Functional modules** — the natural capability groupings inside the core packages (analysis, design, publishing, …). They aren't separately installable, but they're how the toolchain decomposes.
>
> For exact parameters of any command, see [`commands-and-credentials.md`](commands-and-credentials.md) §2. For the visual map, see [`visual-guide/`](visual-guide/README.md).

---

## Module index

| # | Module | Kind | One-line purpose |
| --- | --- | --- | --- |
| 0 | [Command & Control coordinator](#0-command--control--the-coordinator) | Core | The single entrypoint that orchestrates everything |
| 1 | [Plug-in module system](#1-plug-in-module-system) | Core | Ship capabilities as opt-in modules without a new installer |
| 2 | [Lecture Video](#2-lecture-video-plug-in-module) | Plug-in | Embed lecture video + pull transcripts (Panopto first) |
| 3 | [Curriculum Intelligence](#3-curriculum-intelligence) | Core | Find what's stale, plan next semester |
| 4 | [Canvas Design Studio](#4-canvas-design-studio) | Core | Generate Canvas-safe HTML |
| 5 | [Transcript pipeline](#5-transcript-pipeline) | Functional | Fetch, enrich, and verify lecture transcripts |
| 6 | [Lecture Answers (course Q&A)](#6-lecture-answers--course-qa) | Functional | "Did I cover this?" over your own course |
| 7 | [Publishing + snapshots/rollback](#7-publishing--snapshotsrollback) | Functional | Safe, reversible publishing to Canvas |
| 8 | [Resource Registry](#8-resource-registry) | Functional | Install templates/themes/prompts (free + premium) |
| 9 | [Institution discovery + usage feedback](#9-institution-discovery--usage-feedback) | Functional | Detect your tools; tell the author what to build |
| 10 | [Shared LLM + model routing](#10-shared-llm--model-routing) | Core lib | Anthropic or local Ollama, your choice |
| 11 | [Layout adapter](#11-layout-adapter) | Functional | Turn pasted/Figma HTML into Canvas-safe templates |
| 12 | [Course health dashboard](#12-course-health-dashboard) | Functional | One glance: how are my courses doing? |
| 13 | [AI Assessment Scale (AIAS)](#13-ai-assessment-scale-aias) | Functional | Label assignments with an AI-use policy |
| 14 | [Native installer](#14-native-installer) | Tooling | One double-click setup instead of eight commands |

---

## 0. Command & Control — the coordinator

**What it is.** The single professor-facing MCP server. You talk to it; it runs everything else. It re-exports the tools of Curriculum Intelligence, Canvas Design Studio, and the Canvas Backup downloader so you never juggle three servers.

**Why it was created.** The toolchain is three independent apps (Canvas Backup, CI, CDS) plus a Python sidecar. Asking a professor to wire up and drive all of them is a non-starter. C&C presents one surface and stitches them together **by data contract, not code dependency** — each app stays independently usable and testable, while the coordinator owns the cross-cutting concerns (model routing, credentials, module registry, workflow status).

**What it does.** Orchestrates the high-level workflows (`analyze → plan → update → publish`), routes LLM calls to the active provider, manages credentials and modules, and reports health. It is deliberately thin: domain logic lives in the worker apps.

**Commands.** `setup_cc`, `get_cc_status`, `set_active_llm_provider`, `show_canvas_capabilities`, `preview_canvas_pattern`, and the workflow umbrellas `analyze_course`, `plan_next_semester`, `update_course_materials`, `full_pipeline`. (Plus everything re-exported from the other modules.)

---

## 1. Plug-in module system

**What it is.** The `CanvasToolchainModule` contract (`packages/module-contract`), a manifest loader, and a registry in C&C (`src/modules/`) that read `~/.command-and-control/modules.json` at startup to decide which capabilities to expose.

**Why it was created.** Every new integration (video platform, lab tool, …) used to mean editing core packages and shipping a new installer. The goal of #78 (module-architecture spec, 2026-06-07) was to *"make tool support truly pluggable — the base install edits Canvas pages (core); every other capability becomes an opt-in module that can be enabled without shipping a new installer release."* Enablement is decoupled from installation: all modules ship in the bundle, the manifest just gates them.

**What it does.** Loads enabled modules, exposes their tools, and lets you flip modules on/off post-install (takes effect on the next client reconnect). Each module is its own npm workspace package, so the contract is ready for true drop-in distribution later — only the *source* of a module changes, not the contract.

**Commands.** `list_modules`, `set_module_enabled`.

---

## 2. Lecture Video (plug-in module)

**What it is.** The first real plug-in module (`packages/module-video`). A `VideoProvider` adapter layer with **Panopto** as provider #1 (Zoom/Teams/Meet/YouTube/TechSmith are future providers).

**Why it was created.** Panopto code used to be smeared across Canvas Design Studio and C&C — hard to maintain, impossible to disable. Extracting it into a module *"proves the contract on one real extraction so converting the rest later is mechanical"* (#78). The cross-package import was deleted; token handling is now internal to the module. It also models the adapter pattern so a second video provider is a one-file addition.

**What it does.** Authenticates to the video platform (OAuth2 for Panopto), downloads transcripts, and produces embeds. It writes VTT + `_sessions.json` to the known transcript location so Curriculum Intelligence ingests it **unchanged** — decoupled by data contract.

**Commands.** `setup_panopto`, plus the transcript tools it owns (see Module 5). Enable it with `set_module_enabled` (module: video).

---

## 3. Curriculum Intelligence

**What it is.** The analysis-and-planning brain (`packages/curriculum-intelligence`). Reads past Canvas archives and lecture transcripts, scores topic currency, diffs semesters, and plans the next term.

**Why it was created.** Professors in fast-moving fields face one recurring problem: *what I taught last semester is already outdated.* CI exists to answer "how stale is my course, and what should next semester look like?" — ingesting the past, scoring what aged out (evergreen vs. current vs. dated), and emitting KEEP/UPDATE/DROP/ADD verdicts plus a recommended outline.

**What it does.** Ingests archives → builds a topic map → diffs against prior semesters → scores currency (optionally with live news signals) → drafts updated briefs and an outline → tracks a long-run trajectory (churn rate, unstable topics, true evergreens). Output feeds Canvas Design Studio.

**Commands.** `setup_course`, `get_course_state`, `ingest_canvas_archive`, `list_assignments`, `list_pages`, `list_modules`, `list_resources`, `diff_semesters`, `fetch_news_feed`, `scan_recent_developments`, `suggest_topics`, `score_topic_currency`, `recommend_for_topic`, `import_previous_shell`, `fetch_academic_calendar`, `shift_dates`, `generate_recommended_outline`, `draft_assignment_brief`, `update_examples`, `export_course_folder`, `analyze_course`, `get_course_trajectory`, `generate_ideas_file`.

---

## 4. Canvas Design Studio

**What it is.** The presentation layer (`packages/canvas-design-studio`). A KB-backed generator of **Canvas-safe HTML**, plus design critique/redesign and interactive widgets.

**Why it was created.** Canvas's RCE sanitizer silently strips `<script>`, `<style>` blocks, custom fonts, transforms, filters, `box-shadow`, and more — so naïve HTML breaks. CDS encapsulates that hard-won expertise into a generator that enforces the rules (inline CSS only, start at H2, use Canvas's built-in grid classes) and ships reusable components, so professors get polished pages that actually render.

**What it does.** Generates pages/weeks/whole courses from briefs or markdown, validates against Canvas RCE + WCAG 2.1 AA, critiques and redesigns existing HTML, manages a teaching-philosophy KB and student personas, and renders embeddable widgets.

**Commands.** `get_started`, `get_setup_worksheet`, `setup_institution`, `validate_canvas_html`, `validate_worksheet`, `update_canvas_kb`, `generate_canvas_page`, `ingest_assignment_folder`, `critique_canvas_page`, `redesign_canvas_page`, `load_canvas_page`, `save_canvas_page`, `get_philosophy_kb`, `update_philosophy_kb`, `get_student_personas`, `generate_student_personas`, `setup_course`, `generate_page`, `generate_week`, `generate_course`, `import_course`, `list_canvas_courses`, `publish_to_canvas`, `fetch_brand_colors`, `render_widget`, `publish_widget`.

---

## 5. Transcript pipeline

**What it is.** The fetch-enrich-verify path for lecture transcripts. Lives inside the Lecture Video module; CI consumes its output.

**Why it was created.** Transcripts are the raw material for everything downstream — detecting off-syllabus topics, building quote banks, and feeding the answers bot. Raw VTT is noisy and platform-locked, so the pipeline enriches it into a platform-agnostic, citable format and lets professors validate captions against a local Whisper run.

**What it does.** Bulk-downloads Panopto transcripts as VTT, enriches them into `.enriched.md` (week/date headers, `[HH:MM:SS]` deep links every few minutes, filler stripped, vocab corrected, key statements highlighted), and can transcribe audio locally with Whisper to diff against the platform captions.

**Commands.** `bulk_fetch_panopto_transcripts`, `enrich_panopto_transcripts`, `setup_transcript_source`, `compare_transcripts`. (CI side: `ingest_transcripts`, `map_transcripts_to_weeks`, `extract_lecture_topics`, `find_off_syllabus_topics`, `build_quote_bank`.)

---

## 6. Lecture Answers — course Q&A

**What it is.** A per-course question-answering bot over your own materials. Hybrid keyword (SQLite FTS5) + semantic (sqlite-vec) retrieval with Reciprocal Rank Fusion.

**Why it was created.** Faculty reach for NotebookLM to answer "did I cover this in lecture?" — but that means leaving the toolchain and re-uploading content. This module builds a local index from enriched transcripts, CDS markdown, slide PDFs, and a curated FAQ. Hybrid retrieval is deliberate: **pure vector RAG misses exact named-entity matches** (course codes, function names) that professors actually search for, so keyword + semantic are fused.

**What it does.** Indexes a course (auto-incremental by file mtime), answers questions with citations that deep-link back to the source minute, and lets you swap embedding providers (local Ollama / transformers.js / cloud Voyage) and rebuild.

**Commands.** `setup_lecture_answers`, `index_course_for_answers`, `ask_course`, `reembed_course_index`.

---

## 7. Publishing + snapshots/rollback

**What it is.** A versioned, approval-gated publish system for pushing pages to Canvas — with full history and reversibility.

**Why it was created.** One-shot "publish then regret" is dangerous on live, student-facing Canvas pages. #64 replaced it with a *persistent versioned publish history* so faculty can roll back any publish to any prior snapshot, roll forward to a later one (even a previously-rolled-back one), browse history, and get backup recommendations before publishing.

**What it does.** Builds a preview (per-page diffs + manifest) without writing, publishes only entries you explicitly approve (stops on first failure), keeps local snapshots (prior/new/diff per entry + a live pointer), and can roll back or prune by retention policy (default: keep 3 most recent / ≤30 days).

**Commands.** `preview_course_publish`, `publish_course`, `rollback_course_publish`, `list_publish_snapshots`, `prune_publish_snapshots`. (Single-page path: CDS `publish_to_canvas`.)

---

## 8. Resource Registry

**What it is.** A unified install/discovery mechanism for templates, themes, prompt-sets, and adapter configs.

**Why it was created.** These resource types needed one install path that works today (GitHub-hosted, free) and scales to a paid tier later (authenticated premium registry) — without a different mechanism per type. #8 set the goal: one install mechanism for any resource kind, free GitHub by default, premium when credentials are configured, with a local offline cache.

**What it does.** Installs resources from `github://`, `ryfter://` (premium), or `file://`; validates each against its kind's schema; resolves dependencies; supports lockfiles; and searches across free/premium tiers.

**Commands.** `install_resource`, `list_installed_resources`, `uninstall_resource`, `search_registry`, `install_resources_from_lockfile`.

---

## 9. Institution discovery + usage feedback

**What it is.** A post-install scan that learns which tools your institution/course actually uses, and an opt-in channel to relay that (anonymized) to the author.

**Why it was created.** After install, the toolchain has no idea what tools a professor uses, so it can't suggest the right modules — and the author can't prioritize what to build next. #76 added active discovery (scan Canvas + self-report, match against module `handles[]`, offer to enable matches). #77 added an opt-in feedback path so real usage drives the roadmap, with strict anonymization (never tokens or student data).

**What it does.** Scans the Canvas instance (account → per-course → self-report) to detect external tools, matches them to modules and offers to enable them, merges findings into an accretive `institution-profile.md` (+ per-class deltas), and can submit an anonymized GitHub issue behind a two-call confirm gate and a default-deny identifier allowlist.

**Commands.** `discover_tools`, `save_institution_profile`, `submit_usage_feedback`.

---

## 10. Shared LLM + model routing

**What it is.** The shared LLM client (`@canvas-toolchain/shared-llm`) with Anthropic (cloud) and Ollama (local) providers, behind a `resolveLlmClient` resolver.

**Why it was created.** Generation should be the professor's choice: Anthropic is always available but costs tokens; Ollama is free per query but needs local setup. A shared layer centralizes provider selection and makes failures explicit instead of silently degrading — every call site (brainstorm, rubric, answers) routes through one shim.

**What it does.** Reads the active provider from config and routes calls; surfaces provider failures as structured `{ error, message, fix }` results with **no silent cross-provider fallback**; supports task-aware routing (fast vs. judgment) configured in C&C.

**Commands.** `setup_anthropic`, `setup_ollama`, `set_active_llm_provider`. (Routing knobs live in `setup_cc`.)

---

## 11. Layout adapter

**What it is.** A bridge that turns externally-designed HTML (Stitch, Figma, hand-pasted) into Canvas-safe, slot-structured templates.

**Why it was created.** The template library covers known page shapes, but custom designs left two bad options: slow hand-authoring or risky LLM HTML that breaks Canvas. The adapter (#14) takes a polished layout, pipes it through Canvas-safe transformation (strip JS/external fonts/complex selectors), extracts structural slots, and optionally saves it as a reusable template.

**What it does.** Accepts raw HTML/CSS, adapts it into a Canvas-safe slot layout, audits accessibility, and can persist the result as a versioned template in the local registry.

**Commands.** `paste_layout`, `save_layout_as_template`.

---

## 12. Course health dashboard

**What it is.** A local, read-only web view of all your courses' health (plain Node HTTP, no JS, localhost-only).

**Why it was created.** Professors running the toolchain across several courses had no single "how are my courses doing?" view — they navigated file trees and counted transcripts by hand. #68 shipped a function-first dashboard (everything fancier deferred).

**What it does.** Walks the configured `coursesRoot`, discovers courses by `course-config.md`, and shows name, semester, page count, last-publish time, transcript coverage, and a green/yellow/red health light (green = published ≤30 days AND ≥80% coverage; yellow = ≤90 days OR ≥50%; red otherwise).

**Commands.** `set_courses_root`, `open_dashboard`.

---

## 13. AI Assessment Scale (AIAS)

**What it is.** Course- and page-level labeling of AI-use policy on assignments, based on Leon Furze's AI Assessment Scale (CC BY-NC-SA 4.0).

**Why it was created.** Students need clear, consistent guidance on whether/how AI is permitted per assignment. #92 lets a professor set a course-wide default and override per page, so the policy surfaces on student-facing pages without clutter.

**What it does.** Stores a course default (level 1–5) in `course-config.md`; page front matter can override. When `generate_page` renders an assignment/rubric and an effective level resolves, a single inline policy callout is prepended above the TL;DR card, with attribution.

**Commands.** `set_course_aias_default`.

---

## 14. Native installer

**What it is.** A self-contained Go + Fyne desktop installer and auto-updater (Windows x64 / macOS arm64).

**Why it was created.** The blunt rationale from the design notes: *"rational, intelligent people see (or hear) command line and just shut their brains down — it's easier to have a GUI walkthrough for most people."* The installer was the v1.0 gating item: reduce setup from eight terminal commands to one double-click.

**What it does.** Bundles the built monorepo + a pinned Node runtime, runs a five-screen wizard, optionally collects API credentials (Anthropic/Canvas/Panopto, masked + validated live, non-blocking), wires the MCP server into Claude Desktop and Claude Code, handles optional Python for Canvas Backup, and ships an updater stub that checks GitHub Releases on demand. The MCP server also appends an update-available nudge to tool responses.

**Commands.** None (it's a native app, not MCP tools). Its credential screens write the same `~/.command-and-control/*.json` configs that the `setup_*` tools do.

---

## How the modules connect

```text
                       ┌─────────────────────────────────────────────┐
                       │       Command & Control (Module 0)          │
                       │   routing · registry · module loader (1)    │
                       └───────────────┬─────────────────────────────┘
        Lecture Video (2) ─ transcripts (5) ─┐
                                              ▼
   Canvas Backup ──► Curriculum Intelligence (3) ──► Canvas Design Studio (4) ──► Publishing (7)
                                              │                  ▲                        │
                          Lecture Answers (6) ┘        Layout adapter (11)        snapshots/rollback
                                                       Resource Registry (8)
   cross-cutting: Shared LLM (10) · Discovery+Feedback (9) · Dashboard (12) · AIAS (13) · Installer (14)
```

See the rendered architecture diagram at [`visual-guide/images/03-architecture.png`](visual-guide/images/03-architecture.png).
</content>
