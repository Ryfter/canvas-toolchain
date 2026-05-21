# Command & Control MCP — Agent Handoff Guide

Read this before touching anything. Claude-focused guidance also lives in `CLAUDE.md`; keep the two files aligned when changing integration boundaries.

---

## What this project is

**Command & Control** (`command-and-control-mcp`) is an MCP server that acts as a unified entry point for the professor toolset. It imports Curriculum Intelligence and Canvas Design Studio as npm dependencies, reaches Canvas Backup through its Python CLI, re-exposes selected domain tools with task-category annotations, adds high-level workflow tools, and routes LLM calls to Anthropic or Ollama based on config.

**Stack:** Node.js 18+, TypeScript ESM (`"type": "module"`), `@modelcontextprotocol/sdk`, `curriculum-intelligence-mcp` (local file dep at `../Curriculum-Intelligence`), `canvas-design-mcp` (local file dep at `../canvas-design-studio`).

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
  llm/
    client.ts               ← LlmClient + LlmOpts interface
    ollama_adapter.ts       ← OllamaAdapter (HTTP to local Ollama server)
  routing/
    model_router.ts         ← ModelRouter: task-category → adapter dispatch
  kb/
    config.ts               ← load/save ~/.command-and-control/config.json
  registry/
    local_registry.ts       ← local resource registry storage/index/manifest validation
    install_resource.ts     ← file/github/ryfter resolver and install_resource tool implementation
    search_registry.ts      ← free GitHub index search and premium registry search
    lockfile_install.ts     ← ordered lockfile install with per-resource reporting
  resources/
    slots.ts                ← runtime slot vocabulary validation
    json_schema.ts          ← lightweight JSON Schema fragment validation
    template.ts             ← template manifest/structure/slots validator
    theme.ts                ← theme manifest/theme.json/image prompt validator
  tools/
    setup_cc.ts             ← configure providers, models, routing
    get_cc_status.ts        ← health snapshot
    workflows/
      analyze_course.ts     ← ingest → score → recommend
      plan_next_semester.ts ← shell → calendar → shift → outline
      update_course_materials.ts  ← draft → examples → export
      full_pipeline.ts      ← all three in sequence
  passthrough/
    ci_tools.ts             ← all 27 CI tools re-registered with taskCategory
    downloader_tools.ts     ← Canvas Backup CLI bridge + Panopto transcript placeholder
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

### Downloader and Design Studio tools

`download_canvas_archive` invokes Canvas Backup (`canvas-backup`) through a CLI bridge. It discovers Canvas Backup from `CANVAS_BACKUP_COMMAND`, `CANVAS_BACKUP_REPO`, a sibling `../Canvas-Download` checkout, or `canvas-backup` on PATH.

`download_transcripts` is still a placeholder because bulk Panopto transcript download is not implemented in Canvas Backup yet.

`import_course` and `generate_course` call real Canvas Design Studio functions from `canvas-design-mcp`.

`publish_course` is still a placeholder because course-wide publishing needs a reviewed page-by-page transaction model.

---

## Model routing

`ModelRouter` reads `~/.command-and-control/config.json` and dispatches LLM calls:

| taskCategory | Default adapter | Notes |
|-------------|----------------|-------|
| `none` | No LLM call | Data-only tools |
| `fast` | Ollama (if configured + reachable) → Anthropic fallback | Light inference |
| `judgment` | Anthropic | Deep reasoning |

Ollama is an optional add-on. Anthropic is the default for all categories. To enable Ollama for `fast` tasks:
1. Set `ollamaBaseUrl` and `ollamaModel` via `setup_cc`
2. Set `routingFast: 'ollama'` via `setup_cc`

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

Do not reintroduce fake npm package names such as `canvas-design-studio-mcp` or `canvas-downloader-mcp`. The real packages/commands are `canvas-design-mcp`, `curriculum-intelligence-mcp`, and `canvas-backup`.

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
    "args": ["D:/Dev/Command-and-Control-MCP/dist/index.js"]
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
