# Command & Control MCP — Claude Instructions

Read this before changing the coordinator or asking Claude to continue the cross-app workflow.

## What This Project Does

Command & Control is the single professor-facing MCP entrypoint for the Canvas course refresh toolchain.

```text
Canvas Backup archive
  -> Curriculum Intelligence analysis and planning
  -> Canvas Design Studio course folder
  -> Canvas-safe HTML
  -> optional Canvas publishing
```

The coordinator is not meant to replace the domain tools. Each app stays independently usable:

- `Canvas-Download` / `canvas-backup` owns downloading Canvas data and creating the local archive.
- `Curriculum-Intelligence` / `curriculum-intelligence-mcp` owns analysis, semester comparison, topic currency, and next-semester planning.
- `canvas-design-studio` / `canvas-design-mcp` owns Canvas-safe HTML generation, design review, and optional page publishing.
- `Command-and-Control-MCP` owns the one-entrypoint workflow, status reporting, and model-routing layer.

## Current Integration State

Implemented:

- Curriculum Intelligence is a real local npm dependency: `curriculum-intelligence-mcp`.
- Canvas Design Studio is a real local npm dependency: `canvas-design-mcp`.
- `import_course` and `generate_course` call real Design Studio functions.
- `download_canvas_archive` calls the Python Canvas Backup CLI through a bridge instead of pretending a downloader npm package exists.
- `npm run smoke:integration` verifies the cross-app contract with fixtures: archive analysis, Design Studio import, and HTML generation.
- Local registry foundation for installable templates, themes, prompts, and adapter configs lives in `src/registry/local_registry.ts`.
- `install_resource` installs registry resources from `file://`, `github://`, or `ryfter://` URLs through `src/registry/install_resource.ts`.
- `list_installed_resources` and `uninstall_resource` operate on the local registry index and support bundle cascade metadata.
- `search_registry` searches free GitHub `index.json` registries or the configured premium registry.
- `install_resources_from_lockfile` installs plain-text or JSON URL lockfiles with per-resource status reporting.
- Template resource validation lives in `src/resources/template.ts` with local runtime slot validation in `src/resources/slots.ts`.
- Theme resource validation lives in `src/resources/theme.ts` and enforces prompt-first image metadata.
- Prompt-set validation lives in `src/resources/prompt_set.ts` and enforces slot keys, prompt strings, placeholders, and output schemas.
- Bundle installation support is implemented in `src/registry/install_resource.ts` and records bundle includes for cascade uninstall.
- Brand adapter foundation lives in `src/brand/brand_adapter.ts`; `ManualAdapter` fills and validates professor-provided kits.
- `PomelliAdapter` is a no-API stub that logs the limitation and delegates to `ManualAdapter` by default.
- Layout adapter foundation lives in `src/layout/layout_adapter.ts`; `PasteAdapter` points direct calls to the `paste_layout` MCP workflow.
- `StitchAdapter` is a no-API stub that logs the limitation and delegates to `PasteAdapter`.
- `updateCourseMaterials()` now returns the shared comprehensive report shape from `@canvas-toolchain/shared-types`.
- `setup_ollama` MCP tool — atomic 0o600 write to `~/.command-and-control/ollama-config.json`. Discovery mode (no `model`) returns the recommended-models markdown; commit mode validates the model is pulled and writes the config.
- `set_active_llm_provider` MCP tool — atomic 0o600 write to `~/.command-and-control/llm-provider.json`. Switches generation between Anthropic and Ollama; refuses to set a provider whose config is absent.
- `@canvas-toolchain/shared-llm` gains `OllamaLlmClient`, `resolveLlmClient`, `LlmProviderError`, and `fetchRecommendedModels`. All three generation call sites (brainstorm, rubric, answers) route through the C&C `resolveActiveLlmClient` shim.
- `show_canvas_capabilities` MCP tool — returns the canvas-capabilities.yaml catalog as readable markdown, grouped into ✅ Currently Supported and 🛠 Aspirational sections. Optional `category` and `supportStatus` filters.
- `preview_canvas_pattern` MCP tool — renders a specific pattern to a standalone HTML preview at `~/.command-and-control/showcase-previews/<patternId>.html`. Returns an `openInstruction` like `Open file://… in your browser`.

Still pending:

- Course-wide publish as one reviewed transaction (GitHub issue #64).
- A single native installer (GitHub issue #63 — spec + 3 implementation plans drafted, see below).

Shipping in v0.9.1 (Plan 1 — `installer/docs/plans/2026-05-26-cc-credential-tools-and-update-nudge.md`):

- `setup_anthropic` MCP tool — atomic 0o600 write to `~/.command-and-control/anthropic-config.json`, validates against `api.anthropic.com/v1/messages`.
- `setup_canvas` MCP tool — same pattern, validates against `/api/v1/users/self`.
- Update-availability nudge — server checks GitHub Releases on startup (24h cache, 5s timeout) and appends a one-line "Update available" notice to every successful tool response when the bundled version is older than the latest release.

## Provider Switching Workflow

Generation-time LLM provider (brainstorm, rubric, answers bot) is selectable. Two providers supported in v1: Anthropic (cloud) and Ollama (local).

```text
Anthropic-only setup:
  setup_anthropic → set_active_llm_provider({ provider: 'anthropic' })

Ollama-only setup:
  setup_ollama (no model) → returns recommended-models.md verbatim
  setup_ollama({ model: '<chosen>' })  → validates + writes ollama-config.json
  set_active_llm_provider({ provider: 'ollama' })

Switching later (both configs present):
  set_active_llm_provider({ provider: 'anthropic' | 'ollama' })
```

Provider failures (Ollama down, Anthropic key revoked, etc.) surface as structured `{ error, message, fix }` results — no silent cross-provider fallback. See `packages/command-and-control/docs/superpowers/specs/2026-06-05-ollama-generation-fallback-design.md` for the full error code catalog.

## Canvas Capability Showcase

Two MCP tools surface the Canvas-safe design pattern catalog so professors can discover what's possible without reading the KB:

```text
Browse:  show_canvas_capabilities
Filter:  show_canvas_capabilities({ category: 'information' })
         show_canvas_capabilities({ supportStatus: 'aspirational' })
Render:  preview_canvas_pattern({ patternId: 'comparison-card' })
          → writes ~/.command-and-control/showcase-previews/<id>.html
          → return value includes an "Open file://…" instruction
```

The catalog lives at `packages/canvas-design-studio/data/canvas-capabilities.yaml`. Adding a new pattern is a content PR — no TypeScript change. Each pattern has a `supportStatus` of `supported`, `partial`, or `aspirational`; aspirational entries represent Canvas-safe possibilities CDS does not yet generate, and serve as a roadmap signal for future work.

See `packages/command-and-control/docs/superpowers/specs/2026-06-05-canvas-capability-showcase-design.md` for the full data model and tool contracts.

## Native Installer Design (spec written, plans drafted)

**Spec:** [`installer/docs/specs/2026-05-26-installer-design.md`](../../installer/docs/specs/2026-05-26-installer-design.md).
**Plans:** Plan 1 (C&C features above), Plan 2 (Go installer), Plan 3 (CI release workflow) — all under `installer/docs/plans/`.
**Implementation:** Hand Plan 2 + Plan 3 to Codex via `codex:codex-rescue` once Plan 1 is merged.

**TL;DR** — Go + Fyne native binary (.exe / .pkg). Self-contained: bundles canvas-toolchain source + Node 18 runtime. 5-screen wizard. Wires Claude Desktop + Claude Code. Auto-updater shortcut. All APIs optional with `setup_*` backfill. No code signing — release notes document the one-time SmartScreen/Gatekeeper bypass.

The spec at `installer/docs/specs/2026-05-26-installer-design.md` is the canonical reference for every detail (screens, paths, error handling, update flow, CI). Don't duplicate it here.

**Kevin's hard constraint that drove all of this:** "rational, intelligent people see (or hear) command line and just shut their brains down. It's easier to have a gui walkthrough for most people."

## Future Ideas (not yet specced)

### Canvas Capability Showcase + Template Creator

**Reasoning:** "I don't know what all is possible within the capacity of what Canvas gives us. So I need a way to show off features and capabilities and maybe even a way to help create pages."

Canvas's constraints (no JS, no `<style>`, inline CSS only) make "interactive" genuinely tricky — professors don't know what to ask for because they've never seen what's achievable. Two goals: (1) demonstrate the full design surface so professors know the option space, and (2) provide an assisted creation flow that generates valid Canvas HTML from structured choices.

### Information Hierarchy / Content Priority System

**Reasoning:** "Maybe create a ranking of sorts that helps identify what information on a page needs to be really easy to find — just a glance / get the gist — vs what is needed for a deeper look, all the deeper supporting docs."

A "ranking" layer for Canvas page content that classifies each element by how urgently a student needs it:
- **Tier 1 — At a glance:** The gist in 5 seconds (due date, deliverable, one-sentence context)
- **Tier 2 — Working detail:** What a student needs to actually complete the assignment
- **Tier 3 — Deep support:** Rubric breakdowns, examples, reference docs

This could drive visual design decisions (prominence, placement, callout styles) and feed into the template creator.

### AI-Friendly Rubric System

**Reasoning:** "I have a rubric from this past semester. In reading it, I knew what it meant, but in reading it and trying to explain it to a student, I realized it sucked. Like it was HORRIBLE. Right now it is not simple to get the rubric."

The core pain: Kevin could interpret the rubric as faculty but couldn't explain it to a student because the language wasn't written for students. Official Canvas rubrics are faculty-facing — dense, criterion-heavy, written to justify grades rather than guide work.

Ideas:
- Rewrite rubric criteria in student-facing language with per-criterion plain-English explainers
- "Rubric Help" component: a companion page or expandable section with worked examples per criterion
- Optional tie-in to course personas (explain the same criterion differently for different learning styles)
- **Markdown export** so students can paste the rubric directly into an LLM for help — "the ability to just download a markdown file for students to add to an LLM would be incredibly helpful"
- Sync mechanism with the official Canvas rubric so rewrites stay current when the professor edits it
- May be worthwhile as a standalone "Rubric Help" item separate from the assignment page

These three ideas are related — the rubric system could use the hierarchy framework, and both could appear in the showcase.

### Local C&C Dashboard (lowest priority — function and awesome first)

**Reasoning:** "I want it to function first, and be awesome, then we can move to something more."

A local web dashboard for managing the toolchain: semester stats, course health at a glance, pipeline run history, vocab/config management UI. Stats pulled from previous semesters. Not worth building until the core workflow is solid and the installer makes setup frictionless for professors. This is the last thing on the list.

## Reasoning Behind the Current Shape

Do not port the whole toolchain to Go yet. Go may be useful later for a single installer or for a future Canvas Backup rewrite, but the working product logic is already tested in TypeScript and Python. The lowest-risk path is to harden the TypeScript coordinator and reach Python through a small, explicit CLI bridge.

Do not make Canvas API publishing required. The no-token/manual HTML paste path remains a first-class professor workflow. Direct Canvas publishing is optional convenience.

Keep the local archive as the source of truth. Google Drive is only a mirror.

## Files to Read First

| Need | File |
| --- | --- |
| Cross-app contracts and verification | `docs/integration-contracts.md` |
| Accepted architecture review backlog | `docs/architecture-review-followups.md` |
| Agent handoff and repo layout | `AGENTS.md` |
| Tool registrations | `src/index.ts` |
| Design Studio bridge | `src/passthrough/design_tools.ts` |
| Canvas Backup bridge | `src/passthrough/downloader_tools.ts` |
| Workflow tools | `src/tools/workflows/` |
| Local registry foundation | `src/registry/local_registry.ts` |
| Registry implementation plan | `docs/superpowers/plans/2026-05-21-local-registry.md` |
| Install resource resolver/tool | `src/registry/install_resource.ts`, `docs/superpowers/plans/2026-05-21-install-resource.md` |
| List/uninstall registry tools | `src/registry/local_registry.ts`, `docs/superpowers/plans/2026-05-21-list-uninstall-resources.md` |
| Search registry tool | `src/registry/search_registry.ts`, `docs/superpowers/plans/2026-05-21-search-registry.md` |
| Lockfile install tool | `src/registry/lockfile_install.ts`, `docs/superpowers/plans/2026-05-21-lockfile-install.md` |
| Template validator | `src/resources/template.ts`, `docs/superpowers/plans/2026-05-21-template-validator.md` |
| Theme validator | `src/resources/theme.ts`, `docs/superpowers/plans/2026-05-21-theme-validator.md` |
| Prompt-set validator | `src/resources/prompt_set.ts`, `docs/superpowers/plans/2026-05-21-prompt-set-validator.md` |
| Bundle install | `src/registry/install_resource.ts`, `docs/superpowers/plans/2026-05-21-bundle-install.md` |
| Brand adapters | `src/brand/`, `docs/superpowers/plans/2026-05-21-brand-adapter.md` |
| Pomelli stub | `src/brand/pomelli_adapter.ts`, `docs/superpowers/plans/2026-05-21-pomelli-adapter-stub.md` |
| Layout adapters | `src/layout/`, `docs/superpowers/plans/2026-05-21-layout-adapter.md` |
| Stitch stub | `src/layout/stitch_adapter.ts`, `docs/superpowers/plans/2026-05-21-stitch-adapter-stub.md` |
| Update course materials report | `packages/shared-types/src/index.ts`, `docs/superpowers/plans/2026-05-21-update-course-materials-result.md` |

## Verification

Run these before claiming the coordinator is healthy:

```powershell
npm test
npm run build
npm run smoke:integration
```

When changing file contracts between apps, also run:

```powershell
cd D:\Dev\Curriculum-Intelligence; npm test; npm run build
cd D:\Dev\canvas-design-studio; npm test; npm run build
cd D:\Dev\Canvas-Download; .\.venv\Scripts\python.exe -m pytest
```

## Downloader Bridge

`download_canvas_archive` discovers Canvas Backup in this order:

1. `CANVAS_BACKUP_COMMAND`
2. `CANVAS_BACKUP_REPO` plus its `.venv`
3. sibling checkout `../Canvas-Download` plus its `.venv`
4. `canvas-backup` on `PATH`

The bridge returns stdout/stderr plus the parsed archive path when Canvas Backup prints it.

Architecture review follow-ups for this bridge are tracked in `docs/architecture-review-followups.md`. The highest-priority items are a self-contained `canvas-backup.exe`, a persisted downloader executable path in `setup_cc`, and JSON-lines progress forwarded through MCP progress notifications.

## Design Studio Bridge

Use these C&C pass-throughs for the current integrated workflow:

- `import_course`: Canvas Backup archive -> Canvas Design Studio `course/` folder
- `generate_course`: Canvas Design Studio `course/` folder -> Canvas-safe HTML output

`publish_course` is intentionally still a placeholder. Course-wide publish needs a safer reviewed transaction model, because page publishing can touch live student-facing Canvas content.
