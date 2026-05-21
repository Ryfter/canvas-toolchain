# Curriculum Intelligence — Agent Handoff Guide

This file exists for AI coding agents (ChatGPT Codex, Claude Code, etc.) picking up work on this repo. Read it before touching anything.

---

## What this project is

**Curriculum Intelligence** is an MCP (Model Context Protocol) server. It runs as a local Node.js process and exposes tools that a professor can call through Claude or any MCP-compatible client. The server reads Canvas LMS export archives and lecture transcripts, scores topic currency, and plans next semester's course.

**Stack:** Node.js 18+, TypeScript ESM (`"type": "module"`), MCP SDK `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk` for LLM calls, `gray-matter` for YAML front matter, `fast-xml-parser` for RSS. Tests: `vitest`.

**This is not a web app. There is no frontend, no database, no HTTP server.** Everything is local disk files under `CURRICULUM_INTELLIGENCE_HOME` (defaults to `~/.curriculum-intelligence`).

---

## Current state: v1.1.0 — COMPLETE

All 27 MCP tools are implemented and tested. 141 tests, 27 test files, all passing.

**Run tests:** `npm test`  
**Build:** `npm run build`  
**Smoke test (requires real Canvas archives on disk):** `npx tsx scripts/smoke-real-archive.ts`

---

## Repository layout

```
src/
  index.ts                  ← MCP server entry point; all tool registrations live here
  types.ts                  ← All shared TypeScript types (read this first)
  tools/                    ← One file per MCP tool (27 tools)
  parsers/                  ← Data parsers (Canvas archive, VTT/SRT transcripts, academic calendar, front matter, CDS folder)
  sources/                  ← Pluggable topic signal sources (RSS, LLM scan)
  llm/                      ← LlmClient interface + AnthropicAdapter
  kb/                       ← Knowledge base read/write (course_state, topic_map, topic_history, next_plan)
  utils/                    ← Error formatting

tests/
  fixtures/                 ← Fixture data for all tests (no network calls in tests)
    canvas-archive-tiny/    ← Minimal Canvas export (2 assignments, 2 modules)
    canvas-archive-tiny-v2/ ← Second semester fixture (different module content)
    cds-course-tiny/        ← CDS course/ folder fixture
    academic-calendar-bsu.html  ← HTML fixture for calendar parser
    transcripts-tiny/       ← VTT/SRT transcript fixtures
  tools/                    ← Tool integration tests
  parsers/                  ← Parser unit tests
  kb/                       ← KB utility tests

scripts/
  smoke-real-archive.ts     ← Live smoke test against real ITM 370 archives

docs/
  superpowers/specs/
    2026-05-17-curriculum-intelligence-design.md   ← v0.6 design spec
    2026-05-18-curriculum-intelligence-v1.0-design.md  ← v1.0 design spec
  superpowers/plans/
    2026-05-18-curriculum-intelligence-v1.0.md     ← v1.0 implementation plan (14 tasks)

DECISIONS.md   ← Architecture decisions with rationale (read for context)
```

---

## Data model

Everything lives under `CURRICULUM_INTELLIGENCE_HOME` (env var, defaults to `~/.curriculum-intelligence`):

```
<home>/
  courses/
    <courseId>/               e.g. ITM370/
      config.json             course metadata, registered semesters, RSS feeds
      topic-history.json      cross-semester topic timeline
      ideas.md                (generated) post-v0.6 follow-on ideas
      export/                 CDS-format exports from export_course_folder
      semesters/
        <semesterId>/         e.g. Spring2025/
          archive/            raw Canvas export files (read-only)
          transcripts/        .vtt/.srt/.md lecture transcripts
          topic-map.json      structured ingest output from ingest_canvas_archive
          quote-bank.json     notable transcript quotes
          currency-report.json  topic currency scores + verdicts
          diff-vs-<other>.json  semester diff output
          next-plan/           v1.0 planning folder
            plan-config.json
            calendar.json
            plan-outline.md
            week-01/
              <assignment-slug>.md   brief files with CI front matter
            week-02/
              ...
```

### Brief file format (in `next-plan/week-XX/`)

Each brief is a Markdown file with YAML front matter parsed by `gray-matter`:

```markdown
---
title: "Gamification and Incentivizing AI - Part 1"
week: 7
type: assignment
points: 20
due: TBD                        # set by shift_dates
originalDue: "2025-10-13"       # from source semester archive
due_sections:                   # multi-section only, set by shift_dates
  "01": "2026-10-11"
  "02": "2026-10-12"
verdict: UPDATE                 # from recommend_for_topic or default
currency: current               # evergreen | current | dated
lastTaught: Spring2025
semestersSince: 1
newsHits: 3
staleness: moderate             # low | moderate | high
replacement_recommended: false
break_collision: false          # set by shift_dates when onBreakCollision: 'flag'
---

Brief body text here...
```

CI-specific fields (`verdict`, `currency`, `lastTaught`, `semestersSince`, `newsHits`, `staleness`, `replacement_recommended`, `originalDue`, `break_collision`) are stripped by `export_course_folder` before writing CDS output.

---

## All 27 MCP tools

### v0.6 tools (analysis layer)

| Tool | File | What it does |
|------|------|--------------|
| `setup_course` | `src/tools/setup_course.ts` | Register a course, create folder structure |
| `get_course_state` | `src/tools/get_course_state.ts` | List registered semesters, last-run timestamps |
| `ingest_canvas_archive` | `src/tools/ingest_canvas_archive.ts` | Walk Canvas export → `topic-map.json` |
| `list_assignments` | `src/tools/list_assignments.ts` | Query ingested assignments |
| `list_pages` | `src/tools/list_pages.ts` | Query ingested pages |
| `list_modules` | `src/tools/list_modules.ts` | Query ingested modules |
| `list_resources` | `src/tools/list_resources.ts` | Query external resource links |
| `diff_semesters` | `src/tools/diff_semesters.ts` | Side-by-side semester comparison |
| `ingest_transcripts` | `src/tools/ingest_transcripts.ts` | Read VTT/SRT/MD transcripts, tag source |
| `map_transcripts_to_weeks` | `src/tools/map_transcripts_to_weeks.ts` | Match each lecture to its week |
| `extract_lecture_topics` | `src/tools/extract_lecture_topics.ts` | Shaped lecture chunks for Claude to summarize |
| `find_off_syllabus_topics` | `src/tools/find_off_syllabus_topics.ts` | Token-set diff: lecture vs. module pages |
| `build_quote_bank` | `src/tools/build_quote_bank.ts` | Extract notable quotes → `quote-bank.json` |
| `fetch_news_feed` | `src/tools/fetch_news_feed.ts` | Pull RSS feeds, cache per course |
| `scan_recent_developments` | `src/tools/scan_recent_developments.ts` | LLM scan for new developments in topic area |
| `suggest_topics` | `src/tools/suggest_topics.ts` | Merge RSS + LLM scan into ranked candidates |
| `score_topic_currency` | `src/tools/score_topic_currency.ts` | Classify topics: evergreen / current / dated |
| `recommend_for_topic` | `src/tools/recommend_for_topic.ts` | KEEP / UPDATE / DROP / ADD verdict per topic |
| `generate_ideas_file` | `src/tools/generate_ideas_file.ts` | Write `ideas.md` with post-v0.6 follow-on ideas |

### v1.0 tools (planning layer)

| Tool | File | What it does |
|------|------|--------------|
| `import_previous_shell` | `src/tools/import_previous_shell.ts` | Copy last semester's content into `next-plan/` with CI front matter |
| `fetch_academic_calendar` | `src/tools/fetch_academic_calendar.ts` | Parse registrar URL or accept manual dates → `calendar.json` |
| `shift_dates` | `src/tools/shift_dates.ts` | Apply target calendar to all `due:` fields; handle break collisions |
| `generate_recommended_outline` | `src/tools/generate_recommended_outline.ts` | Week-by-week outline from diff + optional currency-report |
| `draft_assignment_brief` | `src/tools/draft_assignment_brief.ts` | LLM-draft updated brief; set `replacement_recommended` on DROP/stale |
| `update_examples` | `src/tools/update_examples.ts` | Mechanical year/tool-name pass + optional LLM proposed-rewrites |
| `export_course_folder` | `src/tools/export_course_folder.ts` | Strip CI fields → CDS `course/` format; one folder per section |

---

## LLM calls

All LLM calls go through `src/llm/client.ts`:

```typescript
interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
```

`AnthropicAdapter` is the default implementation (uses `claude-opus-4-7` via `@anthropic-ai/sdk`). `OllamaAdapter` is also available for local models — set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` env vars to use it. The MCP server (`src/index.ts`) picks the adapter automatically via `getLlmClient()`.

**For tests:** every tool that makes LLM calls accepts an optional `llmClient?: LlmClient` parameter. Pass a mock to avoid real API calls. Example:

```typescript
const MOCK_LLM: LlmClient = { complete: async () => 'mock response' };
await draftAssignmentBrief({ ..., llmClient: MOCK_LLM });
```

Tools that do NOT yet use real web search: `scan_recent_developments` has a `webSearch: true` option in `LlmOpts` but it's a no-op — the tool prompts Claude to reason from training data instead. See `DECISIONS.md` for why.

---

## Test isolation pattern

Every test file uses `CURRICULUM_INTELLIGENCE_HOME` to isolate state:

```typescript
let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});
```

Never use real archive paths in tests. All test input comes from `tests/fixtures/`.

---

## v1.0 planning workflow (end-to-end sequence)

```
1. import_previous_shell    → next-plan/ skeleton (brief stubs with CI front matter)
2. fetch_academic_calendar  → calendar.json (URL scrape, manual dates, or semester pattern)
3. shift_dates              → updates due: in every brief; handles break collisions
4. generate_recommended_outline → plan-outline.md (week table with verdicts)
5. [professor reviews in conversation with Claude, requests changes]
6. draft_assignment_brief   → LLM rewrites individual briefs (called per-brief)
7. update_examples          → mechanical year/tool-name replacement (called per-brief)
8. export_course_folder     → CDS course/ folder (strips CI fields, one folder per section)
```

Steps 1–4 are data operations (no LLM). Steps 6–7 call the LLM. Step 8 is pure file I/O.

---

## Key implementation decisions (from DECISIONS.md)

- **`termStart` in topic-map**: `shift_dates` reads `sourceTopicMap.course.termStart` to compute day offsets. This is a full ISO datetime string (`"2025-01-13T07:00:00Z"`); only the first 10 characters are used.
- **`originalDue` field**: Brief stubs store the source semester's raw due date so `shift_dates` can compute offsets without needing to re-read the archive.
- **`extractDateRange` "earliest match wins"**: The calendar HTML parser runs both range and single-date regexes on a 300-char window and picks whichever starts at a lower index. This prevents adjacent holidays from capturing each other's dates.
- **`updateExamples` overloads**: The function is synchronous when `llmPass` is falsy, async when `llmPass: true`. TypeScript overloads express this; the MCP handler in `index.ts` checks `p.llmPass` before awaiting.
- **CI fields stripped on export**: `export_course_folder` removes `verdict`, `currency`, `lastTaught`, `semestersSince`, `newsHits`, `staleness`, `replacement_recommended`, `originalDue`, `break_collision` from front matter. These are CI-internal and not understood by Canvas Design Studio.

---

## Command & Control integration

The combined workflow lives in `D:\Dev\Command-and-Control-MCP`. Curriculum Intelligence should stay focused on analysis and planning, but it is now a real local dependency of C&C.

Current integration decisions:

- C&C imports `curriculum-intelligence-mcp` directly.
- C&C imports `canvas-design-mcp` directly.
- C&C invokes Canvas Backup through its Python CLI bridge.
- The cross-app fixture smoke is `cd D:\Dev\Command-and-Control-MCP; npm run smoke:integration`.
- The durable data handoff into Design Studio remains the CDS `course/` folder created by `export_course_folder` or Design Studio `import_course`.

Do not move orchestration, model routing, or installer concerns into this repo unless the domain boundary is intentionally being changed.

## What is NOT in scope here

- Web search in `scan_recent_developments` beyond the current adapter support
- Second-brain `TopicSource` adapter
- Cross-app model routing policy
- Canvas API direct publish (Canvas Design Studio owns that)
- Command & Control orchestration layer

---

## How to add a new tool

1. Create `src/tools/<tool_name>.ts` — export `Input` interface, `Result` interface, and the function.
2. Create `tests/tools/<tool_name>.test.ts` — TDD, use `CURRICULUM_INTELLIGENCE_HOME` isolation, fixture-based.
3. Import the function in `src/index.ts`.
4. Add a tool descriptor to the `ListToolsRequestSchema` handler.
5. Add a dispatch handler to the `CallToolRequestSchema` handler.
6. `npm run build && npm test`.

The tool function never reads `CURRICULUM_INTELLIGENCE_HOME` directly — use `src/kb/course_state.ts` helpers (`getCoursePath`, `getSemesterPath`) which respect the env var.

---

## Environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `CURRICULUM_INTELLIGENCE_HOME` | Root directory for all course data | No (defaults to `~/.curriculum-intelligence`) |
| `ANTHROPIC_API_KEY` | LLM calls via `AnthropicAdapter` | Only for tools that call the LLM |
| `OLLAMA_BASE_URL` | Ollama server URL, e.g. `http://localhost:11434` | Only when using local models |
| `OLLAMA_MODEL` | Ollama model name, e.g. `llama3.2` | Required when `OLLAMA_BASE_URL` is set |

---

## Running the MCP server

```bash
npm run build
node dist/index.js
```

Add to Claude Code's MCP config (`~/.claude/mcp_servers.json` or similar):

```json
{
  "curriculum-intelligence": {
    "command": "node",
    "args": ["/absolute/path/to/dist/index.js"]
  }
}
```
