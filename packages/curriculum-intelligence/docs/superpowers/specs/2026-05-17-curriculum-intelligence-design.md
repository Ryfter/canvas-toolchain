# Curriculum Intelligence — Design & Implementation Plan

**Plan owner:** the toolchain author
**Date:** 2026-05-17
**Target milestone:** v0.5/0.6 (MVP + transcripts + currency scoring)
**Source documents:** `idea.md`, `workflow-overview.md`

---

## 1. Context

ITM 370 (AI-Augmented Projects) and other fast-moving courses go stale between semesters. Every term, the professor needs to answer: *what did I actually teach, what aged out, what's new that I should cover, what gets reused vs. rebuilt, and how do I move all the dates forward without doing it by hand?* Canvas Design Studio makes pages look polished — it doesn't decide what's on them. Curriculum Intelligence is the middle app that turns a past course archive plus lecture transcripts plus current-events signal into a defensible plan for the next semester, then hands the updated course folder to Design Studio for production.

This plan covers **v0.5/0.6** — a deliberate sub-1.0 milestone. After it ships and gets used on real ITM 370 data, the tool generates an `ideas.md` for follow-on work (planning recommendations, shell update + date shifting, deeper integrations). v1.0 follows once those are scoped from real usage.

---

## 2. Decisions (locked in during brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | Form factor | **MCP server** (matches Canvas Design Studio) |
| 2 | Storage | **Local disk only** — `courses/<course-id>/` folder tree |
| 3 | External signals | **Manual RSS feeds + LLM scan** via a pluggable source list (second-brain added later as another source) |
| 4 | Opinionation | **Evidence + suggested verdict**, concise by default, with a "dive deeper" affordance per topic |
| 5 | Shell update location | **Here**, in Curriculum Intelligence (Design Studio stays a pure design/publish layer) |
| 6 | Bulk Panopto transcript download | **Canvas Downloader** owns it. This app reads `.vtt`/`.srt`/`.md` files from disk, tolerant of either Panopto-native or Whisper sources, with `source` tagged so the two can be compared downstream |
| 7 | v1 scope | **v0.5/0.6 = MVP + transcripts + currency.** Planning + shell update + date shifting deferred to a named follow-on. Tool emits `ideas.md` after v0.5/0.6 to capture what comes next |

**Cross-cutting:** all LLM calls flow through a single `LlmClient` interface with adapters (Anthropic in v0.5; Ollama/local-LLM and a future "routing harness" are reserved slots, not built now).

---

## 3. Architecture

**Pattern:** thin MCP server. Tools parse, structure, diff, and persist. Claude (the model on the client side of MCP) does the judgment work — topic synthesis, currency reasoning, verdict suggestion. The server's job is to put well-structured, well-named JSON in front of Claude so the conversation can be deep. This avoids duplicating Claude's intelligence locally and keeps the codebase small.

**Stack:** Node.js + TypeScript, ESM, vitest — matches Canvas Design Studio (`@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, `tsx`, target ES2022, Node16 module resolution).

**Data on disk:**

```
courses/
  <course-id>/                     e.g. ITM370/
    config.json                    semester history, RSS feed list, options
    topic-history.json             cross-semester topic timeline (canonical)
    ideas.md                       (generated) what to build next
    semesters/
      <semester-id>/               e.g. Spring-2025/
        archive/                   raw Canvas export (read-only)
        transcripts/               .vtt/.srt/.md, each tagged source=panopto|whisper
        topic-map.json             structured ingest output
        quote-bank.json
        currency-report.json
        diff-vs-<other-semester>.json
```

`topic-history.json` is the durable artifact across semesters. Per-semester JSONs are derived and regeneratable; `topic-history` is the merge point.

**Modules:**

- `src/index.ts` — MCP server entry, tool registry (matches Design Studio naming)
- `src/tools/` — one file per MCP tool
- `src/parsers/` — Canvas archive walker, `.vtt`/`.srt` parser, Markdown reader
- `src/sources/` — pluggable topic-source interface
- `src/llm/` — `LlmClient` interface + `AnthropicAdapter`
- `src/kb/` — per-course persistent state
- `src/types.ts` — shared TS types
- `tests/` — vitest unit + fixture tests
- `docs/` — README, tool reference, ideas.md template

**Pluggable source seam:**

```ts
interface TopicSource {
  id: string;
  fetchSince(date: Date): Promise<TopicCandidate[]>;
}
```

**LLM seam:**

```ts
interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
```

---

## 4. MCP tools (v0.5/0.6)

### Setup & ingest
- `setup_course`, `ingest_canvas_archive`
- `list_assignments` / `list_pages` / `list_modules` / `list_resources`

### Transcripts
- `ingest_transcripts`, `map_transcripts_to_weeks`, `extract_lecture_topics`
- `find_off_syllabus_topics`, `build_quote_bank`

### Currency & signals
- `score_topic_currency`, `fetch_news_feed`, `scan_recent_developments`
- `suggest_topics`, `recommend_for_topic`

### Diff
- `diff_semesters`

### Project state
- `get_course_state`, `generate_ideas_file`

**Deferred (post-v0.6):** outline generator, brief redrafting, shell update + date shifting, second-brain source, local-LLM adapter, routing harness.

---

## 5. Verdict shape (concise default, dive-deeper on request)

```json
{
  "topic": "Prompt injection attacks",
  "verdict": "UPDATE",
  "rationale": "Last covered Fall 2024; 2025 brought agent-tool-poisoning cases that should replace earlier examples.",
  "details": {
    "lastTaught": "Fall-2024",
    "currencyClass": "current",
    "transcriptMinutes": 18,
    "offSyllabusMinutes": 4,
    "newsHits": [{ "source": "rss:simonwillison", "date": "2026-02-11", "title": "Agent prompt injection in the wild" }],
    "supersededBy": [],
    "relatedTopics": ["Agent tool use", "Tool sandboxing"]
  }
}
```

Default output: `topic / verdict / rationale`. Caller passes `details: true` to expand any topic.

---

## 6. Build order

1. Scaffold + `setup_course` + `get_course_state`
2. `ingest_canvas_archive` + parsers
3. `list_*` introspection tools
4. `diff_semesters`
5. `ingest_transcripts` + VTT/SRT parsers (source-tagged)
6. `map_transcripts_to_weeks` + `extract_lecture_topics`
7. `find_off_syllabus_topics` + `build_quote_bank`
8. `fetch_news_feed` + `RssSource`
9. `LlmClient` + `AnthropicAdapter` + `scan_recent_developments` + `LlmScanSource`
10. `suggest_topics`
11. `score_topic_currency` + `recommend_for_topic`
12. `generate_ideas_file`

Ship and use after each step on real Spring-2025 ITM 370 data.

---

## 7. Verification

- Unit tests on parsers, diff math, currency rules, date heuristics
- Fixture-based integration tests under `tests/fixtures/`
- Live smoke test against a real ITM 370 archive in Claude Code
- Stretch: Whisper-vs-Panopto comparison when Canvas Downloader's module lands

---

## 8. Out of scope for v0.5/0.6

Outline generator, brief redrafting, shell-update + date-shifting (lives here, built later), second-brain source, local-LLM adapter, routing harness.

---

## 9. Open items

- Reuse Canvas Design Studio's archive parser if one exists, otherwise build here
- Confirm shape of `course/` folder Design Studio's `import_course` expects (for v0.7+ shell-update work)
- Pick canonical course-id format and document in `setup_course`
