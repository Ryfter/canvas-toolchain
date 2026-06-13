# Canvas Toolchain — AI Agent Handoff Guide

This guide is the entry point for any AI tool working on this monorepo. It maps the available CLIs and skills, explains which tool to reach for, and points to per-package handoff docs.

If you are a human reading this: skim "Quick orientation" and "What lives where," then read the per-package `CLAUDE.md` or `AGENTS.md` for the area you are touching.

---

## Quick orientation

**What this is.** A four-package TypeScript monorepo plus a Python sidecar that, together, refresh a Canvas LMS course every semester. The flow is:

```text
Canvas Backup archive
  -> Curriculum Intelligence analysis and planning
  -> Canvas Design Studio course folder
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

**Single professor-facing entrypoint:** the Command & Control MCP server. Professors talk to it from any MCP-capable AI client (Claude Desktop, ChatGPT, Gemini). Each underlying app stays independently usable.

**Status:** v0.9 core workflow, v1.0 native installer, v1.1 and v1.2 features are all shipped. The v1.x enhancement backlog is now empty. Active direction is the v2.0 milestone. **The plug-in module architecture (#78) has shipped its first cut (2026-06-08):** capabilities are now opt-in *modules* enabled via `~/.command-and-control/modules.json` (config-time, no reinstall), with the first module — **Lecture Video** (`packages/module-video`, Panopto behind a `VideoProvider` adapter) — extracted out of canvas-design-studio and command-and-control. Institutional tool-discovery (#76) and usage feedback (#77) have **shipped**; the only open v2.0 item is Rhetorix integration (#75, externally blocked on the Rhetorix author). **The repo went public on 2026-06-10** (identity-scrubbed, MIT-licensed, gated CI) with v1.5.1 as the first public release — the tag → CI → published-installers path has now been exercised end-to-end for real.

**Latest Codex health check:** see [`docs/repo-health-check-2026-06-07.md`](docs/repo-health-check-2026-06-07.md). Automated TypeScript, Go, and C&C smoke checks passed on 2026-06-07, and its open items were subsequently fixed; the release path itself was proven by the v1.5.1 publish on 2026-06-10. The one remaining verified-by-reasoning item is running the installed updater on real hardware (especially the macOS `.pkg`).

---

## What lives where

| Package | What it owns | Read first |
| --- | --- | --- |
| `packages/command-and-control/` | Single MCP entrypoint, workflow orchestration, registry, brand/layout adapters, **module registry/manifest loader** (`src/modules/`) | `CLAUDE.md`, `AGENTS.md` |
| `packages/canvas-design-studio/` | Canvas-safe HTML generation, design review (Panopto extracted to `module-video`) | `CLAUDE.md`, `AGENTS.md` |
| `packages/curriculum-intelligence/` | Course analysis, semester comparison, topic currency, planning | `CLAUDE.md`, `AGENTS.md` |
| `packages/module-contract/` | Plug-in module interfaces (`CanvasToolchainModule`, `ModuleTool`, `ModuleManifest`) shared by C&C + module packages | `src/index.ts` |
| `packages/module-video/` | **First plug-in module:** Lecture Video — embed + transcripts. `VideoProvider` adapter layer; `PanoptoProvider` is provider #1 (Zoom/Teams/Meet/YouTube are future providers) | `src/index.ts`, `src/provider.ts` |
| `packages/shared-types/` | TypeScript contracts shared across packages | `src/index.ts` |
| [`canvas-backup`](https://github.com/Ryfter/canvas-backup) (separate repo) | Python Canvas backup downloader; reached via CLI bridge | repo README |

---

## Working with AI agents

This repo is routinely worked on with AI coding agents (Claude Code, and others). The
project conventions that matter are in this file and the per-package `CLAUDE.md` /
`AGENTS.md` handoffs. Pick whatever agent/tooling you prefer — nothing here depends on a
specific vendor.

GitHub issues carry an optional `agent:*` label recording a *suggested* model tier for the
task; treat it as advisory. When you finish work, note in the commit/PR which tool actually
did it.

> Operator note: a private, machine-specific multi-agent playbook lives in the gitignored
> `AGENTS.local.md` (not part of the public repo).

---

## Status labels and tracking

Every issue carries a status:

- `status:backlog` — known work, not yet started
- `status:ready` — ready to pick up
- `status:in-progress` — actively being worked on
- `status:in-review` — implementation complete, awaiting review
- `status:done` — merged and shipped

Milestones group work into releases:

- `v0.9 — Core Workflow` — **closed.** Feature-complete coordinator (all workflow tools).
- `v1.0 — Native Installer` — **closed.** Go+Fyne installer shipped 2026-05-26.
- `v1.x — Enhancements` — **closed.** All named v1.x issues shipped or migrated. Last ship: #91 CLO mapping on 2026-06-07.
- `v2.0 — Platform direction` — **active.** Plug-in architecture (#78, shipped) + its post-install toggle `set_module_enabled`/`list_modules` (#94, shipped); institutional tool-discovery (#76, shipped — `discover_tools`/`save_institution_profile`, `data/known-tools.yaml` catalog, accretive `institution-profile.md`); usage feedback via GitHub (#77, **shipped** — `submit_usage_feedback`, opt-in anonymized GitHub issue, two-call confirm gate, default-deny `SAFE_IDENTIFIER_KEYS`/`SAFE_TOOL_KEYS`); Rhetorix integration (#75, **shipped 2026-06-12** as the **Oral Assessment module** — see below).

**Oral Assessment module (#75, shipped 2026-06-12).** New `packages/module-oral-assessment` — a generic "oral/video assessment" capability with **Rhetorix Lab as the recommended provider #1** (research finding: Rhetorix is already LTI-native with Canvas grade passback, so the module is authoring-side, not plumbing). One MCP tool `design_oral_assessment` (brief **or** topic+goal input) writes a CDS `oral-assessment` page-type `.md` (rendered by `generate_course`) plus a paste-ready `<name>.rhetorix.md` faculty sidecar, and returns a "why Rhetorix" rationale. No credentials (optional `oral_assessment_launch_domain` in `course-config.md`). Rhetorix tagged `recommended` in `data/known-tools.yaml`. Spec/plan: `packages/command-and-control/docs/superpowers/{specs,plans}/2026-06-12-oral-assessment-module*.md`. Deferred (YAGNI): results/grade ingestion (LTI handles it), 2nd provider, Canvas LTI auto-placement. The Rhetorix-author conversation is now **optional**, not a blocker.

**Group Creator/Maintainer module (#101, shipped 2026-06-13).** New `packages/module-group-builder` — forms student teams from Canvas data + a thin roster file. **PII-free:** Canvas user ID is the join key, paired with the professor's pseudonym; the tool never reads/emits name/email. Hybrid data (roster membership + overall grade + assignment-completion from Canvas by id; pseudonym/major/metrics from a `canvas_id,pseudonym,major` CSV). **Six strategies:** random, alphabetical, weighted-by-accomplishment (balance/cluster), heterogeneous, homogeneous, major-diversity (proposes a major→bucket map for review; persisted per course). **Soft no-repeat-pairing** via a per-course pairing-history store (the "maintainer"). **Seeded score-and-optimize** engine. Tools: `create_groups` (preview, never mutates history), `record_groups` (commit), `propose_major_buckets` (propose/persist). Output: CSV + markdown always; optional Canvas Group Set push. Opt-in module, no provider seam, hermetic tests (Canvas injected). Spec/plan: `…/superpowers/{specs,plans}/2026-06-12-group-creator-module*.md`. Deferred: Canvas-column attendance; deterministic strategies don't rotate (random/major-diversity do).

**Next module wave (separate, independent, not yet built):** (1) **Roster/Identity Manager** — PeopleSoft→pseudonym→de-id pipeline + Google Forms joins + cross-semester tracking; produces the roster file the Group Builder consumes. (2) **PeerAssessment.com round-trip** — Canvas groups → PeerAssessment import; exported score CSV → Canvas gradebook (PeerAssessment is export/spreadsheet-based, NO LTI — opposite of Rhetorix). Each gets its own brainstorm→spec→plan.
- `Future / Backlog` — catchall for anything not yet milestoned.

The GitHub Project "Canvas Toolchain Roadmap" pulls all of this together with board and roadmap views.

---

## Workflow for a new task

1. **Find or create the issue.** Status `status:backlog` → `status:ready` when picked up.
2. **Brainstorm if needed.** Use `superpowers:brainstorming` to produce a spec in `packages/<pkg>/docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
3. **Plan.** Use `superpowers:writing-plans` to produce a step-by-step plan in `packages/<pkg>/docs/superpowers/plans/YYYY-MM-DD-<topic>.md`.
4. **Move to `status:in-progress`** and execute. For non-trivial work, use `superpowers:subagent-driven-development`.
5. **Move to `status:in-review`** when implementation is done and tests pass. Open a PR.
6. **Move to `status:done`** when merged. Note the agent that did the work.

---

## Verification before claiming done

For any cross-package contract change, run:

```powershell
# From the monorepo root — covers every TypeScript package:
npm test
npm run build
npm run smoke:integration --workspace=packages/command-and-control

# Canvas Backup (separate Python repo), from its own checkout:
python -m pytest
```

For changes inside a single package, the package-local `npm test` + `npm run build` is enough, plus C&C's `npm run smoke:integration` if you changed a contract C&C calls.

---

## Hard rules

- **Do not port the whole toolchain to Go.** Go is for the installer and possibly a future Canvas Backup rewrite. The working product logic stays in TypeScript and Python.
- **Direct Canvas API publishing stays optional.** The no-token manual generate-and-paste path is first-class forever.
- **Local archive is the source of truth.** Google Drive is only a mirror.
- **No `--no-verify` on commits**, no skipping hooks, no force-push to main.
- **One issue, one PR, one merge.** Update the status label as you go.

---

## Active specs and plans

The v1.x enhancement backlog is closed. Today's outstanding work falls into two buckets:

**Installer release-readiness** — resolved. The items from [`docs/repo-health-check-2026-06-07.md`](docs/repo-health-check-2026-06-07.md) were fixed, and the v1.5.1 release (2026-06-10) exercised the tag → CI → published-installers path end-to-end. Remaining caveat: the macOS `.pkg` has not yet been run on physical Apple hardware (verified-by-reasoning only).

**v2.0 platform direction:**

- **#78** plug-in module architecture — **SHIPPED first cut 2026-06-08.** Spec: [`packages/command-and-control/docs/superpowers/specs/2026-06-07-module-architecture-design.md`](packages/command-and-control/docs/superpowers/specs/2026-06-07-module-architecture-design.md); plan: [`.../plans/2026-06-07-module-architecture.md`](packages/command-and-control/docs/superpowers/plans/2026-06-07-module-architecture.md). Modules are config-time-enabled via `~/.command-and-control/modules.json`; module registry lives in C&C `src/modules/`; first module is `packages/module-video`. **Known follow-up:** no in-product `enable_module` tool yet — a user who disables Video must hand-edit `modules.json` (advanced-adopter-acceptable; tracked as a fast-follow). When a 2nd video provider lands, wire handlers through `module-video/src/resolve.ts` and drop the `*_panopto_*` aliases.
- **#76** post-install institutional tool-discovery (Canvas LTI scan) — reads each module's `handles[]` to suggest modules to enable.
- **#77** usage feedback via GitHub — **SHIPPED.** `submit_usage_feedback` MCP tool: opt-in, turns the institution profile into an anonymized `usage-feedback` GitHub issue on `Ryfter/canvas-toolchain`. Two-call confirm gate (preview then `confirm:true`); default-deny identifier allowlist (`SAFE_IDENTIFIER_KEYS`: `lms`, `institutionType`, `sizeBucket`, `region`); tools field-guarded to `SAFE_TOOL_KEYS`; `named:true` opts into full identifiers; no browser fallback — missing/unauthed `gh` → `GH_UNAVAILABLE`. Never transmits tokens or student data.
- **#75** Rhetorix Lab integration — the **next module**, drops into the proven `CanvasToolchainModule` contract.

**Historical v1.0 installer plans** (for context — these all shipped 2026-05-26 / 2026-05-30):

- [`installer/docs/specs/2026-05-26-installer-design.md`](installer/docs/specs/2026-05-26-installer-design.md) — installer design spec.
- [`installer/docs/plans/2026-05-26-cc-credential-tools-and-update-nudge.md`](installer/docs/plans/2026-05-26-cc-credential-tools-and-update-nudge.md) — Plan 1 (C&C credential tools + update nudge), shipped as v0.9.1.
- [`installer/docs/plans/2026-05-26-installer-go-fyne.md`](installer/docs/plans/2026-05-26-installer-go-fyne.md) — Plan 2 (Go + Fyne installer), shipped as v1.0.
- [`installer/docs/plans/2026-05-26-installer-ci-release-workflow.md`](installer/docs/plans/2026-05-26-installer-ci-release-workflow.md) — Plan 3 (release workflow), shipped alongside v1.0.

GitHub Project view: [Canvas Toolchain Roadmap](https://github.com/users/Ryfter/projects/4).

---

## Per-package handoffs

- [`packages/command-and-control/CLAUDE.md`](packages/command-and-control/CLAUDE.md) — coordinator, registry, adapters
- [`packages/command-and-control/AGENTS.md`](packages/command-and-control/AGENTS.md) — repo layout, tool list, Panopto pipeline
- [`packages/canvas-design-studio/CLAUDE.md`](packages/canvas-design-studio/CLAUDE.md) — Canvas HTML rules, KB, design tokens
- [`packages/canvas-design-studio/AGENTS.md`](packages/canvas-design-studio/AGENTS.md) — transcript enrichment internals
- [`packages/curriculum-intelligence/AGENTS.md`](packages/curriculum-intelligence/AGENTS.md) — analysis engine internals

<!-- grimdex:start -->
# Grimdex — coding knowledge base (read first)

PROGRAMMING DECISIONS, rules, and lessons → record them in **Grimdex** at
`D:\Dev\Grimdex` (this project's tier: `projects/canvas-toolchain/`).

- Read `D:\Dev\Grimdex\GRIMDEX.md` FIRST — layout and contribution rules.
- When you make or revise a coding rule, decision, or lesson, write it there.
- Reference decision records by id (e.g. `d012`); do not duplicate them in app repos.
- Grimdex engine is open source: <https://github.com/Ryfter/Grimdex>.
<!-- grimdex:end -->
