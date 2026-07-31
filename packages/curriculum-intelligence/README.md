# Canvas Toolchain — Curriculum Intelligence

MCP server that reads past course archives and lecture transcripts, scores topic currency, and plans the next semester.

Part of a three-app toolchain built for fast-moving courses like ITM 370 (AI-Augmented Projects):

```
Canvas Downloader → Curriculum Intelligence → Canvas Design Studio
```

- **Canvas Downloader** — pulls raw data (Panopto transcripts, Canvas exports) onto disk
- **Curriculum Intelligence** — this app — analyzes what was taught, what aged out, what's new
- **Canvas Design Studio** — takes the updated plan and makes the course pages look polished

## Status

**v1.1.0 — complete.** All 27 MCP tools shipped. Current local verification: 141 tests passing and `npm run build` passing.

See [`docs/superpowers/specs/2026-05-17-curriculum-intelligence-design.md`](docs/superpowers/specs/2026-05-17-curriculum-intelligence-design.md) for the full design and [`DECISIONS.md`](DECISIONS.md) for implementation decisions.

## Install

```bash
npm install
npm run build
```

## Run

```bash
npm run dev
```

Speaks MCP over stdio. Wire into Claude Code or Claude Desktop the same way as Canvas Design Studio:

```json
{
  "mcpServers": {
    "curriculum-intelligence": {
      "command": "node",
      "args": ["path/to/curriculum-intelligence/dist/index.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

`ANTHROPIC_API_KEY` is only required for `scan_recent_developments`. All other tools run without it.

## Config location

App state lives at `~/.curriculum-intelligence/` by default. Override with `CURRICULUM_INTELLIGENCE_HOME`.

```
~/.curriculum-intelligence/
  config.json              # registered courses + app settings
  courses/
    <courseId>/
      config.json          # semester history, feed list, options
      ideas.md             # generated after v0.6 run
      news-cache.json      # RSS feed cache
      semesters/
        <semesterId>/
          topic-map.json
          transcripts.json
          week-map.json
          quote-bank.json
          off-syllabus.json
          diff-vs-<other>.json
```

## MCP Tools

### Setup & ingest

| Tool | What it does |
|------|-------------|
| `setup_course` | Register a course — creates the folder tree and config |
| `get_course_state` | List registered courses or inspect a single course |
| `ingest_canvas_archive` | Walk a Canvas export folder, write `topic-map.json` |

### Introspection

| Tool | What it does |
|------|-------------|
| `list_assignments` | List assignments from the ingested topic map |
| `list_pages` | List pages |
| `list_modules` | List modules (pass `expandItems=true` for full item detail) |
| `list_resources` | List external resource links referenced in course content |

### Diff

| Tool | What it does |
|------|-------------|
| `diff_semesters` | Side-by-side diff of two semesters — added, removed, reused, rewritten |

### Transcripts

| Tool | What it does |
|------|-------------|
| `ingest_transcripts` | Read `.vtt` / `.srt` / `.md` transcript files, tag `source=panopto\|whisper` |
| `map_transcripts_to_weeks` | Match each transcript to its course week by filename hints |
| `extract_lecture_topics` | Return shaped lecture chunks ready for Claude to summarize |
| `find_off_syllabus_topics` | Surface transcript tokens not present in syllabus pages for that week |
| `build_quote_bank` | Extract notable lines matching deliberate-point trigger phrases |

### Currency & signals

| Tool | What it does |
|------|-------------|
| `fetch_news_feed` | Pull RSS/Atom feeds, filter by date, cache to `news-cache.json` |
| `scan_recent_developments` | Ask Claude (Anthropic API) what's new in a topic area since a date |
| `suggest_topics` | Merge feed items + scan developments into ranked topic candidates |
| `score_topic_currency` | Classify a topic as `evergreen / current / dated` |
| `recommend_for_topic` | Return `KEEP / UPDATE / DROP / ADD` verdict with rationale |

### Output

| Tool | What it does |
|------|-------------|
| `generate_ideas_file` | Write `ideas.md` listing deferred v1 scope and next prompts for Claude |

## Tests

```bash
npm test
```

83 tests across 15 test files. All fixture-based — no network calls in the test suite.

## Typical workflow

```
1. setup_course          → register ITM370
2. ingest_canvas_archive → parse Spring2025 export
3. ingest_canvas_archive → parse Fall2024 export (for diff)
4. diff_semesters        → what changed between semesters
5. ingest_transcripts    → load .vtt files from Canvas Downloader
6. map_transcripts_to_weeks
7. find_off_syllabus_topics  → what did the lecture cover beyond the syllabus?
8. build_quote_bank          → pull notable lines for course materials
9. fetch_news_feed           → pull Simon Willison, AI news blogs
10. scan_recent_developments → ask Claude what's new in "Prompt engineering"
11. suggest_topics           → merge signals into ranked candidates
12. score_topic_currency     → classify each topic
13. recommend_for_topic      → get KEEP/UPDATE/DROP/ADD verdicts
14. generate_ideas_file      → capture what to build next
```

## Planning and Export Tools

- `generate_recommended_outline` — draft next-semester module sequence
- `draft_assignment_brief` — redraft an assignment with updated context
- `import_previous_shell`, `shift_dates`, `update_examples`, `export_course_folder` — shell update pipeline

## Deferred

- Second-brain `TopicSource` adapter
- Cross-app model-routing UI in Command & Control

See `ideas.md` (generated after a run) and [`DECISIONS.md`](DECISIONS.md) for context.
