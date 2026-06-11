# Lecture Answers Bot — Design Spec

> **Status:** Brainstormed + approved 2026-06-04. Ready for implementation plan.
> **Closes:** GitHub issue #61 (Panopto answers bot — Sub-project 4).
> **Companion artifact:** `D:\Dev\AnswerBot\AnswerBotSpecSheet.md` (separate downstream app for the student-facing future).

## One-line

Faculty-facing MCP tool that replaces the professor's NotebookLM workflow for "did I cover this in lecture?" questions. Hybrid keyword + semantic retrieval over a per-course corpus of enriched lecture transcripts, CDS course markdown, slide PDFs, and a hand-curated canonical FAQ. Returns answers with platform-specific deep-link citations and source references. Architecturally platform-agnostic — MVP ships with Panopto, future adapters can plug in Zoom / TechSmith Relay / Mediasite / Echo360 / Kaltura without changes to the answers bot itself.

## Boundary

This is `canvas-toolchain`'s faculty-validation tool. It deliberately does NOT serve students directly. Student-facing Q&A, email ingestion, office-visit Q&A capture, per-student tracking, local model training, and self-healing semester scheduling belong to a separate downstream app (AnswerBot, spec-sheeted at `D:\Dev\AnswerBot\AnswerBotSpecSheet.md`). The boundary is enforced by tool surface — no MCP tool in this spec accepts or stores student PII.

## Architecture

### Hybrid retrieval

Keyword (SQLite FTS5) + vector (sqlite-vec extension) retrieval, merged via Reciprocal Rank Fusion (RRF). Canonical FAQ chunks get a fixed score boost so they sort above transcripts/slides when relevant. Standard 2026 setup; chosen over pure vector RAG and full-context-window stuffing per the professor's strong preference (see `feedback-retrieval-architecture.md`).

### Embedding provider — tiered setup-time fallback

The bot is an optional module. First run of `setup_lecture_answers` configures the embedding provider, using auto-detection with English-alphabet fallback:

- **A — Ollama (default, auto-detected):** Local, free per query, ~768-dim via `nomic-embed-text`. Bot just checks `http://localhost:11434` at startup.
- **B — transformers.js (bundled fallback):** In-process via `@xenova/transformers`, ~384-dim via `BGE-small`. Slower first-query (~10s model load) then fine. Zero install ceremony.
- **C — Voyage AI (paid API fallback):** Top-tier quality, requires `setup_voyage` + working internet. ~1024-dim via `voyage-3`.

Auto-detection flow: if Ollama is reachable, use it. Otherwise, prompt the user to choose B or C. The choice is recorded in `~/.command-and-control/lecture-answers-config.json` and stamped into each index's `index-meta.json` so query-time provider mismatches are detected.

**Vector-dimension lock-in.** Vectors from different providers are mathematically incomparable. Once an index is built, queries MUST use the same provider. If the provider becomes unavailable at query time (Ollama daemon died, internet out for Voyage), the bot **degrades to keyword-only retrieval with a clear warning** — never hard-fails. Provider migration requires a full rebuild via `reembed_course_index`.

### Per-course indexes

Storage lives at `<courseDir>/.canvas-toolchain/answers-index/`. No global cross-course state. `ask_course` takes `courseId` + `courseDir`. Cross-course querying ("did I cover this in either ITM 310 or ITM 370?") is a v1.1 enhancement — `ask_course` will accept an array of courseIds and merge results from each per-course index. MVP is single-course.

### Platform-agnostic transcript layer

The `.enriched.md` format is the contract between any lecture-platform downloader-adapter and the answers bot. Schema:

```markdown
---
sourcePlatform: panopto | zoom | techsmith-relay | mediasite | ...
sourceId: <platform-specific id, e.g. Panopto session GUID>
deepLinkTemplate: "https://example.hosted.panopto.com/.../Viewer.aspx?id={sourceId}&start={startSeconds}"
title: "Week 03 - VLOOKUP Introduction"
recordedAt: 2026-02-15T14:00:00Z
durationSeconds: 3214
---

[00:00:12] So today we're going to talk about VLOOKUP.
[00:00:45] The reason VLOOKUP exists is...
```

The bot generates citations by substituting `{sourceId}` and `{startSeconds}` from the chunk's frontmatter + timestamp. Adding a new platform = ship a downloader-adapter that emits this schema. No changes to the answers bot.

**MVP note:** Sub-project 2's existing `enrich_panopto_transcripts` already emits Panopto deep-link timestamps in its `.enriched.md` output. Step 1 of implementation is a migration step that ensures the frontmatter schema matches the new platform-agnostic contract — adds explicit `sourcePlatform`, `sourceId`, `deepLinkTemplate` fields where missing.

### Self-improvement loop — curated FAQ markdown

File: `<courseDir>/answers/canonical.md`. Format:

```markdown
## How is the final project graded?

See the rubric in week-15. Grade is weighted 40% rubric criteria, 60% peer eval.
[last-reviewed: 2026-06-04]

## When can I drop the lowest quiz score?

The lowest quiz auto-drops at semester end; you don't need to request it.
[last-reviewed: 2026-06-04]
```

Indexer treats each `##` section as a `source: 'canonical'` chunk. Canonical chunks get a fixed retrieval score boost. Curation is by hand — the professor edits the file in his editor, saves, next `ask_course` query auto-detects the mtime change and incrementally re-indexes.

No ML feedback loop, no thumbs-up/down, no active learning. Those belong in AnswerBot where query volume justifies the complexity. For one-professor-one-query-a-week, disciplined hand-curation IS the loop.

## Corpus sources (per course)

| Source | Discovery | Chunk strategy |
|---|---|---|
| Enriched lecture transcripts | Configurable `transcriptSources[]` array in answers config; MVP defaults to existing Panopto output dir | Split on `[HH:MM:SS]` timestamp markers; ~200-400 token chunks; preserve start-seconds in chunk metadata |
| CDS course markdown | `<courseDir>/**/*.md` (excluding `node_modules`, `dist`, `.canvas-toolchain`) | Split on heading boundaries (`##`); ~300-500 token chunks; preserve relative path + heading path |
| Slide PDFs | `<courseDir>/slides/*.pdf` (and one-level subdirs for organization) | LiteParse extracts per-page; one chunk per PDF page; preserve page number for citation |
| Canonical FAQ | `<courseDir>/answers/canonical.md` | One chunk per `##` section |

**Slides input:** Faculty PDF-exports their PowerPoint (built-in in every modern PowerPoint, zero extra software) and drops the PDFs into `<courseDir>/slides/`. Auto-PPTX ingestion via LibreOffice/Docling is a deferred enhancement, not blocking MVP.

## Storage layout

`<courseDir>/.canvas-toolchain/answers-index/`:

```
chunks.sqlite          # SQLite with FTS5 virtual table on chunk text + metadata columns
vectors.sqlite         # vectors via sqlite-vec extension, same chunk_id as keyword table
index-meta.json        # embedding provider, dimension, lastIndexedAt, per-source-file mtimes
chunks/                # original chunk markdown + frontmatter for citation rendering
  <chunk_id>.md
```

`chunks.sqlite` schema:

```sql
CREATE VIRTUAL TABLE chunks USING fts5(
  content,                  -- the chunk text (searchable)
  source UNINDEXED,         -- 'transcript' | 'cds' | 'slide' | 'canonical'
  source_path UNINDEXED,    -- relative path within courseDir or transcriptSources entry
  source_ref UNINDEXED,     -- timestamp | heading path | page number | section heading
  deep_link UNINDEXED       -- pre-rendered citation URL (null for non-transcripts)
);

CREATE TABLE chunk_meta (
  chunk_id INTEGER PRIMARY KEY,  -- ROWID of FTS table
  source_file TEXT NOT NULL,
  source_mtime INTEGER NOT NULL  -- ms since epoch
);
```

`vectors.sqlite` schema (via sqlite-vec):

```sql
CREATE VIRTUAL TABLE vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[NNN]      -- dimension matches provider; recorded in index-meta.json
);
```

The two SQLite files are joinable by `chunk_id` at query time.

`index-meta.json`:

```json
{
  "courseId": 48894,
  "embeddingProvider": "ollama",
  "embeddingModel": "nomic-embed-text",
  "embeddingDimension": 768,
  "lastIndexedAt": "2026-06-04T22:30:00.000Z",
  "transcriptSources": ["/Users/kev/.curriculum-intelligence/panopto/48894"],
  "sourceFiles": {
    "<absolute path>": { "mtime": 1717550000000, "chunkCount": 14 }
  }
}
```

## MCP tool surface (4 new tools)

### 1. `setup_lecture_answers`

First-run configuration. Detects Ollama; prompts for B or C if absent.

```ts
input: {} | { provider?: 'ollama' | 'transformers-js' | 'voyage' }
output: {
  configured: boolean;
  provider: 'ollama' | 'transformers-js' | 'voyage';
  embeddingDimension: number;
  message?: string;
  fix?: string[];  // remediation steps if config failed
}
```

When called with no arguments and Ollama is detected → uses Ollama. When called with no arguments and Ollama is absent → returns `configured: false` with `fix` instructions guiding the user to either install Ollama or re-call with `provider: 'transformers-js' | 'voyage'`.

Writes `~/.command-and-control/lecture-answers-config.json`.

### 2. `index_course_for_answers`

Builds or incrementally updates the per-course index.

```ts
input: {
  courseId: number;
  courseDir: string;
  rebuild?: boolean;  // default false; true wipes index and starts fresh
  transcriptSources?: string[];  // override per-course config; rarely needed
}
output: {
  ok: boolean;
  filesScanned: number;
  filesIndexed: number;  // changed files actually re-embedded
  chunksTotal: number;
  chunksAdded: number;
  chunksRemoved: number;  // when source files deleted between runs
  durationMs: number;
  provider: 'ollama' | 'transformers-js' | 'voyage';
  warnings?: string[];
}
```

Behavior:
- If `rebuild: true` OR `index-meta.json` is absent OR provider in config differs from index-meta provider → full rebuild.
- Otherwise → incremental: for each source file, compare mtime to `sourceFiles[path].mtime` in index-meta. Re-embed only changed files; delete chunks for files removed since last index.
- Each chunk: insert into FTS5 table; embed text; insert into vec table; write original markdown to `chunks/<id>.md`.
- Update `index-meta.json` at end.

### 3. `ask_course`

The actual Q&A query. Auto-incremental re-indexes on every call (cheap, mtime-only check).

```ts
input: {
  courseId: number;
  courseDir: string;
  question: string;
  weekScope?: number;  // RESERVED for v1.1; ignored in MVP
  k?: number;          // top-K chunks to retrieve, default 8
}
output: {
  answer: string;
  citations: Array<{
    source: 'transcript' | 'cds' | 'slide' | 'canonical';
    sourcePath: string;
    sourceRef: string;     // e.g. "00:14:32" or "week-03/overview.md#assignments" or "slides/week-03.pdf p.7"
    deepLink?: string;     // full URL for transcripts; null otherwise
    snippet: string;       // ~200 chars of the cited chunk
    score: number;         // RRF-merged score, 0-1
  }>;
  retrievalMode: 'hybrid' | 'keyword-only';  // keyword-only if vector provider unavailable
  warnings?: string[];
  usage?: { inputTokens: number; outputTokens: number };  // LLM call cost
}
```

Behavior:
1. Auto-incremental re-index (calls into `index_course_for_answers` internally with `rebuild: false`).
2. FTS5 keyword search → top-K1 (K1 = k * 2).
3. Vector search → top-K2 (K2 = k * 2). Skipped if provider unavailable; warning emitted.
4. RRF merge → top-K chunks.
5. Canonical chunks get +0.3 score boost before RRF (tunable).
6. Build LLM prompt: instruction + chunks (with frontmatter showing source/ref) + question. Explicit instruction: "Answer using ONLY the provided context; cite the chunk numbers you used; if context doesn't contain the answer, say so."
7. Call Anthropic via `shared-llm`.
8. Parse LLM response, map cited chunk numbers back to citations array, return.

### 4. `reembed_course_index`

Convenience wrapper for switching embedding providers.

```ts
input: {
  courseId: number;
  courseDir: string;
  provider?: 'ollama' | 'transformers-js' | 'voyage';  // if absent, re-uses current
}
output: PruneSnapshotsResult shape, similar to index_course_for_answers but always rebuild: true
```

Calls `setup_lecture_answers` if provider differs, then `index_course_for_answers` with `rebuild: true`. Pure convenience — equivalent to calling those two manually.

## Setup flow (first time on a fresh machine)

```
1. setup_lecture_answers
   → auto-detects Ollama. If found, configured. If not, fix: install Ollama OR re-call with provider='transformers-js'|'voyage'.

2. index_course_for_answers { courseId: 48894, courseDir: "..." }
   → scans transcript sources + CDS markdown + slide PDFs + canonical.md
   → embeds and indexes
   → ~2 min for typical corpus (30 transcripts + 50 markdown files + 20 slide PDFs)

3. ask_course { courseId: 48894, courseDir: "...", question: "where did I introduce VLOOKUP?" }
   → returns answer + Panopto deep link to the lecture moment
```

## Query flow (subsequent use)

```
1. ask_course called
2. Auto-incremental re-index (mtime check; typically <1s if nothing changed, <5s if you edited canonical.md)
3. Hybrid retrieval (FTS5 + vec + RRF + canonical boost)
4. LLM answer generation
5. Return answer + citations
```

## Out of scope (explicit non-goals)

- ❌ Student-facing UI or API → AnswerBot
- ❌ Email ingestion → AnswerBot
- ❌ Office-hours Q&A capture → AnswerBot
- ❌ Per-student tracking / logging → AnswerBot
- ❌ Local LLM training / fine-tuning → AnswerBot (much later)
- ❌ Hand-rolled PDF/PPTX parser — use LiteParse
- ❌ Auto-PPTX ingestion (LibreOffice/Docling integration) — deferred enhancement
- ❌ Cross-course querying — v1.1 enhancement
- ❌ Week-scoping filter — v1.1 enhancement (parameter reserved)
- ❌ Real-time feedback ML loop (thumbs/active learning) → AnswerBot
- ❌ Multi-language transcripts — assumes English

## Future enhancements (planned, not blocking MVP)

- 🔮 Zoom downloader-adapter (`setup_zoom`, `bulk_fetch_zoom_transcripts`, `enrich_zoom_transcripts`)
- 🔮 TechSmith Relay downloader-adapter
- 🔮 Mediasite / Echo360 / Kaltura downloader-adapters
- 🔮 LibreOffice auto-PPTX ingestion via LiteParse pipeline
- 🔮 Docling auto-PPTX ingestion via docling-serve sidecar
- 🔮 Cross-course `ask_course { courseIds: [48894, 48895], ... }`
- 🔮 Week-scoping (`weekScope: 3` → bias retrieval against material from weeks > 3)

## Dependencies

**New npm deps:**
- `better-sqlite3` — synchronous SQLite client (check if already present in monorepo)
- `sqlite-vec` — vector ops extension for SQLite
- `@llamaindex/liteparse` — PDF parsing
- `@xenova/transformers` — embedding provider B (lazy-loaded only if user picks B)

**Existing monorepo deps reused:**
- `@anthropic-ai/sdk` via `@canvas-toolchain/shared-llm` — LLM call
- gray-matter or similar for markdown frontmatter (likely already present; verify)

**Runtime deps (external, optional):**
- Ollama daemon at `localhost:11434` — preferred embedding provider
- Voyage AI account + API key — fallback for cloud-only setups

**No new deps for MVP slides path:**
- LibreOffice is NOT required for MVP (only for future auto-PPTX enhancement).

## Open questions to settle during plan-writing

These don't change architecture; they're concrete tuning decisions:

1. **Chunk size + overlap.** Sensible defaults: transcripts 300 tokens / 50 overlap; CDS markdown 400 tokens / 50 overlap; slide PDFs one chunk per page. Document and allow tuning per-course later.
2. **RRF k-parameter.** Standard RRF uses k=60. Use that as default.
3. **Canonical boost magnitude.** Start at +0.3 added to canonical RRF score; tune from observation.
4. **LLM prompt template.** Concrete prompt with citation instructions — draft during plan, finalize during implementation.
5. **What happens when there are zero retrieval matches.** Probably: LLM is told "context contains no matches" and returns "I don't find anything in your lectures or course materials on that topic — try rephrasing or check if you covered it under a different name." Don't hallucinate.
6. **Embedding batch size.** Probably batches of 32 chunks for Ollama (HTTP overhead per call); 64 for transformers.js (in-process); 128 for Voyage (rate-limit-friendly).
7. **Auto-incremental performance.** mtime check should be <100ms even on hundreds of files; embedding any changed file should be the dominant time. Verify during implementation.

## Architecture decision records

### ADR-1: Hybrid keyword + semantic over pure vector RAG

The professor has spent months thinking about retrieval architecture and has strong conviction that hybrid is the only acceptable default. Pure vector RAG misses named-entity matches (course codes, function names, assignment IDs) that students and faculty actually use in queries. Context-stuffing wastes tokens and doesn't scale. Hybrid via FTS5 + sqlite-vec + RRF is the 2026 standard for technical content.

### ADR-2: Platform-agnostic from day one

Don't bake "Panopto" into the answers bot. MVP ships with Panopto via the existing ingestion pipeline (sub-project 2), but tool names, storage paths, config keys, and the transcript schema are all platform-neutral. Future adapters (Zoom, TechSmith Relay, etc.) plug in without touching the answers bot. See `feedback-pluggable-platforms.md`.

### ADR-3: Setup-time embedding fallback, not runtime fallback

Embedding vectors are dimension-locked to the provider that built them. "Runtime fallback" between providers isn't real — it would require silently re-embedding the entire corpus on every fallback event. The honest model is: at setup, pick a provider (auto-detected or user-chosen); the index is locked to that provider; if the provider becomes unavailable at query time, degrade to keyword-only retrieval rather than corrupt the vector math.

### ADR-4: Per-course indexes, no global state

Matches the rest of C&C's pattern. Cross-course querying is a v1.1 enhancement that merges per-course results at query time, not a re-architecture.

### ADR-5: Curated markdown FAQ as the self-improvement loop

For a faculty-only tool with ~1-10 queries per week per professor, ML-based feedback loops (thumbs/active learning) have no statistical power and add complexity for no benefit. Hand-curated `canonical.md` gives the professor a real markdown artifact he owns, that survives the bot, and that solves the same problem (canonical answers rank first) with zero ML. AnswerBot will revisit this when query volume from students justifies it.

## Spec self-review checklist

- [x] No "TBD" or "implement later" placeholders in core spec sections.
- [x] All ADRs explain WHY, not just WHAT.
- [x] Tool input/output schemas are concrete (TS interfaces).
- [x] Storage layout has concrete schema (SQL DDL).
- [x] Non-goals are explicit and link to where they actually belong (AnswerBot vs v1.1 vs deferred).
- [x] Dependencies enumerated with optionality flagged.
- [x] Open questions are scoped (tuning, not architecture).
- [x] Boundary with downstream app (AnswerBot) is explicit and crisp.
- [x] Platform-agnostic claim is supported by concrete schema + tool naming choices.

## Next step

Implementation plan via `superpowers:writing-plans` against this spec. The plan will break the work into bite-sized TDD tasks across:

1. Shared infrastructure (config file, storage layout, schema migrations)
2. Embedding provider abstractions (interface + 3 implementations + auto-detect)
3. Slide PDF ingestion (LiteParse adapter + chunking)
4. Transcript ingestion (schema validation + chunking + deep-link rendering)
5. CDS markdown ingestion (heading-based chunking)
6. Canonical FAQ ingestion + score boost
7. Hybrid retrieval (FTS5 + vec + RRF)
8. LLM call + citation parsing
9. Four MCP tool registrations
10. End-to-end integration tests + smoke test against a fixture corpus

Estimated scope: comparable to V&R Plan A (~10 commits over a focused session).
