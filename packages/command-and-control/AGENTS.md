# Command & Control MCP — Agent Handoff Guide

Read this before touching anything. Claude-focused guidance also lives in `CLAUDE.md`; keep the two files aligned when changing integration boundaries.

---

## What this project is

**Command & Control** (`@canvas-toolchain/command-and-control`) is an MCP server that acts as a unified entry point for the professor toolset. It imports Curriculum Intelligence and Canvas Design Studio as npm dependencies, reaches Canvas Backup through its Python CLI, re-exposes selected domain tools with task-category annotations, adds high-level workflow tools, and routes LLM calls to Anthropic or Ollama based on config.

**Stack:** Node.js 20+, TypeScript ESM (`"type": "module"`), `@modelcontextprotocol/sdk`, `@canvas-toolchain/curriculum-intelligence` (local file dep at `../Curriculum-Intelligence`), `@canvas-toolchain/canvas-design-studio` (local file dep at `../canvas-design-studio`).

**This is not a web app. There is no frontend, no database, no HTTP server.**

---

## Current state: v1.0.0 — COMPLETE

All tools implemented and tested.

**Run tests:** `npm test`
**Build:** `npm run build`
**Fixture integration smoke test:** `npm run smoke:integration`
**Live smoke test (requires real ITM 370 archives on disk):** `npx tsx scripts/smoke-cc.ts`

---

## Repository layout

```
src/
  index.ts                  ← MCP server entry; all tool registrations
  types.ts                  ← TaskCategory, CcConfig, Mode, ProviderName
  kb/
    config.ts               ← load/save ~/.command-and-control/config.json
  registry/
    local_registry.ts       ← local resource registry storage/index/manifest validation
    install_resource.ts     ← file/github/ryfter resolver and install_resource tool implementation
    search_registry.ts      ← free GitHub index search and premium registry search
    lockfile_install.ts     ← ordered lockfile install with per-resource reporting
  brand/
    brand_adapter.ts        ← BrandAdapter interface for kit generation providers
    manual_adapter.ts       ← professor-provided BrandKit passthrough with defaults
    pomelli_adapter.ts      ← no-API Pomelli stub delegating to ManualAdapter
  layout/
    layout_adapter.ts       ← LayoutAdapter interface for layout generation providers
    paste_adapter.ts        ← no-API paste workflow pointer for direct adapter calls
    stitch_adapter.ts       ← no-API Stitch stub delegating to PasteAdapter
  resources/
    slots.ts                ← runtime slot vocabulary validation
    json_schema.ts          ← lightweight JSON Schema fragment validation
    template.ts             ← template manifest/structure/slots validator
    theme.ts                ← theme manifest/theme.json/image prompt validator
    prompt_set.ts           ← prompt-set manifest/prompts.json validator
  tools/
    setup_cc.ts             ← configure providers, models, routing
    get_cc_status.ts        ← health snapshot
    setup_panopto.ts        ← configure Panopto domain + OAuth credentials → panopto-config.json
    setup_panopto_vocab.ts  ← manage panopto-vocab.json (filler words + corrections)
    workflows/
      analyze_course.ts     ← ingest → score → recommend
      plan_next_semester.ts ← shell → calendar → shift → outline
      update_course_materials.ts  ← draft → examples → export
      full_pipeline.ts      ← all three in sequence
      bulk_fetch_panopto_transcripts.ts  ← download all session VTTs → writes _sessions.json manifest
      enrich_panopto_transcripts.ts      ← reads _sessions.json, calls enrichVttFile per session → .enriched.md
  passthrough/
    ci_tools.ts             ← all 27 CI tools re-registered with taskCategory
    downloader_tools.ts     ← Canvas Backup CLI bridge
    design_tools.ts         ← Canvas Design Studio import/generate pass-throughs

tests/                      ← mirrors src/ structure
scripts/
  smoke-cc.ts               ← live smoke test against real ITM 370 archives
  smoke-integration.ts      ← fixture smoke test across CI + Design Studio
```

See `CLAUDE.md`, `docs/integration-contracts.md`, and `docs/architecture-review-followups.md` before changing data flow between apps.

Registry foundation work for installable templates/themes/prompts/adapter configs is tracked in `docs/superpowers/plans/2026-05-21-local-registry.md`.
The `install_resource` resolver/tool layer is tracked in `docs/superpowers/plans/2026-05-21-install-resource.md`.
The `list_installed_resources` and `uninstall_resource` tools are tracked in `docs/superpowers/plans/2026-05-21-list-uninstall-resources.md`.
The `search_registry` tool is tracked in `docs/superpowers/plans/2026-05-21-search-registry.md`.
The `install_resources_from_lockfile` tool is tracked in `docs/superpowers/plans/2026-05-21-lockfile-install.md`.
The template validator is tracked in `docs/superpowers/plans/2026-05-21-template-validator.md`.
The theme validator is tracked in `docs/superpowers/plans/2026-05-21-theme-validator.md`.
The prompt-set validator is tracked in `docs/superpowers/plans/2026-05-21-prompt-set-validator.md`.
The bundle installer is tracked in `docs/superpowers/plans/2026-05-21-bundle-install.md`.
The brand adapter foundation is tracked in `docs/superpowers/plans/2026-05-21-brand-adapter.md`.
The Pomelli adapter stub is tracked in `docs/superpowers/plans/2026-05-21-pomelli-adapter-stub.md`.
The layout adapter foundation is tracked in `docs/superpowers/plans/2026-05-21-layout-adapter.md`.
The Stitch adapter stub is tracked in `docs/superpowers/plans/2026-05-21-stitch-adapter-stub.md`.
The update-course-materials report shape is tracked in `docs/superpowers/plans/2026-05-21-update-course-materials-result.md`.

---

## Data home

`~/.command-and-control/config.json` holds all C&C config. The env var `CC_HOME` overrides this for test isolation (same pattern as CI's `CURRICULUM_INTELLIGENCE_HOME`).

---

## All tools

### C&C tools (6)

| Tool | File | What it does |
|------|------|--------------|
| `setup_cc` | `src/tools/setup_cc.ts` | Configure providers, models, mode, routing |
| `get_cc_status` | `src/tools/get_cc_status.ts` | Health snapshot |
| `analyze_course` | `src/tools/workflows/analyze_course.ts` | Ingest → score → recommend |
| `plan_next_semester` | `src/tools/workflows/plan_next_semester.ts` | Shell → calendar → shift → outline |
| `update_course_materials` | `src/tools/workflows/update_course_materials.ts` | Draft → examples → export |
| `full_pipeline` | `src/tools/workflows/full_pipeline.ts` | All three phases |

### CI pass-through tools (27)

All 27 Curriculum Intelligence tools re-registered verbatim. See `src/passthrough/ci_tools.ts` for the complete list. Source schemas: `D:\Dev\Curriculum-Intelligence\src\index.ts`.

### Canvas tools (2)

`download_canvas_archive` invokes Canvas Backup (`canvas-backup`) through a CLI bridge. It discovers Canvas Backup from `CANVAS_BACKUP_COMMAND`, `CANVAS_BACKUP_REPO`, a sibling `../Canvas-Download` checkout, or `canvas-backup` on PATH.

`import_course` and `generate_course` call real Canvas Design Studio functions from `@canvas-toolchain/canvas-design-studio`.

`publish_course` is shipped as a reviewed page-by-page transaction (the V&R system): `preview_course_publish` → per-page approvals → `publish_course`, with snapshots, rollback, widget publishing, Canvas breadcrumbs, and snapshot retention/auto-pruning.

### Panopto tools (4)

| Tool | File | What it does |
|------|------|--------------|
| `setup_panopto` | `src/tools/setup_panopto.ts` | Store domain + OAuth credentials in `panopto-config.json` |
| `bulk_fetch_panopto_transcripts` | `src/tools/workflows/bulk_fetch_panopto_transcripts.ts` | Download all session VTTs; write `_sessions.json` manifest |
| `setup_panopto_vocab` | `src/tools/setup_panopto_vocab.ts` | Add/remove filler words and vocabulary corrections in `panopto-vocab.json` |
| `enrich_panopto_transcripts` | `src/tools/workflows/enrich_panopto_transcripts.ts` | Enrich downloaded VTTs into readable `.enriched.md` files |

The intended professor workflow is: `setup_panopto` → `bulk_fetch_panopto_transcripts` → (optionally) `setup_panopto_vocab` → `enrich_panopto_transcripts`. The download and enrichment steps are deliberately decoupled via `_sessions.json` so professors can re-enrich with updated vocab without re-downloading.

See the **Panopto transcript pipeline** section below for data flow, file contracts, and design decisions.

---

## Panopto transcript pipeline

Professors record lectures in Panopto. This pipeline converts raw machine-generated VTT transcripts into clean, structured markdown notes with Panopto deep links and highlighted key statements.

### Data flow

```
setup_panopto                    → panopto-config.json  (domain + OAuth credentials)
bulk_fetch_panopto_transcripts   → 2026-01-15_Week-1.panopto.vtt × N
                                 → _sessions.json        (download manifest)
setup_panopto_vocab              → panopto-vocab.json   (filler words + corrections)
enrich_panopto_transcripts       → 2026-01-15_Week-1.enriched.md × N
```

### `_sessions.json` — the download↔enrichment contract

Written by `bulk_fetch_panopto_transcripts` (CDS `panopto.ts`), read by `enrich_panopto_transcripts`. Decoupling via this manifest means enrichment can run independently of the network — professors tweak vocab and re-enrich without re-downloading.

Shape (typed as `SessionsManifest` in `@canvas-toolchain/canvas-design-studio/dist/tools/panopto-enrich.js`):

```json
{
  "domain": "example.instructure.com",
  "generatedAt": "2026-05-01T12:00:00.000Z",
  "sessions": [
    {
      "sessionId": "abc-123",
      "title": "Week 1 Lecture",
      "startTime": "2026-01-15T14:00:00Z",
      "duration": 3600,
      "filename": "2026-01-15_Week-1-Lecture.panopto.vtt"
    }
  ]
}
```

### `panopto-vocab.json` — professor vocabulary config

Stored at `~/.command-and-control/panopto-vocab.json` (env `CC_HOME` overrides for test isolation).

```json
{ "fillerWords": ["essentially"], "corrections": [{ "from": "KOBE", "to": "COBE" }] }
```

Written atomically: write to `.tmp` → `renameSync` to final path. `mode: 0o600` because it shares the config directory with `panopto-config.json` which contains OAuth credentials.

`loadPanoptoVocab()` throws a **plain object** `{ error, fix }` (not an `Error` instance) when the file is corrupt. This is intentional: `enrich_panopto_transcripts.ts` catches it as `err: any` and forwards `err.error` + `err.fix` directly into the structured MCP result shape. An `Error` instance would require extra unwrapping.

### Enrichment algorithm

The enrichment logic lives in CDS at `src/tools/panopto-enrich.ts` and is called by C&C through `@canvas-toolchain/canvas-design-studio`. See `packages/canvas-design-studio/AGENTS.md` for the algorithm walkthrough.

### Error taxonomy

All errors surface as structured result objects — the workflow never throws. Per-session failures accumulate in `result.failed[]` so one bad VTT does not abort the batch.

| Code | Trigger | Fix hint |
|------|---------|----------|
| `MANIFEST_NOT_FOUND` | No `_sessions.json` in `transcriptsPath` | Run `bulk_fetch_panopto_transcripts` first |
| `MANIFEST_CORRUPT` | `_sessions.json` is not valid JSON | Re-run `bulk_fetch_panopto_transcripts` |
| `PANOPTO_NOT_CONFIGURED` | `panopto-config.json` missing/invalid | Run `setup_panopto` |
| `VOCAB_CORRUPT` | `panopto-vocab.json` is not valid JSON | Delete it and re-run `setup_panopto_vocab` |

---

## Test isolation pattern

```typescript
let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});
```

---

## Adding a new domain app

1. Add the package as an npm dependency in `package.json`.
2. Create `src/passthrough/<app>_tools.ts` following the `downloader_tools.ts` pattern.
3. Import and spread into `ALL_PASSTHROUGH` in `src/index.ts`.
4. Add workflow tools to `src/tools/workflows/` if needed.

For Python or other non-Node domain tools, prefer a narrow CLI bridge with explicit config/env discovery and a fixture smoke test before considering a rewrite.

## Integration hardening notes

The May 2026 hardening pass made two deliberate decisions:

- Keep the coordinator in TypeScript because Curriculum Intelligence and Canvas Design Studio are already tested TypeScript MCP packages.
- Bridge Canvas Backup through its existing Python CLI because the downloader is the only runtime outlier and already has working professor-facing launchers.

Do not reintroduce fake npm package names such as `canvas-design-studio-mcp` or `canvas-downloader-mcp`. The real packages are `@canvas-toolchain/canvas-design-studio`, `@canvas-toolchain/curriculum-intelligence`, and `@canvas-toolchain/command-and-control` (bins: `canvas-toolchain-design-studio`, `canvas-toolchain-curriculum-intelligence`, `canvas-toolchain-server` / `canvas-toolchain-dashboard`); Canvas Backup remains `canvas-backup`.

## Architecture review backlog

Gemini/Antigravity review findings are triaged in `docs/architecture-review-followups.md`. Treat that file as the durable backlog for packaging, downloader progress, non-destructive CI metadata, live search, semantic currency scoring, and the future Go installer idea.

---

## Running the server

```bash
npm run build
node dist/index.js
```

Claude MCP config (`~/.claude/mcp_servers.json`):

```json
{
  "command-and-control": {
    "command": "node",
    "args": ["D:/Dev/canvas-toolchain/packages/command-and-control/dist/index.js"]
  }
}
```

---

## Environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `CC_HOME` | Root for C&C config (overrides `~/.command-and-control`) | No |
| `CURRICULUM_INTELLIGENCE_HOME` | Root for CI data | No (defaults to `~/.curriculum-intelligence`) |
| `ANTHROPIC_API_KEY` | Anthropic API calls | Only for judgment-category tools |
| `OLLAMA_BASE_URL` | Not used directly — configure via `setup_cc` | No |
| `CANVAS_BACKUP_COMMAND` | Explicit Canvas Backup executable for the downloader bridge | No |
| `CANVAS_BACKUP_REPO` | Path to a Canvas Backup checkout with `.venv` | No |
