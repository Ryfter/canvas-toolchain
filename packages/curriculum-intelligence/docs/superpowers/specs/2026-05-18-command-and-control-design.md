# Command & Control MCP — Design Spec

**Date:** 2026-05-18  
**Status:** Approved  
**Author:** the toolchain author

> **Status note, 2026-05-19:** This spec is partly superseded by the implemented integration. Command & Control now imports `curriculum-intelligence-mcp` and `canvas-design-mcp` directly, while Canvas Backup remains the Python `canvas-backup` CLI reached through a bridge. Do not copy the older placeholder package names `canvas-downloader-mcp` or `canvas-design-studio-mcp` into live code or docs.

---

## Overview

Command & Control (`command-and-control-mcp`) is a new standalone MCP server that acts as the unified entry point for the entire professor toolset. It imports the three domain apps (Curriculum Intelligence, Canvas Downloader, Canvas Design Studio) as npm dependencies, re-exposes all their tools, adds four high-level workflow tools, and routes every LLM call to the right model based on task complexity.

A professor installs one package and adds one line to Claude's MCP config. They get everything.

---

## What this is NOT

- Not a subprocess manager. No MCP-over-MCP. Single process, single server.
- Not a replacement for the domain apps. Each domain app remains independently installable and usable on its own. C&C is the convenience layer for professors who want the full stack.
- Not a web app or dashboard. It is an MCP server. The professor interacts with it through Claude conversation.

---

## Architecture

```
Professor's Claude client
        │ (MCP protocol)
        ▼
command-and-control-mcp  (single Node.js process)
        │
        ├── imports curriculum-intelligence-mcp (npm dep)
        ├── imports canvas-downloader-mcp       (npm dep, optional)
        └── imports canvas-design-studio-mcp    (npm dep, optional)
```

C&C calls domain app functions directly (TypeScript imports). No subprocesses, no sockets, no inter-process communication.

**Data home:** `~/.command-and-control/` holds `config.json`. Domain apps continue to own their own homes (`~/.curriculum-intelligence/`, etc.).

**Stack:** Node.js 18+, TypeScript ESM (`"type": "module"`), `@modelcontextprotocol/sdk`. No new frameworks beyond what CI uses.

---

## Tool inventory

### Observability & config (2 tools)

| Tool | What it does |
|------|-------------|
| `setup_cc` | Write `config.json`: set mode (easy/advanced), configure Anthropic model name, configure Ollama base URL + model, set routing preferences |
| `get_cc_status` | Health snapshot: which domain packages are detected, is `ANTHROPIC_API_KEY` present, is Ollama reachable, active model config per routing category, last-run timestamps per workflow |

### High-level workflow tools (4 tools)

| Tool | What it does | Constituent tools |
|------|-------------|-------------------|
| `analyze_course` | "How stale is my course?" | `ingest_canvas_archive` → `score_topic_currency` → `recommend_for_topic` |
| `plan_next_semester` | "Get me ready to plan" | `import_previous_shell` → `fetch_academic_calendar` → `shift_dates` → `generate_recommended_outline` |
| `update_course_materials` | "Update and export" | `draft_assignment_brief` (per brief) → `update_examples` → `export_course_folder` |
| `full_pipeline` | All three workflows end-to-end | All of the above in sequence; returns intermediate results after each phase with a `status` field (`"complete"` or `"awaiting_review"`) so Claude can present findings to the professor before proceeding |

Workflow tools report progress after each constituent step and surface errors with enough context for the professor to recover without knowing which underlying tool failed.

### Pass-through tools (27+ tools)

Every CI tool is re-registered in C&C with the same input/output schema. Canvas Downloader and Design Studio tools are registered as stubs that return a friendly "package not installed" message until those npm packages are available.

Each pass-through tool carries a hidden `taskCategory` annotation (`none` | `fast` | `judgment`) used by the model router. Professors never see this field.

**Task category assignments for CI tools:**

| Category | Tools |
|----------|-------|
| `none` | `setup_course`, `get_course_state`, `ingest_canvas_archive`, `list_assignments`, `list_pages`, `list_modules`, `list_resources`, `diff_semesters`, `ingest_transcripts`, `map_transcripts_to_weeks`, `find_off_syllabus_topics`, `import_previous_shell`, `fetch_academic_calendar`, `shift_dates`, `export_course_folder` |
| `fast` | `extract_lecture_topics`, `build_quote_bank`, `fetch_news_feed`, `update_examples`, `score_topic_currency` |
| `judgment` | `scan_recent_developments`, `suggest_topics`, `recommend_for_topic`, `generate_ideas_file`, `draft_assignment_brief`, `generate_recommended_outline` |

---

## Model routing

Every tool call that triggers an LLM goes through a single `ModelRouter` class.

### Routing table

| `taskCategory` | What it covers | Default adapter | Fallback |
|---------------|---------------|-----------------|----------|
| `none` | Pure data operations | No LLM call | — |
| `fast` | Light inference — classification, year replacement, quote extraction | Ollama (if configured and reachable) | Anthropic |
| `judgment` | Deep reasoning — drafting, currency scoring, verdicts | Anthropic | Anthropic |

### Rules

1. If Ollama is not configured or unreachable, `fast` falls back to Anthropic silently.
2. `judgment` always uses Anthropic unless `routing.judgment` is explicitly set to `"ollama"` in `config.json` (advanced mode only, for professors with a capable local model).
3. `ANTHROPIC_API_KEY` is read from the environment, never stored in config.
4. In **easy mode**, routing is invisible to the professor.
5. In **advanced mode**, `get_cc_status` shows which adapter handled the last call per category.

### `ModelRouter` interface

```typescript
interface RoutedLlmClient {
  forCategory(category: TaskCategory): LlmClient;
}
```

`forCategory('fast')` returns an `OllamaAdapter` if Ollama is configured and a health check passes, otherwise an `AnthropicAdapter`. `forCategory('judgment')` always returns `AnthropicAdapter` (unless overridden in config).

---

## Config schema

**Location:** `~/.command-and-control/config.json`

```json
{
  "mode": "easy",
  "providers": {
    "anthropic": {
      "model": "claude-sonnet-4-6"
    },
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "model": "llama3.2"
    }
  },
  "routing": {
    "fast": "ollama",
    "judgment": "anthropic"
  },
  "lastRun": {
    "analyze_course": null,
    "plan_next_semester": null,
    "update_course_materials": null,
    "full_pipeline": null
  }
}
```

**Defaults on first run:** mode `easy`, Anthropic model `claude-sonnet-4-6`, no Ollama configured, both routing entries default to `"anthropic"`.

`setup_cc` is the only tool that writes this file. No manual editing required.

---

## Ollama adapter

`OllamaAdapter` implements the same `LlmClient` interface used throughout CI:

```typescript
interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
```

**Implementation:** HTTP POST to `{baseUrl}/api/generate` using Node's built-in `fetch`. No new npm dependencies.

**Health check:** `GET {baseUrl}/api/tags` — if it times out or errors, the adapter is considered unreachable and routing falls back to Anthropic.

**Note:** `OllamaAdapter` is added to `curriculum-intelligence-mcp` in the same work session as this spec, so CI can be used with Ollama independently of C&C. C&C imports it from CI (`curriculum-intelligence-mcp/dist/llm/ollama_adapter.js`). Until CI publishes v1.1.0 with the adapter, C&C includes its own copy in `src/llm/ollama_adapter.ts` as a temporary stand-in with identical interface.

---

## Repository structure

New standalone repository at `D:\Dev\Command-and-Control-MCP\`

```
src/
  index.ts                  ← MCP server entry; all tool registrations
  types.ts                  ← Shared types: TaskCategory, CcConfig, RoutedLlmClient
  tools/
    setup_cc.ts
    get_cc_status.ts
    workflows/
      analyze_course.ts
      plan_next_semester.ts
      update_course_materials.ts
      full_pipeline.ts
  routing/
    model_router.ts         ← ModelRouter class + taskCategory map
  llm/
    ollama_adapter.ts       ← OllamaAdapter (re-exported from CI, or re-implemented)
  kb/
    config.ts               ← read/write ~/.command-and-control/config.json
  passthrough/
    ci_tools.ts             ← re-registers all 27 CI tools with taskCategory
    downloader_tools.ts     ← Canvas Downloader stubs
    design_tools.ts         ← Canvas Design Studio stubs

tests/
  tools/
  routing/
  kb/

AGENTS.md                   ← Codex handoff doc
package.json
tsconfig.json
```

**`package.json`:**

```json
{
  "name": "command-and-control-mcp",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "curriculum-intelligence-mcp": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.10.0"
  }
}
```

CI tool functions are imported directly:

```typescript
import { ingestCanvasArchive } from 'curriculum-intelligence-mcp/dist/tools/ingest_canvas_archive.js';
```

---

## Detecting installed domain packages

`get_cc_status` uses a try/catch dynamic import to detect whether each domain package is installed:

```typescript
async function isPackageInstalled(pkg: string): Promise<boolean> {
  try {
    await import(pkg);
    return true;
  } catch {
    return false;
  }
}
```

Pass-through stubs for uninstalled packages return:
```json
{ "error": "canvas-downloader-mcp is not installed. Run: npm install -g canvas-downloader-mcp" }
```

---

## Easy mode vs. advanced mode

| Capability | Easy mode | Advanced mode |
|-----------|-----------|---------------|
| Model routing | Invisible — Anthropic for everything unless Ollama configured | `get_cc_status` shows per-category adapter in use |
| Ollama | Silently used for `fast` tasks if configured | Can override `routing.judgment` to `"ollama"` |
| Workflow tools | Return clean summary output | Return full constituent tool output |
| Error messages | Plain English ("Something went wrong with the date shift step") | Full error with tool name and stack context |

Mode is set once via `setup_cc` and stored in `config.json`.

---

## Testing

- **Unit tests:** `ModelRouter` routing logic (all category + provider combinations), `ConfigStore` read/write, `OllamaAdapter` with a mocked HTTP server.
- **Integration tests:** workflow tools against CI fixtures (using `CURRICULUM_INTELLIGENCE_HOME` isolation pattern from CI). Mock `LlmClient` for all LLM-touching tests.
- **Smoke test:** `scripts/smoke-cc.ts` — calls `setup_cc`, `get_cc_status`, then each workflow tool against real ITM 370 archives. Mirrors `scripts/smoke-real-archive.ts` in CI.

---

## What is NOT in scope for v1.0

- Canvas Downloader pass-through (stubs only — package not yet published)
- Canvas Design Studio pass-through (stubs only — package not yet published)
- Web search in any tool
- Streaming progress (workflow tools report after each step, not in real time)
- Conversation history or session state
- Multi-user or shared config

---

## AGENTS.md requirement

The C&C repo must include an `AGENTS.md` at the root (same style as `curriculum-intelligence-mcp/AGENTS.md`) covering:

- What C&C is and what it is not
- Repository layout
- All 6 C&C tools in a table
- How pass-through tools work and the taskCategory system
- ModelRouter logic and routing table
- Config schema
- How to add a new domain app (install package, add pass-through file, wire stubs)
- How to run the server and add to Claude's MCP config
- Environment variables (`ANTHROPIC_API_KEY`)
- Test isolation pattern
