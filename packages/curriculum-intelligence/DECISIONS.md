# Architecture & Implementation Decisions

This file records decisions made during design and implementation that are not obvious from the code alone. For the high-level design rationale, see [`docs/superpowers/specs/2026-05-17-curriculum-intelligence-design.md`](docs/superpowers/specs/2026-05-17-curriculum-intelligence-design.md).

---

## Toolchain position

**Decision:** Curriculum Intelligence sits between Canvas Downloader (data acquisition) and Canvas Design Studio (production/publish). It owns the *analysis and planning* layer — not the download, not the visual output.

**Why:** Each app has a single job. Canvas Downloader is better placed to own bulk Panopto transcript retrieval and Canvas export packaging. Canvas Design Studio is better placed to own page layout and theming. Curriculum Intelligence owns "what should the course contain and how stale is each piece."

---

## Transcript source tagging

**Decision:** Transcripts are tagged `source = panopto | whisper | unknown` at ingest time, derived from filename conventions (`.panopto.vtt`, `.whisper.srt`). An explicit `source` override is available on `ingest_transcripts`.

**Why:** Panopto-native captions and Whisper-generated captions have different quality characteristics. Tagging them at ingest lets downstream tools (and human reviewers) weight or compare them separately without re-parsing filenames everywhere.

---

## Week mapping strategy

**Decision:** `map_transcripts_to_weeks` uses filename heuristics first (`wk03`, `week-3`, `Week 01`), then ISO date hints from filenames, then optionally a term-start date for arithmetic. It writes `week-map.json` which all transcript tools read.

**Why:** Separating the mapping step lets you fix mismatches (by renaming files or editing week-map.json) without re-ingesting transcripts. Tools that need week numbers all read the same authoritative map.

---

## Off-syllabus detection approach

**Decision:** `find_off_syllabus_topics` uses token-set difference: tokenize the lecture's full text, tokenize all Canvas page text for that week's module, return tokens present in lecture but absent from pages. No LLM call on the server side.

**Why:** This is a pure data operation — Claude (on the client side) is better placed to interpret *why* a token cluster is off-syllabus. The server's job is to put the evidence in front of Claude efficiently. Token-set diff is fast, deterministic, and requires no API key.

---

## Quote bank trigger patterns

**Decision:** `build_quote_bank` matches a small list of deliberate-point trigger phrases (`the key idea`, `in summary`, `always/never do`, etc.) against each transcript cue. Cues under 60 chars are skipped regardless of trigger match.

**Why:** These phrases are reliable signals that a speaker is making a memorable, quotable point rather than transitioning or hedging. The 60-char floor filters out fragments and timestamps. The pattern list is short on purpose — it's meant to be a quick scan, not exhaustive NLP.

**Markdown fallback:** For `.md` transcripts (which have one big cue, not time-coded segments), the tool falls back to the first sentence in the full text that meets the minimum length. This handles transcripts where the heading or opening sentence is short but the rest of the paragraph is substantive.

---

## RSS/Atom parsing library

**Decision:** Uses `fast-xml-parser` (zero dependencies, ~150KB). Added as a production dependency.

**Why:** Writing a robust RSS 2.0 + Atom parser with regex is fragile — edge cases around CDATA, namespaced elements, and `<link>` attribute variants (RSS vs Atom) cause silent data loss. `fast-xml-parser` handles all common variants reliably.

---

## Web search in `scan_recent_developments`

**Decision:** The `AnthropicAdapter` does *not* currently pass a web-search tool to the API. The `webSearch: true` option in `LlmOpts` is defined but is a no-op in v0.6.

**Why:** The `web_search_20250305` beta tool was not available in `@anthropic-ai/sdk` v0.36 at build time. The prompt already asks Claude to reason from training data about recent developments, which is useful for topic areas where training data is rich. Web search support can be added in a point release once the SDK surfaces a stable binding.

---

## LlmClient seam

**Decision:** All LLM calls flow through a single `LlmClient` interface (`src/llm/client.ts`). `AnthropicAdapter` is the default. `OllamaAdapter` (added v1.1.0) enables local model use via `OLLAMA_BASE_URL` + `OLLAMA_MODEL` env vars. The MCP server selects the adapter via `getLlmClient()` in `src/index.ts`. A model routing harness is reserved for the Command & Control app.

**Why:** Courses taught by technically-inclined professors may want to use locally hosted models (cost, privacy, offline use). The seam costs nothing now and avoids reworking every tool that calls an LLM later.

---

## Currency classification rules

**Decision:** `score_topic_currency` uses these thresholds:
- `newsHits >= 3` → **current** (active news signal dominates)
- `newsHits === 0` AND `semestersSince >= 6` (~3 years) → **dated**
- `newsHits >= 1` → **current**
- otherwise → **evergreen**

**Semester arithmetic:** `Spring → 0`, `Summer → 1`, `Fall → 2` within each year. `semestersBetween("Spring2022", "Spring2025") = 9`.

**Why:** 3 news hits is a signal that the topic is actively evolving. 3 years with no news is a signal that the topic has stabilized or lost relevance. The evergreen class catches foundational topics that don't need news hits to stay valuable.

---

## Verdict rules

**Decision:** `recommend_for_topic` verdicts:
- `lastTaughtSemesterId === null` → **ADD** (never covered)
- `dated` AND `newsHits === 0` → **DROP**
- `evergreen` AND `semestersSince <= 4` → **KEEP**
- `current` AND `semestersSince <= 1` AND `newsHits <= 3` → **KEEP**
- otherwise → **UPDATE**

**Why:** The rules are intentionally conservative with DROP — a topic needs both a dated classification *and* zero news signal to get dropped. A professor should always have the final say; the verdict is a starting point for conversation with Claude, not an automated action.

---

## generate_ideas_file placement

**Decision:** `generate_ideas_file` writes to `courses/<courseId>/ideas.md`, not under a semester folder.

**Why:** The ideas captured are about the app and the course overall, not a single semester's data. They persist across semesters and inform the next round of development.

---

## Fourth app (future): Command & Control

**Decision:** Orchestration, model routing, easy/advanced mode switching, and "agent as hands" coordination are explicitly *not* built into Curriculum Intelligence. They are deferred to a planned fourth app.

**Why:** Each of the three domain apps (Canvas Downloader, Curriculum Intelligence, Canvas Design Studio) must be installable and usable independently — a professor shouldn't need the full stack to run one tool. The Command & Control app would require the others to be installed alongside it. Building orchestration into Curriculum Intelligence would create a dependency inversion and make the standalone use case harder.

## Command & Control integration hardening

**Decision:** Command & Control now imports `curriculum-intelligence-mcp` and `canvas-design-mcp` directly, but reaches Canvas Backup through its existing Python CLI instead of waiting for or inventing a `canvas-downloader-mcp` npm package.

**Why:** Curriculum Intelligence and Canvas Design Studio are already tested TypeScript MCP packages, so direct imports keep the coordinator simple. Canvas Backup is the runtime outlier, but it already has a working CLI, local-first archive format, setup scripts, and professor-facing launchers. A narrow CLI bridge gets the integrated workflow working without a risky rewrite.

**Verification:** The fixture smoke in `D:\Dev\Command-and-Control-MCP` analyzes a Canvas Backup archive fixture, imports it through Canvas Design Studio, and generates Canvas-safe HTML. The hardening pass verified C&C tests/build/smoke, Curriculum Intelligence tests/build, Canvas Design Studio tests/build, and Canvas Backup tests.

**Follow-up:** Go remains a candidate for a single installer/launcher or a future Canvas Backup rewrite if Python packaging becomes the bottleneck. It is not the current target for rewriting the full MCP stack.

## Architecture review follow-ups

**Decision:** Accept the Gemini/Antigravity review concerns as backlog items, but keep the current verified architecture in place until each item has a focused design.

**Why:** The review identified real long-term risks: Python packaging friction, silent long-running downloads, destructive CI metadata stripping, lack of live web search, and overly mechanical currency scoring. None of these invalidates the current working integration, but each is worth tracking before broad professor adoption.

**Curriculum Intelligence ownership:**

- Design a non-destructive planning metadata path before changing `export_course_folder`. Candidate approaches are a namespaced `ci:` front matter block or a `planning-manifest.json` sidecar in the exported course folder.
- Add live web search as an optional input to `scan_recent_developments`; keep offline/basic workflows usable.
- Add semantic relevance scoring as an optional second stage after keyword/RSS collection.
- Allow course config to declare evergreen core topics that bypass or soften news-hit scoring.

---

## Easy mode vs. advanced mode

**Decision:** Mode distinctions (easy = mostly automated, advanced = locally-hosted LLMs + more control) belong in the Command & Control layer, not in individual tools.

**Why:** Curriculum Intelligence tools are stateless data processors. They don't know whether they're being called by a non-technical professor through an easy-mode UI or by a power user with a local Ollama instance. The `LlmClient` seam already supports swapping adapters; the Command & Control app is the right place to make that choice based on user preference.

---

## Course folder naming

**Decision:** Course IDs are short alphanumeric strings (letters, digits, dot, dash, underscore). Example: `ITM370`. Section numbers are included for courses with multiple sections (`ITM105-01`) but omitted for single-section courses (`ITM370`).

**Why:** Kevin teaches ITM 370 (single section), ITM 105, and ITM 310. ITM 370 was first offered ~2023 — don't assume older semesters exist for it. The folder naming mirrors how Kevin already organizes his course materials.

---

## Non-destructive CI metadata in export_course_folder

**Decision:** Use a `planning-manifest.json` sidecar, not a `ci:` YAML namespace, to preserve CI analysis fields during export.

**Why:** The `ci:` namespace approach (prefixing fields like `verdict` → `ci_verdict` in YAML) keeps everything in one file but risks future Design Studio versions partially processing unknown YAML keys in unexpected ways. A separate `planning-manifest.json` at the root of the exported course folder is fully invisible to Design Studio, human-readable JSON, and can hold richer structured data (e.g., `newsHits` arrays) that would be awkward in YAML front matter.

**Behavior:** `exportCourseFolder({ ..., preserveCiMetadata: true })` strips CI fields from all YAML files as usual (maintaining Design Studio compatibility), then writes a `planning-manifest.json` sidecar keyed by relative brief path (`week-01/assignment.md`) with the original CI analysis data. Default is `preserveCiMetadata: false` — existing callers are unaffected.

**Re-import path (future):** When a brief is re-imported into CI after Design Studio editing, merge the sidecar's analysis data back onto the brief. The `planning-manifest.json` is the source of truth for what CI knew at export time.

---

## Two-stage semantic verification in score_topic_currency

**Decision:** `score_topic_currency` keeps the existing arithmetic scoring as stage 1 and adds an optional stage 2 semantic verification pass when callers provide `semanticVerify: true`, headline-style `newsHits`, and an injected `llmClient`.

**Why:** The original thresholds are deterministic and cheap, but raw news-hit counts can be noisy. Common topics can match unrelated headlines, while narrow current topics can be undercounted. The semantic pass asks whether the collected headlines are actually relevant to teaching the topic in a university AI or technology course, then returns `semanticRelevanceVerified` and `semanticRationale` alongside the existing result.

**Graceful degradation:** Stage 2 is never required. If `semanticVerify` is false, no LLM client is supplied, no headline objects are supplied, or the LLM call throws, the tool silently returns the stage 1 arithmetic result. Existing callers that pass numeric `newsHits` are unaffected.

**Boundary:** The arithmetic classification rules are unchanged. The semantic fields are advisory signals for downstream review and future workflow decisions, not replacements for `currencyClass`.

---

## Live web search for scan_recent_developments

**Decision:** Pluggable `SearchClient` interface with `BraveSearchAdapter`. Search results are injected as context into the LLM prompt before the LLM call.

**Why:** Keeping the search provider separate from the LLM adapter means `scan_recent_developments` works with any `LlmClient` (Anthropic or Ollama) and degrades gracefully when no API key is configured. The `LlmOpts.webSearch` flag is kept as a caller hint but adapters do not act on it — the search layer runs outside of the LLM adapter entirely.

**Offline fallback:** When `BRAVE_SEARCH_API_KEY` is not set, `getSearchClient()` in `index.ts` returns `undefined`, `searchClient` is omitted from the call, and `scanRecentDevelopments` uses LLM-only responses exactly as before. `searchResultCount: 0` in the result signals which mode was used.

**Search failure handling:** If `SearchClient.search()` throws (network error, rate limit, etc.), the error is logged to stderr and the tool continues with an empty snippet list. The LLM call still runs. This keeps the tool usable in flaky network environments.

**Configuration:** Set `BRAVE_SEARCH_API_KEY` env var. Free tier covers 2,000 queries/month — more than enough for curriculum planning use. The adapter maps the `since` date to Brave's `freshness` buckets (`pw`/`pm`/`py`), or omits it for queries older than a year.

**Prompt injection:** When snippets are available, they are formatted as a numbered list before the main instruction. The LLM synthesizes them with its own knowledge to produce the structured `developments` output.
