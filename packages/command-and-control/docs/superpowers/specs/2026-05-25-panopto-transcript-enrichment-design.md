# Panopto Transcript Enrichment — Design Spec

**Date:** 2026-05-25
**Scope:** Sub-project 2 of 5 in the Panopto transcript pipeline. Covers enriched markdown generation from downloaded VTT files: Week/Day/Date headers, Panopto deep links every 5 minutes, filler word removal, and vocabulary correction.

---

## Overview

After `bulk_fetch_panopto_transcripts` downloads raw VTT files, professors can run `enrich_panopto_transcripts` to produce a cleaned, human-readable `.enriched.md` alongside each VTT. The raw VTT is preserved unchanged for CI consumption; the enriched markdown is for professor use (reading, sharing, lecture navigation).

**Out of scope:** Whisper transcript comparison, answers bot, local LLM — those are Sub-projects 3–5.

---

## Architecture

```
C&C: setup_panopto_vocab
  → reads/writes ~/.command-and-control/panopto-vocab.json
  → actions: add-correction, add-filler, remove-correction, list

C&C: enrich_panopto_transcripts
  → reads _sessions.json from transcriptsPath
  → loads panopto-vocab.json (optional — absent = built-in defaults only)
  → calls CDS: enrichVttFile() per session
      → parses VTT with CI VTT parser
      → strips filler words (built-in list + vocab.fillerWords)
      → applies vocab corrections (vocab.corrections)
      → groups cues into 5-minute buckets
      → renders markdown with header + prose + [→ MM:SS](deep link) every 300s
  → writes YYYY-MM-DD_title.enriched.md alongside VTT
  → returns EnrichPanoptoTranscriptsResult

CDS: panopto.ts (small addition)
  → bulkDownloadPanoptoCaptions writes _sessions.json manifest on completion
```

Panopto domain logic stays in CDS. C&C owns config lifecycle and orchestration. No new packages.

---

## File Map

| File | Change |
|---|---|
| `packages/canvas-design-studio/src/tools/panopto.ts` | Write `_sessions.json` manifest at end of `bulkDownloadPanoptoCaptions` |
| `packages/canvas-design-studio/src/tools/panopto-enrich.ts` | New — `enrichVtt`, `enrichVttFile`, `BUILTIN_FILLER_WORDS` |
| `packages/canvas-design-studio/tests/panopto-enrich.test.ts` | New |
| `packages/command-and-control/src/tools/setup_panopto_vocab.ts` | New — load/save `panopto-vocab.json`, `loadPanoptoVocab` helper |
| `packages/command-and-control/tests/tools/setup_panopto_vocab.test.ts` | New |
| `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts` | New |
| `packages/command-and-control/tests/tools/workflows/enrich_panopto_transcripts.test.ts` | New |
| `packages/command-and-control/src/index.ts` | Register `setup_panopto_vocab` and `enrich_panopto_transcripts` |

---

## Data Formats

### `_sessions.json` manifest

Written to `outputDir` by `bulkDownloadPanoptoCaptions` after all downloads complete:

```json
{
  "domain": "example.hosted.panopto.com",
  "generatedAt": "2026-06-01T20:00:00Z",
  "sessions": [
    {
      "sessionId": "a1b2c3d4-0000-0000-0000-000000000001",
      "title": "Week 03: Tableau Intro",
      "startTime": "2026-06-01T14:00:00Z",
      "duration": 3600,
      "filename": "2026-06-01_week-03-tableau-intro.panopto.vtt"
    }
  ]
}
```

Only sessions in `downloaded[]` are included (skipped and failed sessions are excluded).

### `panopto-vocab.json`

Path: `~/.command-and-control/panopto-vocab.json`
Env override: `CC_HOME` (same pattern as `config.json`)

```json
{
  "fillerWords": ["uh", "um", "umm", "you know", "like", "right", "uh-huh"],
  "corrections": [
    { "from": "KOBE", "to": "COBE" },
    { "from": "kobe", "to": "COBE" }
  ]
}
```

`fillerWords` in this file are **merged** with the built-in list (not replacing it). `corrections` are applied in order, case-sensitive find-and-replace, after filler removal.

### Enriched markdown output

Filename: `YYYY-MM-DD_sanitized-title.enriched.md` (alongside the `.panopto.vtt`)

```markdown
# Week 03: Tableau Intro
**Date:** Monday, June 1, 2026 | **Duration:** 1:00:00

---

Hello students. Welcome to Tableau. Today we'll cover data connections
and basic visualization types...

> The reason we use Tableau over Excel is that it handles millions of rows
> without slowing down your machine.

> I want you to remember: always connect to a live data source rather than
> an extract when you are in development.

[→ 5:00](https://example.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=a1b2c3d4-...&start=300)

Next, let's look at data sources. You can connect to Excel, CSV...

[→ 10:00](https://example.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=a1b2c3d4-...&start=600)
```

- Deep link every 300 seconds (5 minutes), placed as a line break between prose blocks
- Final block has no trailing link
- Filler words stripped; vocab corrections applied; multiple spaces collapsed
- Cues matching **key-statement triggers** are rendered as blockquotes (`> `) inline within their bucket, immediately after the cue text would appear in the prose flow
- Raw `.panopto.vtt` is never modified

**Key-statement triggers** (case-insensitive, checked against the cleaned cue text):

| Trigger pattern | Category |
|---|---|
| `the reason`, `the reason is`, `that's why`, `because of this` | Causal |
| `i want you to remember`, `don't forget`, `remember that`, `keep in mind` | Emphasis |
| `in summary`, `to summarize`, `the key point`, `the key idea`, `the main idea` | Summary |
| `is defined as`, `means that`, `what we mean by` | Definition |
| `make sure`, `you need to`, `you must`, `always`, `never` | Imperative |

A cue matches if its cleaned text contains any trigger phrase. Matched cues are formatted as blockquotes; unmatched cues are appended to the running prose paragraph. A single cue can only match one category (first match wins).

---

## `_sessions.json` Manifest — `panopto.ts` Addition

At the end of `bulkDownloadPanoptoCaptions`, after the per-session download loop:

```ts
const manifest = {
  domain: config.domain,
  generatedAt: new Date().toISOString(),
  sessions: result.downloaded.map((d) => ({
    sessionId: d.sessionId,
    title: d.title,
    startTime: d.startTime,
    duration: d.duration,
    filename: basename(d.path),
  })),
};
writeFileSync(join(input.outputDir, '_sessions.json'), JSON.stringify(manifest, null, 2), 'utf-8');
```

`BulkDownloadResult.downloaded[]` entries gain `startTime: string` and `duration: number` fields (already available on the `PanoptoSession` object during the download loop). The `BulkDownloadResult` interface in `panopto.ts` must be updated to include these two fields, and the download loop must populate them when building the result.

---

## `panopto-enrich.ts` — CDS Module

### Exports

```ts
export const BUILTIN_FILLER_WORDS: string[];

export interface EnrichVttOptions {
  fillerWords: string[];      // merged: built-in + vocab.fillerWords
  corrections: { from: string; to: string }[];
  domain: string;
}

export interface SessionManifestEntry {
  sessionId: string;
  title: string;
  startTime: string;
  duration: number;
  filename: string;
}

export interface SessionsManifest {
  domain: string;
  generatedAt: string;
  sessions: SessionManifestEntry[];
}

export function enrichVtt(
  vttContent: string,
  session: SessionManifestEntry,
  options: EnrichVttOptions,
): string;  // returns enriched markdown string

export function enrichVttFile(
  vttPath: string,
  session: SessionManifestEntry,
  options: EnrichVttOptions,
): string;  // reads file, calls enrichVtt, returns markdown string
```

### `enrichVtt` algorithm

1. Parse VTT into `TranscriptCue[]` using `parseVtt` from `curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js`
2. Build filler regex: `new RegExp('\\b(' + fillerWords.join('|') + ')\\b[,]?', 'gi')`
3. For each cue: apply filler regex (replace with ''), apply each correction (`replaceAll`), collapse multiple spaces, trim
4. Classify each cleaned cue: if its text matches any key-statement trigger pattern (case-insensitive), mark it `isKeyStatement: true` (first match wins)
5. Group cues into 5-minute buckets by `Math.floor(cue.startSec / 300)`
6. Render header:
   ```
   # {title}
   **Date:** {weekday, Month D, YYYY} | **Duration:** {H:MM:SS}
   
   ---
   ```
   Date formatted from `session.startTime` using `Intl.DateTimeFormat` (UTC, `{ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }`)
   Duration formatted as `H:MM:SS` or `MM:SS` from `session.duration`
7. For each bucket: render cues in order — plain cues are joined into a prose paragraph; `isKeyStatement` cues are rendered as individual blockquotes (`> {text}`) inserted inline at their position. Append (if not the last bucket) a blank line + `[→ MM:SS](viewerUrl?start=SECONDS)` where `MM:SS` = `Math.floor(bucket * 300 / 60):padded seconds`, URL = `https://{domain}/Panopto/Pages/Viewer.aspx?id={sessionId}&start={bucket * 300}`
8. Return joined markdown string

---

## `setup_panopto_vocab` Tool — C&C

### `panopto-vocab.json` path

```ts
join(getCcHomePath(), 'panopto-vocab.json')
```

### `loadPanoptoVocab()` helper

Exported from `setup_panopto_vocab.ts`. Used by `enrich_panopto_transcripts`.

- If file absent: returns `{ fillerWords: [], corrections: [] }` — no error, vocab is optional
- If file corrupt: throws `{ error: 'VOCAB_CORRUPT', fix: ['Delete panopto-vocab.json and re-run setup_panopto_vocab'] }`
- Returns the parsed file content as-is (caller merges with built-in list)

### Input schema

```ts
interface SetupPanoptoVocabInput {
  action: 'add-correction' | 'add-filler' | 'remove-correction' | 'list';
  from?: string;   // required for add-correction, remove-correction
  to?: string;     // required for add-correction
  word?: string;   // required for add-filler
}
```

### Behavior

- `list`: return current vocab file (or empty defaults if absent)
- `add-correction`: append `{ from, to }` to `corrections[]` (skip if exact duplicate)
- `add-filler`: append `word` to `fillerWords[]` (skip if already present)
- `remove-correction`: remove entry where `from` matches
- All write actions: atomic write (tmp + rename, mode 0o600), same pattern as `setup_panopto`

---

## `enrich_panopto_transcripts` Tool — C&C

### Input schema

```ts
interface EnrichPanoptoTranscriptsInput {
  transcriptsPath: string;  // folder that bulk_fetch wrote to
}
```

### Execution flow

1. Read `_sessions.json` from `transcriptsPath` — fail fast with `MANIFEST_NOT_FOUND` if absent
2. Load `loadPanoptoConfig()` to get `domain` — fail fast with `PANOPTO_NOT_CONFIGURED` if absent
3. Load `loadPanoptoVocab()` to get user vocab (absent = empty, not an error)
4. Merge: `allFillerWords = [...BUILTIN_FILLER_WORDS, ...vocab.fillerWords]`
5. For each session in `manifest.sessions`:
   - Resolve VTT path: `join(transcriptsPath, session.filename)`
   - If VTT missing: push to `failed[]`, continue
   - Call `enrichVttFile(vttPath, session, { fillerWords: allFillerWords, corrections: vocab.corrections, domain })`
   - Write `.enriched.md` (replace `.panopto.vtt` suffix with `.enriched.md`)
   - Push to `enriched[]`
6. Return `EnrichPanoptoTranscriptsResult`

### Output shape

```ts
interface EnrichPanoptoTranscriptsResult {
  transcriptsPath: string;
  enriched: { sessionId: string; title: string; mdPath: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  summary: { total: number; enrichedCount: number; failedCount: number };
  error?: string;
  message?: string;
  fix?: string[];
}
```

---

## Error Handling

| Failure | Behavior |
|---|---|
| `_sessions.json` absent | Return `{ error: 'MANIFEST_NOT_FOUND', fix: ['Run bulk_fetch_panopto_transcripts first'] }` |
| `panopto-config.json` absent | Return `{ error: 'PANOPTO_NOT_CONFIGURED', fix: ['Run setup_panopto first'] }` |
| `panopto-vocab.json` absent | Use built-in fillers + empty corrections; no error |
| `panopto-vocab.json` corrupt | Return `{ error: 'VOCAB_CORRUPT', fix: ['Delete panopto-vocab.json and re-run setup_panopto_vocab'] }` |
| VTT file missing on disk | Pushed to `failed[]`; batch continues |
| VTT parse error | Caught per-file; pushed to `failed[]` with reason; batch continues |
| All sessions fail | Returns result with empty `enriched[]`; does not throw |

---

## Tests

### CDS `panopto-enrich.test.ts`

- `enrichVtt` strips built-in filler words (uh, um, etc.) from cue text
- `enrichVtt` applies vocab corrections (KOBE → COBE)
- `enrichVtt` does not modify built-in filler list when user list is empty
- `enrichVtt` injects `[→ 5:00]` link after the first 300-second bucket
- `enrichVtt` does NOT inject trailing link after the last bucket
- `enrichVtt` link URL contains `?id={sessionId}&start=300`
- `enrichVtt` header contains title, formatted date, and duration
- `enrichVtt` renders a key-statement cue as a blockquote (`> text`) rather than inline prose
- `enrichVtt` non-matching cues are joined as prose; matching cues are blockquoted at their position within the bucket
- `enrichVtt` on empty cues array returns header-only markdown without errors
- `panopto.ts` `bulkDownloadPanoptoCaptions` writes `_sessions.json` with correct shape

### C&C `setup_panopto_vocab.test.ts`

- `list` returns empty defaults when file absent
- `add-correction` writes correct entry to file
- `add-correction` skips duplicate `from` entries
- `add-filler` appends word to fillerWords
- `add-filler` skips duplicate words
- `remove-correction` removes matching entry
- `loadPanoptoVocab` returns empty defaults when file absent
- `loadPanoptoVocab` throws `VOCAB_CORRUPT` on malformed JSON

### C&C `enrich_panopto_transcripts.test.ts`

- Returns `MANIFEST_NOT_FOUND` when `_sessions.json` absent (no file I/O attempted)
- Returns `PANOPTO_NOT_CONFIGURED` when panopto config absent
- 3-session folder: 2 enrich successfully, 1 fails (missing VTT) — all buckets correct
- `panopto-vocab.json` absent: enrichment succeeds using built-in fillers only
- `.enriched.md` is written alongside `.panopto.vtt` with correct filename
