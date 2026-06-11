# Bulk Panopto Transcript Download — Design Spec

**Date:** 2026-05-24
**Scope:** Sub-project 1 of 5 in the Panopto transcript pipeline. Covers folder-based bulk VTT download, `setup_panopto` configuration, and optional auto-ingest into Curriculum Intelligence.

---

## Overview

Professors can download all Panopto transcripts for a course folder in one command. The Panopto REST API is already partially implemented in `canvas-design-studio/src/tools/panopto.ts` (`listSessionsInFolder`, `bulkDownloadPanoptoCaptions`, OAuth2 client credentials flow). This spec adds:

1. A date-prefixed filename fix in the existing bulk downloader
2. A new `setup_panopto` C&C tool with its own config file
3. A new `bulk_fetch_panopto_transcripts` C&C workflow tool
4. MCP registration for both tools
5. Tests

**Out of scope:** Transcript enrichment (Week/Day/Date headers, deep links, filler word removal, vocabulary corrections) — those are Sub-project 2.

---

## Architecture

```
C&C: setup_panopto
  → writes ~/.command-and-control/panopto-config.json
  → validates credentials via getPanoptoToken()

C&C: bulk_fetch_panopto_transcripts
  → loads panopto-config.json
  → calls CDS: bulkDownloadPanoptoCaptions(folderId, outputDir)
      → listSessionsInFolder() [paginated]
      → per session: GET /sessions/{id}/captions → download VTT
      → write YYYY-MM-DD_sanitized-title.panopto.vtt
  → if courseId + semesterId: calls CI: ingestTranscripts()
  → returns BulkFetchPanoptoTranscriptsResult
```

Panopto API knowledge stays in CDS `panopto.ts`. C&C owns config lifecycle and pipeline orchestration. No new packages.

---

## File Map

| File | Change |
|---|---|
| `packages/canvas-design-studio/src/tools/panopto.ts` | Fix filename in `bulkDownloadPanoptoCaptions`: prepend `YYYY-MM-DD_` from `session.startTime` |
| `packages/command-and-control/src/tools/setup_panopto.ts` | New — read/write panopto-config.json, validate credentials |
| `packages/command-and-control/src/tools/workflows/bulk_fetch_panopto_transcripts.ts` | New — load config, call CDS bulk download, optional CI ingest |
| `packages/command-and-control/src/index.ts` | Register `setup_panopto` and `bulk_fetch_panopto_transcripts` |
| `packages/canvas-design-studio/tests/panopto.test.ts` | Add date-prefixed filename test |
| `packages/command-and-control/tests/setup_panopto.test.ts` | New |
| `packages/command-and-control/tests/bulk_fetch_panopto_transcripts.test.ts` | New |

---

## `setup_panopto` Tool

### Config file

Path: `~/.command-and-control/panopto-config.json`  
Env override: `CC_HOME` (same as `config.json`)

```ts
interface PanoptoSetupConfig {
  domain: string;                    // e.g. "example.hosted.panopto.com"
  clientId: string;
  clientSecret: string;
  iframeWhitelisted: boolean | null; // for embed use in CDS; null = unknown
  configuredAt: string;              // ISO timestamp
  lastValidatedAt: string;           // ISO timestamp, updated on each successful credential test
}
```

### Input schema

```ts
interface SetupPanoptoInput {
  domain: string;
  clientId: string;
  clientSecret: string;
  iframeWhitelisted?: boolean | null;
  test?: boolean;  // default: true — validate credentials before saving
}
```

### Behavior

- `test: true` (default): call `getPanoptoToken(config)` before saving. If the token fetch fails, return a `formatError` result and do NOT write the file.
- `test: false`: save without validation (for scripted/CI setup).
- On success: write `panopto-config.json`, return `{ configured: true, domain, validatedAt, message }`.
- `clientSecret` is written to disk as-is (same pattern as registry token in `config.json`). Never echoed back in tool output.

### `loadPanoptoConfig()` helper

Exported from `setup_panopto.ts`. Used by `bulk_fetch_panopto_transcripts`.

- If file absent or fields missing: throws a structured error using `formatError` with title `PANOPTO_NOT_CONFIGURED` and fix: "Run `setup_panopto` with your Panopto domain, clientId, and clientSecret."
- Never returns partial config — either fully valid or throws.

---

## `bulk_fetch_panopto_transcripts` Tool

### Input schema

```ts
interface BulkFetchPanoptoTranscriptsInput {
  folderId: string;       // Panopto folder ID (visible in folder URL)
  outputPath: string;     // absolute path — VTT files written here
  courseId?: string;      // if provided with semesterId, triggers auto-ingest
  semesterId?: string;
  copy?: boolean;         // passed through to ingestTranscripts (default: false)
}
```

### Execution flow

1. `loadPanoptoConfig()` — fail fast with `PANOPTO_NOT_CONFIGURED` if absent
2. Call `bulkDownloadPanoptoCaptions({ folderId, outputDir: outputPath }, panoptoConfig, onProgress)`
3. If `courseId` and `semesterId` both provided: call CI `ingestTranscripts({ courseId, semesterId, transcriptsPath: outputPath, source: 'panopto', copy })`
4. Return `BulkFetchPanoptoTranscriptsResult`

### Output shape

```ts
interface BulkFetchPanoptoTranscriptsResult {
  folderId: string;
  outputPath: string;
  downloaded: { sessionId: string; title: string; path: string }[];
  skippedNoCaptions: { sessionId: string; title: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  summary: {
    total: number;
    downloadedCount: number;
    skippedCount: number;
    failedCount: number;
  };
  ingestResult?: IngestTranscriptsResult;  // present only when courseId+semesterId provided
}
```

### Progress notifications

`onProgress` fires per session via the same MCP progress notification pattern as `download_canvas_archive`. When a `progressToken` is present in `_meta`, each event sends:

```
[3/16] Downloading: Week 03 - Tableau Intro
[3/16] ✓ Complete: Week 03 - Tableau Intro
[3/16] ✗ Failed: Week 03 - Tableau Intro — <reason>
```

Sessions with no captions are silently skipped (no progress event — they appear in `skippedNoCaptions` in the final result).

---

## Filename Fix (CDS `panopto.ts`)

Current (line 476):
```ts
const filename = `${sanitizeFilename(session.title)}.panopto.vtt`;
```

After fix:
```ts
const datePrefix = session.startTime.slice(0, 10); // "YYYY-MM-DD"
const filename = `${datePrefix}_${sanitizeFilename(session.title)}.panopto.vtt`;
```

Example: session titled `"Week 03: Tableau Intro"` recorded `2026-06-01T14:00:00Z` →
`2026-06-01_week-03-tableau-intro.panopto.vtt`

The `YYYY-MM-DD` prefix ensures files sort chronologically, and `ingest_transcripts`'s existing `detectDateHint` regex (`/(\d{4}-\d{2}-\d{2})/`) picks it up automatically.

---

## Error Handling

| Failure | Behavior |
|---|---|
| Config file absent | `loadPanoptoConfig()` throws `PANOPTO_NOT_CONFIGURED` with fix message pointing to `setup_panopto` |
| Credential test fails during `setup_panopto` | Return `formatError` result; do NOT write config file |
| OAuth2 token fetch fails during bulk download | Throw from `getPanoptoToken`; `bulk_fetch_panopto_transcripts` catches and wraps in `formatError` with fix: "Re-run `setup_panopto` with `test: true` to re-validate credentials" |
| Per-session VTT download fails | Caught per-session; pushed to `failed[]`; batch continues |
| All sessions fail | Returns result with empty `downloaded[]`; does not throw |
| No captions on session | Pushed to `skippedNoCaptions[]`; not treated as a failure |

**Token lifetime:** OAuth2 `client_credentials` tokens from Panopto are valid for ~1 hour. A single token is fetched at the start of `bulkDownloadPanoptoCaptions`. For a full 16-week semester folder (32 sessions), download completes well within that window — no mid-batch refresh needed.

---

## Tests

### CDS `panopto.test.ts` — new test in `bulkDownloadPanoptoCaptions` suite

- Mock a session with `startTime: '2026-06-01T14:00:00Z'`, `title: 'Week 03: Tableau Intro'`, `hasCaptions: true`
- Mock fetch: token response, captions list response, VTT content response
- Assert saved filename is `2026-06-01_week-03-tableau-intro.panopto.vtt`

### C&C `setup_panopto.test.ts`

- Saves config and returns `configured: true` when credentials validate (mock fetch returning token)
- Does NOT save config and returns error when credential test fails (mock fetch returning 401)
- `loadPanoptoConfig()` throws `PANOPTO_NOT_CONFIGURED` when file absent
- `test: false` saves without calling fetch at all
- `clientSecret` does not appear in tool return value

### C&C `bulk_fetch_panopto_transcripts.test.ts`

- Returns `PANOPTO_NOT_CONFIGURED` error result when config file absent (no fetch calls made)
- 4-session folder: 2 download, 1 skipped (no captions), 1 failed — all four buckets correct in result
- Without `courseId`/`semesterId`: `ingestResult` is absent from result
- With `courseId` + `semesterId`: `ingestResult` is present and matches CI `ingestTranscripts` return shape
- Progress callback fires `session-start` and `session-complete` for downloaded sessions, `session-failed` for failed

---

## What This Enables

After this sub-project ships:
- Professor runs `setup_panopto` once per institution setup
- Each semester: `bulk_fetch_panopto_transcripts` with their course folder ID downloads all VTTs and optionally ingests them into CI
- CI's existing `map_transcripts_to_weeks`, `extract_lecture_topics`, `build_quote_bank` tools immediately have access to the new transcripts
- Sub-project 2 (enrichment: Week/Day headers, deep links, filler word removal, KOBE→COBE) reads from the same VTT files
