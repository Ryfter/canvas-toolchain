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

**Status:** v0.9 core workflow through the v1.8.x releases are all shipped; the v1.x enhancement backlog is empty. **The plug-in module architecture (#78) shipped its first cut on 2026-06-08** — capabilities are opt-in *modules* enabled via `~/.command-and-control/modules.json` (config-time, no reinstall) — and the **module wave is now complete: five modules ship** — `module-video` (Lecture Video, Panopto behind a `VideoProvider` adapter), `module-oral-assessment` (Rhetorix, #75), `module-group-builder` (#101), `module-roster` (Roster & Identity Manager), and `module-peerassessment` (PeerAssessment.com export). Institutional tool-discovery (#76), usage feedback (#77), and **Canvas Rubric Sync** (`review_canvas_rubric`, a C&C workflow tool, #102) have all shipped. **#78 CLOSED — the v2.0 plug-in module *channel* SHIPPED as v2.0.0 on 2026-07-11** (PR #120 squash `09c63c1`; see the "v2.0 plug-in module channel" section below). The Announcements Auditor 1.0.0 is live in the catalog. **The v2.0.1 hardening pass then closed out a post-ship security review of the channel (PR #130, closed #121–#129; on `main`, unreleased):** catalog `artifactUrl` is pinned to this repo's GitHub Releases with an allowlisted redirect chain, `sizeBytes` has a hard ceiling, installed-ledger `id`/`version` are re-validated as safe path segments before load/prune/uninstall, the catalog cache is `0o600`, the Announcements Auditor validates ids and dates before any Canvas call, the CallTool glue is unit-testable (`dispatchCallTool`), and the installer moved to Fyne 2.6.3 with `fyne.Do`. Its headline fix is repo-wide: **all seven Canvas clients now refuse off-origin `Link: rel="next"` pagination** so a hostile pagination URL can never receive the professor's Canvas token. **#131 CLOSED — `module-announcements` 1.1.0 is published** (catalog commit `586c9c3`; sha256 verified four ways, including against the actual published asset bytes). Channel artifacts are hash-pinned single-file bundles, so a fix on `main` does **not** reach installed modules until a new module version ships and the catalog is bumped — always treat "fixed on main" and "fixed for professors" as different states. **Open issues (verified 2026-08-13): #150** (`npx canvas-toolchain` 404s — blocked on the npm org + `NPM_TOKEN`) **and #151** (setup/readiness engine umbrella). #147/#148/#149 are closed. **This paragraph will go stale — treat `gh issue list --state open` as the source of truth**, not a count written here. One near-miss worth knowing: #121's redirect allowlist originally pinned `objects.githubusercontent.com`, but GitHub serves release downloads from `release-assets.githubusercontent.com` — the merged code refused every install, and the unit test missed it because its fake redirect used the assumed host. The allowlist is now the `githubusercontent.com` domain (`isAllowedRedirectHost`, `e3a1967`), and release paths must be exercised against production, not mocks. **The repo went public on 2026-06-10** (identity-scrubbed, MIT-licensed, gated CI) with v1.5.1 as the first public release; the tag → CI → published-installers path has been exercised repeatedly, most recently **v1.8.2** (2026-06-19, a dependency-security release — gray-matter/js-yaml removed, undici patched). **v2.2.0 unification (merged to `main` as `e2e1b74` / #140; still unreleased — no `v2.2.0` tag):** `npx canvas-toolchain` entrypoint + root `prepare` auto-build; packages renamed into `@canvas-toolchain/*` (directories unchanged); npm publish on tag (needs npm org + `NPM_TOKEN`, see [`docs/npm-publishing.md`](docs/npm-publishing.md)); model-agnostic shipped copy; institution scrub restored + CI guard; realpath-based is-main guards on CDS/CI/C&C; runtime assets copied into `dist`; all versions locked to 2.2.0 with release version-lockstep guard.

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

## Tool overview maintenance

When adding, removing, or substantially changing a professor-facing capability, update
[`docs/tool-overview.md`](docs/tool-overview.md) alongside the detailed command/module docs.

Keep `docs/tool-overview.md` concise and outcome-oriented. It should explain what the
toolchain helps instructors accomplish, especially:

- instructor-led course refresh workflows
- expert-in-the-loop AI quality gates
- accessibility and Canvas-safe validation
- Canvas shell speed and quality improvements
- Canvas management, preview, publishing, rollback, and manual-paste paths
- student-facing quality and clarity

Do not turn the overview into a command catalog. Command names and parameters belong in
[`docs/commands-and-credentials.md`](docs/commands-and-credentials.md); implementation and
module details belong in [`docs/architecture-modules.md`](docs/architecture-modules.md). For the
list of installable modules and companion programs, see [`docs/modules.md`](docs/modules.md).

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

**Roster & Identity Manager module (shipped 2026-06-14; not filed as a GitHub issue).** New `packages/module-roster` (module id `roster`) — the **producer** for the Group Builder's roster file. Automates the manual PeopleSoft→pseudonym→de-identify pipeline. **Identity model:** a minimal SIS-anchored **vault** at `~/.command-and-control/roster-vault/vault.json` (`0600`, atomic tmp+rename) holding ONLY `{student_number, canvas_id, pseudonym, first_seen_term}` — no names/emails at rest. **One lifetime pseudonym per student**, prefix = term first seen (`SU26-014`); returning students (SIS match) reuse it + are flagged. **Join:** `canvas_id` is discovered by matching PeopleSoft→Canvas in priority `student_number → email → userId → name(fuzzy+confirm)`. **Three tools, propose→commit:** `propose_roster` (read-only, idempotent; match + pseudonym + batched AI major-normalization with no-LLM passthrough → review report; **writes nothing**), `commit_roster` (the ONLY writer — `canvas_id,pseudonym,major` CSV + vault insert of new students; collision guard re-validated against the live vault), `resolve_identity` (pseudonym→vault→live Canvas name; nothing cached). Canvas creds required; Anthropic optional (major-normalization degrades gracefully). Surfaces a warning when no Canvas user carries sis_user_id/login_id (matching silently downgraded). Opt-in module, registered in C&C `KNOWN_MODULES`, hermetic tests (Canvas + LLM injected), 43 tests. Spec/plan: `…/superpowers/{specs,plans}/2026-06-13-roster-identity-manager*.md`. **Deferred (v1):** no metric-gathering (Group Builder's job), no Google Forms, no cross-term pairing analytics (vault enables it later), native `.xlsx` ingest (CSV-only — export Excel→CSV).

**PeerAssessment.com Export module (shipped 2026-06-14; not filed as a GitHub issue).** New `packages/module-peerassessment` (module id `peerassessment`) — turns a Canvas group set into the PeerAssessment.com student/group **import CSV** so the professor stops hand-building it. **Scope: IMPORT-ONLY** (per Kevin — "more concerned with adding students; grades are easy spreadsheet work"); the inbound grade half (PeerAssessment's exported grade sheet → Canvas gradebook) is an explicit **non-goal**, which also keeps the toolchain free of any Canvas grade-WRITE capability. **FERPA:** PeerAssessment is email-based, so real PII leaves the system on upload, but **the institution holds a contract** with the vendor (school-official exception); PII is transient at build time and **never written to the vault** (no new PII at rest). **Exact header (vendor-confirmed):** `Team,Login ID,Email,First Name,Last Name,Student ID #`. **Field sourcing — Canvas-first with fallback:** Team = Canvas group name; Email/First/Last from Canvas; **Login ID = Canvas `login_id` else PeopleSoft `userId`**, **Student ID# = Canvas `sis_user_id` else roster-vault `student_number`** (the fallback exists because a teacher token often withholds login/SIS ids — it **reuses module-roster's vault + PeopleSoft parser** via a canvas_id↔student_number bridge). **One MCP tool `build_peerassessment_import`** (`courseId` + `groupSetName` required; optional `peopleSoftFile`/`outputDir`/`dryRun`) — **no propose→commit** because the only artifact is a local CSV the professor uploads (never writes Canvas or the vault); `dryRun` returns the report with no file. **Pre-upload report:** incomplete rows, ungrouped students, duplicate emails, multi-grouped students, + FERPA note. Output guards against CSV formula injection (`= + - @` leading cells). Opt-in module, registered in C&C `KNOWN_MODULES`, hermetic tests (Canvas injected), 42 tests. Spec/plan: `…/superpowers/{specs,plans}/2026-06-14-peerassessment-export*.md`. **Deferred (non-goals):** grade/score import, LTI, native `.xlsx`.

**Module wave COMPLETE — all 4 items shipped** (oral-assessment, group-builder, roster, peerassessment). No module backlog remains; further modules would each need a fresh brainstorm→spec→plan.

**Canvas Rubric Sync (shipped 2026-06-15; a C&C workflow tool, NOT a module).** Completes the "AI-Friendly Rubric System" idea. The student-facing rewrite half already existed (`draft_student_rubric`, #67); this adds the missing Canvas-sync half as **`review_canvas_rubric`** in C&C (`src/tools/rubric/` + `src/tools/workflows/review_canvas_rubric.ts`). It pulls the rubric from Canvas — assignment's attached rubric first, **course-rubric-list fallback** when none is attached — `detectRubricChange`s it against the `**Faculty rubric language:**` blocks in the last rendered rubric `.md` (no new state store), and runs an LLM **triage** returning a verdict (**acceptable / needs-update / needs-review**) with flagged criteria, proposing a revised faculty rubric on needs-update. Read-only (writes nothing to Canvas); the **unchanged** `draft_student_rubric` is the commit step. Built in C&C (not a module) because the drafter + Canvas/CI reuse already live there; follows C&C's raw-`fetch` + `loadInstitutionConfig()` idiom, hermetic tests (Canvas + LLM injected). Spec/plan: `…/superpowers/{specs,plans}/2026-06-14-rubric-canvas-sync*.md`; decision `d004`. **Deferred:** per-persona criterion explanations; Phase 2 prior-semester student-question mining (gated on a Canvas-Backup data spike).
- `Future / Backlog` — catchall for anything not yet milestoned.

**v1.8.1 (shipped 2026-06-19; installer Canvas-host UX fix + CI security bump; PR #104, squash `a5f749e`).** A user entered the Canvas host as a bare `exampleucanvas` (misreading the helper text's `.instructure.com` as a prefix) and validation failed with `no such host`. Fix: new `installer/tasks/canvashost.go` → **`NormalizeCanvasHost(raw)`**, an idempotent normalizer (lowercase/trim, strip scheme + path/query + trailing dot, and append `.instructure.com` only when the result has no dot — bare label). Applied at both consumption points so the validated host matches the persisted one: `ValidateCanvas` (validate.go) and `WriteCanvasConfig` (configs.go); vanity domains like `canvas.exampleu.edu` pass through untouched. The credentials screen helper text was reworded to present the suffix as an example, not a prefix. Tests in `canvashost_test.go` (12 cases + idempotence). Same PR cleared a newly-disclosed HIGH undici advisory (GHSA-vmh5-mc38-953g, via cheerio) by bumping **undici 7.27.2→7.28.0** to satisfy the production audit gate — did NOT touch the deferred gray-matter/js-yaml swap (#103). Released via tag `v1.8.1` → `release-installer.yml` run `27819312358` (green, all 4 assets).

**Host config fan-out (shipped 2026-06-29; PR #106, squash `ffd11b3`).** Installer now fans out the MCP config to all detected hosts (Claude Desktop/Code, Codex, Gemini CLI, Cursor, VS Code, Kiro, Antigravity) via a host adapter table in `installer/tasks/mcphost.go` (`SupportedHosts()` + format dispatcher). Sub-project A of the model-agnostic effort; see `installer/docs/specs/2026-06-27-host-config-fanout-design.md`. **Shipped in v1.9.0** (release-installer run `28410424122`, all 4 assets). Sub-projects B (LLM backend agnosticism) and C (guidance/skills portability) remain unstarted.

**WCAG 2.2 Phase 1 — thorough checking (merged to main 2026-07-01 via PR #109; UNRELEASED — release held until Phase 2 ships; decision d006).** Replaces the 6-heuristic advisory audit with a canonical WCAG 2.2 conformance system, **still fully advisory** (the publish gate is Phase 2). Canonical `AccessibilityFinding`/`ConformanceReport` model + 55-criteria WCAG 2.2 A/AA catalog + exact borderline math (measured ≥ 85% of required) in `@canvas-toolchain/shared-types` (`src/accessibility.ts`); engines behind one adapter interface (`packages/canvas-design-studio/src/tools/a11y/`): the 6 Canvas-aware in-house checks (contrast now carries a measured margin) + **axe-core in jsdom** (`color-contrast`/`target-size` disabled — no layout in jsdom; never-throws guarantee). Runner (`conformance.ts`: `runConformanceCheck`/`formatConformanceReport`) merges, dedupes (highest severity; tie → in-house first), computes verdict vs `DEFAULT_REQUIRED_LEVEL` (WCAG 2.1 AA), and reports honest per-criterion statuses (pass/fail/needs-human-review/not-applicable). Wired into generate/validate/redesign/publish/render (async ripple: CDS `ingest.ts`, C&C `page-renderer.ts`/`update_course_materials.ts`); `auditAccessibility`/`accessibilityWarnings` kept deprecated for C&C until Phase 2. Spec (8 sections incl. two-tier acknowledge-to-launch gate, WAVE triage — the WAVE **API is public-URL-only and cannot auth into Canvas**, so free WAVE extension/Accessibility Insights are the gated-page deep-check route — borderline review queue, institutional policy anchor [default 2.1 AA, 4-week recheck], WCAG 3 opt-in advisory toggle, professor-is-final-arbiter): `packages/command-and-control/docs/superpowers/specs/2026-07-01-wcag22-conformance-gate-design.md`; Phase 1 plan alongside in `plans/`. **Phase 2 (gate + named-SC acknowledgments + review queue) SHIPPED to main 2026-07-03 via PR #110 (squash `2bfd2ff`):** `packages/command-and-control/docs/superpowers/plans/2026-07-02-wcag22-phase2-gate-and-queue.md` executed task-by-task; two-tier `ACCESSIBILITY_ACK_REQUIRED` gate on `publish_to_canvas` + `publish_course`, `.a11y/` acknowledgment audit trail + review queue, new tools `accessibility_review_queue` + `audit_course_accessibility`. **Shipped as v1.10.0 (released 2026-07-04**, after #111 — canonical output-relative review-queue keys + marginRatio through `Warning` — was fixed pre-tag via PR #114 so no on-disk `.a11y/` ever mixes keys). **Fast-follows #112 + #113 fixed 2026-07-09** (PRs #115/#116, TDD, awaiting merge): #112 = `publish_course` now emits course-path `a11yAcknowledgments` fix guidance when the CDS re-gate blocks after the pre-gate passed; #113 = CDS `PublishToCanvasInput.a11yPageKey` so page-branch acknowledgment records key by relPath like the assignment branch (standalone tool still defaults to `pageTitle`). **Phase 3 SHIPPED as v1.11.0 (2026-07-10; PR #117 squash `0af74b0`, closed #108):** policy anchor + `review_accessibility_policy`, WCAG 3 advisory toggle (never gates), WAVE adapter + `wave_deep_check` (two-call spend gate, auth-gate refusal), canonical relPath keying for approvals/acknowledgments maps with structurally fail-closed filename aliasing. Full sequencing + immediate next steps: `docs/roadmap.md`. No institution-specific data in the repo — policy URLs/levels are per-professor local config.

**Security: gray-matter removed (#103 closed + Dependabot #25 fixed; 2026-06-19; PR #105, squash `0c375a9`; decision d005).** `gray-matter@4.0.3` was the only source of `js-yaml@3.14.2` (the js-yaml advisories' root); gray-matter 4.x calls js-yaml-3-only `safeLoad`/`safeDump`, so js-yaml couldn't be bumped in place. Replaced with a tiny internal front-matter parser on the maintained `yaml` package (which both consumers already depend on): **C&C `src/lib/front_matter.ts`** (`parseFrontMatter`, parse-only — used by the answers-bot `transcript.ts` + `markdown.ts` chunkers) and **CI `src/parsers/front_matter.ts`** (`parseBriefFile`/`serializeBriefFile`, reimplemented on `yaml`). gray-matter + js-yaml are now gone from the tree. Helper follows CDS's `FM_PATTERN`+`parseYaml` idiom; preserves unknown keys, CRLF-safe, degrades to `{}` on empty/malformed blocks. Same change cleared a separate undici HIGH (`juice@11 → cheerio@1.0.0 → undici@6.26.0`) via a version-selector override `"undici@<=6.26.0": "^6.27.0"` in root `package.json` (in-major for cheerio@1.0.0; chosen over bumping juice→12 which needs Node ≥22.12.0, above the repo's ≥20 baseline). The top-level `cheerio@1.2.0` keeps `undici@7.28.0`. `npm audit` → 0 vulnerabilities. **Shipped in v1.8.2** (release-installer run `27850060377`, all 4 assets).

**v2.0 plug-in module channel (#78) — SHIPPED as v2.0.0 (2026-07-11; PR #120 squash `09c63c1`; Announcements Auditor 1.0.0 published to the catalog, commit `a3bf86d`).** The 1.x plug-in system (contract, workspace packages, `modules.json`, fail-soft loader) is unchanged; v2.0 adds *distribution* — a module ships as a single-file, hash-pinned `.mjs` artifact, cataloged in `module-catalog.json` on `main`. Key paths: `packages/command-and-control/src/tools/module_channel_tools.ts` (the three new tools — `browse_module_catalog`, `install_module`, `uninstall_module`); `packages/command-and-control/src/channel/` (install engine `install.ts`, catalog fetch/validation `catalog.ts`, hash `hash.ts`, pending-request file `pending.ts`, installed-modules record `installed.ts`, chat notices `notices.ts`); `packages/command-and-control/src/modules/registry.ts` (loader phase 2 — installed-artifact re-hash-then-import, semver bundled-vs-installed precedence, retired-version pruning); `packages/module-announcements/` (the channel-only proof module — in the source tree, deliberately absent from `KNOWN_MODULES`); `installer/screens/workflows.go` + `installer/tasks/` (the GUI "Additional modules" picker — request-only, no install logic in Go); `module-catalog.json` (repo root — carries the Announcements Auditor 1.0.0 entry; the catalog commit history is the publish audit log). Full design: `docs/superpowers/specs/2026-07-11-plugin-module-channel-design.md`. Publish/install runbook: `docs/module-channel.md`.

**v2.1.0 — one release surface, repo-hosted module artifacts (shipped 2026-07-14 as tag `v2.1.0`; catalog cutover completed the same day).** v2.0.0's design put each module version on its own tagged GitHub Release, which took the "Latest" badge away from actual toolchain releases and silently killed the update check for every professor on an older version — the v2.0.1 hardening pass papered over the symptom, v2.1.0 fixed the cause. What changed: **`.github/workflows/release-module.yml` is deleted** — it no longer exists, so do not point anyone at it or at a `module-<id>-v<version>` tag as a publish step. Module artifacts are now **files committed to this repo** at `modules/<id>/<version>/<id>-<version>.mjs`, fetched at install time over `raw.githubusercontent.com` (`ALLOWED_ARTIFACT_URL_PREFIX` in `src/channel/catalog.ts`); publishing a version is a **pull request**, gated by `npm run verify:modules` (CI's `module-artifacts` job rebuilds each module from source and fails unless the committed bytes equal both a fresh build and the catalog's sha256) and a `docs/modules.md` drift check (`npm run docs:modules` regenerates it from `module-catalog.json` — never hand-edit it). **The committed `module-catalog.json` is `catalogVersion: 2`**, carrying `modules[]` (installable, hash-pinned, unchanged shape) and a `companions[]` array for separate programs like Canvas Backup (`id`/`name`/`summary`/`whyYouWantIt`/`url`/`worksWithoutToolchain` only — validation is default-deny, so a companion entry can never carry anything runnable). **The only release tags that exist are `vX.Y.Z`**; the update check (`parseToolchainTag` in `src/update/check.ts`) accepts only a strict match and ignores everything else, closing the class of bug that started this. `.gitattributes` pins `modules/**/*.mjs -text` so a Windows checkout never rewrites LF→CRLF and silently breaks every hash. A canonical-URL check (`isCanonicalUrl`/`isAllowedArtifactUrl`/`isAllowedCompanionUrl`) replaces the old dot-segment blocklist for both `artifactUrl` and companion `url`: a URL is refused unless parsing and re-serializing it via `new URL(url).href` changes nothing at all.

**v2.2.0 — Canvas Toolchain unification (merged to `main` as `e2e1b74` / #140; still unreleased — no `v2.2.0` tag).** One product name, any model, `npx` everywhere. Key surface: **`npx canvas-toolchain`** (root `prepare` auto-build + `packages/canvas-toolchain` launcher; in-repo smoke green at `canvas-toolchain@2.2.0`). Unscoped packages renamed into **`@canvas-toolchain/*`** (directories unchanged — installer wiring untouched); C&C registers as `canvas-toolchain`; all workspace versions locked to **2.2.0** with a release version-lockstep guard covering every workspace and intra-workspace dep pins. **npm publish on tag** (`.github/workflows/release-npm.yml`, provenance) needs the `canvas-toolchain` npm org + `NPM_TOKEN` secret before tagging — see [`docs/npm-publishing.md`](docs/npm-publishing.md). Model-agnostic copy in shipped strings and installer screens; launch button host-driven. Institution scrub restored + CI guard (`scripts/check-institution-scrub.mjs`). Realpath-based **is-main guards** on CDS/CI/C&C so package imports never double-boot MCP on shared stdio. Runtime assets survive pack: CDS templates and C&C `recommended-models.fallback.md` are copied into `dist` at build. README: npx / installer / from-source quickstarts + per-client MCP wiring.

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

## The module catalog is a cross-language contract (PR #152)

`module-catalog.json` at the repo root is read by **two independent implementations**: the
TypeScript module channel and the Go installer's picker (`installer/tasks/modulecatalog.go`).
Bumping `catalogVersion` without teaching the Go side breaks the installer for every user.

That is exactly what happened. The catalog went to v2 in the v2.1.0 cutover; the installer still
pinned `supportedCatalogVersion = 1`, so every professor reaching the Workflows screen saw
*"Module catalog unavailable."* Two things let it ship, and both are now closed:

- `installer-ci.yml` triggered only on `paths: installer/**`, so editing the root catalog never
  ran the Go tests. **`module-catalog.json` is now in the path filter** — keep it there.
- The Go tests used inline fixtures only. **`modulecatalog_test.go` now parses the real
  repo-root `module-catalog.json`** and requires at least one installable module. That test is
  the guard; do not replace it with another fixture.

The version check is a bounded range (`1..supportedCatalogVersion`), not equality: older catalogs
stay readable, and a *newer* schema is still refused rather than silently mis-parsed into a picker
missing fields. When you raise the schema, raise the constant and extend the test — in the same PR.

**Generated docs:** `docs/modules.md` is generated by `scripts/generate-module-docs.mjs` from the
catalog. Edit the catalog, run the generator. Hand-editing the doc reintroduces drift — that is how
the dead `Ryfter/Canvas-Download` link (real repo: `Ryfter/canvas-backup`) survived. Note the
`../Canvas-Download` sibling-checkout fallback in `downloader_tools.ts` is a **local directory
name, not a URL** — leave it alone.

## Setup-status tools must read what setup tools write

`get_cc_status` reported `keyPresent` from `process.env.ANTHROPIC_API_KEY` while `setup_anthropic`
writes `~/.command-and-control/anthropic-config.json` — so the tool the user guide calls "your first
stop when something isn't working" told correctly-configured users they had no key. Any status or
readiness tool must check **every** surface a credential can arrive through (env var *and* config
file), or it becomes the misdiagnosis.

Status results report **presence only**. Never place a token, API key, or host value in a result —
it flows straight into LLM context. `get_cc_status.test.ts` asserts the Anthropic key, Canvas
token, Canvas host, and backup TOML contents are absent from the serialized output; keep that
assertion when extending the shape.

**Known architectural gap (issue #151, design pending):** nothing owns the promise "this professor
can now use Canvas Toolchain." The installer, the README, `get_cc_status`, and the tutorial each
define "installed" differently. Independent reviews converged on one readiness engine
(`readSetupState()` / `applySetup()` / `runDoctor()`) with the installer, npm path, and AI chat as
thin clients. **Do not implement this unasked** — it is Kevin's design call.

---

## Canvas host handling (PR #141)

`~/.command-and-control/canvas-config.json` has **two writers** — the Go installer and the
`setup_canvas` MCP tool — so the file format is a cross-language contract. Both must produce
the same thing. `normalizeCanvasHost` / `canvasBaseUrl` in `@canvas-toolchain/shared-types` are
the single TypeScript implementation and the behavioral twin of `installer/tasks/canvashost.go`;
`packages/shared-types/tests/canvas-host.test.ts` pins them against the Go table. **Never
re-implement host cleanup locally** — a bare subdomain (`schoolname`) must become
`schoolname.instructure.com`, or it resolves nowhere and fails much later as an opaque TLS error.
Normalization runs on **write and read** in both config surfaces (C&C `setup_canvas.ts`, CDS
`config.ts`), so configs already broken on disk heal without the professor re-running setup.
Design Studio stores the full origin (`canvasUrl`), C&C stores the bare host (`host`).

Canvas Backup keeps its **own** TOML config and requires `canvas.base_url`, `archive.root`,
`archive.year`, and `archive.semester` at load time — CLI overrides do not satisfy them, so a
missing key kills an archive in preflight. `setup_canvas_backup` generates that file at
`~/.command-and-control/canvas-backup.generated.toml`. The API token is **never** written into
it: the file sets `token_env = "CANVAS_TOKEN"` and `download_canvas_archive` injects the token
into the child environment at spawn, keeping the credential in exactly one place on disk.

**Sorting rule (three bugs of one class fixed in PR #141):** any comparator over a timestamp
needs an explicit tie-break, and any sort whose input order comes from `readdirSync` needs a
total order. Same-millisecond ties made `findMostRecentPrior` return the *oldest* semester and
let the filesystem choose which publish snapshot `computePruneList` **deleted**.

**Test isolation:** Design Studio's vitest config sandboxes `CANVAS_DESIGN_HOME` to a temp dir
for every test file (`packages/canvas-design-studio/tests/setup-sandbox-home.ts`). Keep it —
without it a test that forgets its own `beforeEach` overwrites the professor's real
`institution.json`, including their API token. That has happened twice.

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

- **#78** plug-in module architecture — **SHIPPED first cut 2026-06-08.** Spec: [`packages/command-and-control/docs/superpowers/specs/2026-06-07-module-architecture-design.md`](packages/command-and-control/docs/superpowers/specs/2026-06-07-module-architecture-design.md); plan: [`.../plans/2026-06-07-module-architecture.md`](packages/command-and-control/docs/superpowers/plans/2026-06-07-module-architecture.md). Modules are config-time-enabled via `~/.command-and-control/modules.json`; module registry lives in C&C `src/modules/`. The first module was `packages/module-video`; **five modules now ship** (video, oral-assessment, group-builder, roster, peerassessment) — the module wave is complete. The in-product enable/disable tools shipped as **#94** (`set_module_enabled` / `list_modules`), so no hand-editing of `modules.json` is required. #78 stays open as the umbrella/north-star: the formal plug-in *framework* (true drop-in distribution) is deferred until the shipped modules justify it. When a 2nd video provider lands, wire handlers through `module-video/src/resolve.ts` and drop the `*_panopto_*` aliases.
- **#76** post-install institutional tool-discovery (Canvas LTI scan) — reads each module's `handles[]` to suggest modules to enable.
- **#77** usage feedback via GitHub — **SHIPPED.** `submit_usage_feedback` MCP tool: opt-in, turns the institution profile into an anonymized `usage-feedback` GitHub issue on `Ryfter/canvas-toolchain`. Two-call confirm gate (preview then `confirm:true`); default-deny identifier allowlist (`SAFE_IDENTIFIER_KEYS`: `lms`, `institutionType`, `sizeBucket`, `region`); tools field-guarded to `SAFE_TOOL_KEYS`; `named:true` opts into full identifiers; no browser fallback — missing/unauthed `gh` → `GH_UNAVAILABLE`. Never transmits tokens or student data.
- **#75** Rhetorix Lab integration — **SHIPPED 2026-06-12** as `packages/module-oral-assessment` (generic oral/video assessment with Rhetorix as provider #1). Followed by `module-group-builder` (#101), `module-roster`, and `module-peerassessment` — the module wave is complete.

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
