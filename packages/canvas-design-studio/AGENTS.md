# Canvas Design Studio — Agent Handoff Guide

Read this before touching anything in this package. Design-system and Canvas-HTML guidance lives in `CLAUDE.md`; this file covers architecture and the Panopto enrichment module.

---

## What this project is

**Canvas Design Studio** (`canvas-design-mcp`) is an MCP server that generates, previews, and manages Canvas LMS HTML pages. It is imported as a local npm dependency by Command & Control; it is also usable standalone.

**Stack:** Node.js 18+, TypeScript ESM, `@modelcontextprotocol/sdk`, `curriculum-intelligence-mcp` (local file dep for VTT parsing).

**Run tests:** `npm test`
**Build:** `npm run build`

---

## Repository layout

```
src/
  index.ts                  ← MCP server entry; all tool registrations
  tools/
    panopto.ts              ← Panopto session listing + bulk VTT download + _sessions.json manifest
    panopto-enrich.ts       ← VTT enrichment algorithm (filler removal, corrections, deep links)
    setup-course.ts         ← course folder scaffolding
    generate-course.ts      ← course folder → Canvas-safe HTML
    import-course.ts        ← Canvas Backup archive → course folder
    ...
tests/
  panopto-bulk.test.ts      ← bulk download + manifest tests
  panopto-enrich.test.ts    ← enrichment algorithm unit tests
  ...
```

---

## Panopto enrichment module (`src/tools/panopto-enrich.ts`)

This module is the enrichment engine for the Panopto transcript pipeline. It lives in CDS (not C&C) because it depends on `curriculum-intelligence-mcp`'s VTT parser and produces markdown content — both are design/content concerns, not workflow concerns.

### Exports

| Export | Purpose |
|--------|---------|
| `BUILTIN_FILLER_WORDS` | Default filler list; exported so callers can spread it with professor additions without mutating the constant |
| `enrichVtt(vttContent, session, options)` | Core algorithm; takes raw VTT string, returns enriched markdown string |
| `enrichVttFile(vttPath, session, options)` | Thin wrapper: `readFileSync` + `enrichVtt` |
| `EnrichVttOptions` | `{ fillerWords, corrections, domain }` |
| `SessionManifestEntry` | Single session shape from `_sessions.json` |
| `SessionsManifest` | Full `_sessions.json` shape (read by C&C's `enrich_panopto_transcripts`) |

`KEY_STATEMENT_TRIGGERS` is intentionally **not exported**. Professors customize output via `setup_panopto_vocab` corrections; trigger-list extension is future scope.

### `enrichVtt` algorithm

```
1. parseVtt(vttContent)             → TranscriptCue[] { startSec, endSec, text }
2. Strip filler words               → regex \b(word|...)\b[,]? (gi)
3. Apply corrections                → text.replaceAll(from, to) for each correction
4. Collapse multiple spaces         → text.replace(/  +/g, ' ').trim()
5. Classify key statements          → KEY_STATEMENT_TRIGGERS.some(t => lower.includes(t))
6. Bucket by Math.floor(startSec / 300)  → 5-minute windows
7. Render header                    → # Title + Date (Intl UTC) + Duration
8. Render each bucket               → prose flush before blockquotes; blockquotes for key statements
9. Deep link after each non-last bucket → [→ MM:SS](https://{domain}/Panopto/...?id=...&start=N)
```

### Design decisions with reasoning

**Filler regex uses `\b` word boundaries + `[,]?`**
Word boundaries correctly match multi-word fillers like "you know" without eating adjacent words. The `[,]?` suffix eats any trailing comma that would otherwise be stranded as leading punctuation after the filler is removed — e.g. `"So, the point is"` → `"the point is"` instead of `", the point is"`.

**Empty-list guard before regex compile**
`options.fillerWords.length > 0` check before building the regex prevents compiling `\b()\b` when the list is empty, which would throw a runtime error.

**Corrections use `replaceAll`, not regex**
Corrections are literal acronym/name fixes (e.g. KOBE→COBE). Using `replaceAll` avoids requiring callers to escape regex metacharacters in their correction strings.

**5-minute bucket granularity**
Panopto's viewer URL accepts `&start=<seconds>`. Five minutes is the coarsest useful granularity for lecture navigation — fine enough to jump into a topic, coarse enough that the link count doesn't overwhelm the document.

**Deep link points to the start of the *next* bucket, not the current one**
The link at the bottom of a bucket lets readers jump to where the *next* section starts — a forward-navigation aid rather than a back-reference to the section they're already reading.

**UTC timezone in `Intl.DateTimeFormat`**
`session.startTime` is an ISO UTC string from the Panopto API. Rendering it in local timezone would shift the displayed date for professors in non-UTC zones (e.g. MDT is UTC-6, so a 1:00 AM UTC recording would show the previous date locally).

**`Math.floor(seconds)` in `formatDuration`**
The Panopto API returns `duration` as a float (e.g. `3600.47`). `Math.floor` prevents `"1:00:00.47"` in the rendered header.

---

## Test isolation pattern

```typescript
beforeEach(() => {
  vi.mock('curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js', () => ({
    parseVtt: vi.fn(),
  }));
});
```

`panopto-enrich.test.ts` mocks `parseVtt` so tests control cue input directly. `panopto-bulk.test.ts` mocks `node:fs` to avoid real disk I/O.

---

## Adding a new enrichment feature

1. Add the logic to `enrichVtt` in `src/tools/panopto-enrich.ts`.
2. Add corresponding options to `EnrichVttOptions` if it needs professor configuration.
3. If professor-configurable, add the backing field to `PanoptoVocab` in C&C's `setup_panopto_vocab.ts` and merge it in `enrich_panopto_transcripts.ts`.
4. Write tests in `tests/panopto-enrich.test.ts` before implementation (TDD).
5. Run `npm run build` after changes — C&C imports from `dist/`, not `src/`.
