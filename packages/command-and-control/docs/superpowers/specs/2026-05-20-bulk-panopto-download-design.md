# Bulk Panopto Download — Design

**Status:** Draft (2026-05-20) — needs review
**Repos:** `D:\Dev\canvas-design-studio` (Panopto code lives here), `D:\Dev\Command-and-Control-MCP` (orchestration)
**Size:** Medium
**Depends on:** Existing CDS Panopto OAuth2 + single-video fetcher

---

## 1. Problem

CI's transcript pipeline (`ingest_transcripts`, `map_transcripts_to_weeks`, `extract_lecture_topics`, etc.) is ready and tested. CDS has working Panopto API code (`getPanoptoToken`, `searchPanoptoVideos`, `fetchPanoptoCaptions`) for **one video at a time**. C&C's `download_transcripts` is a placeholder that errors out. There is no path from "professor has a Canvas course with Panopto recordings" to "CI has transcripts to analyze."

The gap is the **bulk loop**: discover the Panopto folder for the course, iterate all sessions, download each .vtt, save to disk in a directory that CI can ingest.

## 2. Goals

1. From a Canvas course context, identify the relevant Panopto folder.
2. Loop over all sessions in that folder, download captions for each that has them, save to disk.
3. Output files are tagged `<sanitised-title>.panopto.vtt` so CI's source detection picks them up automatically.
4. Progress is streamed (long downloads should show per-video progress like the Canvas Backup work already shipped).
5. Failures are partial — one bad session doesn't abort the run; failures are reported in the result.

## 3. Non-goals

- Building a Python Panopto downloader in Canvas Backup. CDS already has the TypeScript code; we reuse it rather than duplicate the OAuth2 flow.
- Whisper transcription as a fallback (separate concern).
- Course-folder discovery in Panopto by Canvas LTI integration ID (some institutions don't have this wired; we use folder browsing or user input instead).

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ C&C download_transcripts (current placeholder → real tool)      │
│   1. Resolve Panopto folder id (or accept it as input)          │
│   2. Call CDS bulkDownloadPanoptoCaptions(folderId, outputDir)  │
│   3. Stream per-video progress via notifications/progress       │
│   4. Return { downloaded, failed, outputDir }                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ CDS (canvas-design-mcp)                                         │
│                                                                 │
│  NEW: listPanoptoFolders({ query? })                            │
│       → browse folders to find course folder                    │
│                                                                 │
│  NEW: listSessionsInFolder(folderId)                            │
│       → enumerate recordings in a folder                        │
│                                                                 │
│  NEW: bulkDownloadPanoptoCaptions(folderId, outputDir,          │
│                                   onProgress?)                  │
│       → iterate sessions, fetch captions, save to disk          │
│       → reuses existing getPanoptoToken + fetchPanoptoCaptions  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Disk: <outputDir>/<sanitised-title>.panopto.vtt                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ CI ingestTranscripts(transcriptsPath=<outputDir>)               │
│   Picks up the .panopto.vtt files, source=panopto automatic     │
└─────────────────────────────────────────────────────────────────┘
```

## 5. New CDS exports

### 5.1 `listPanoptoFolders`

```typescript
interface PanoptoFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  sessionCount: number;
}

async function listPanoptoFolders(
  input: { query?: string; parentFolderId?: string },
  config: PanoptoConfig
): Promise<PanoptoFolder[]>
```

Uses `GET /Panopto/api/v1/folders` with optional `searchQuery` and `parentFolderId` query params. Returns up to 100 results paginated.

### 5.2 `listSessionsInFolder`

```typescript
interface PanoptoSession {
  id: string;
  title: string;
  startTime: string;        // ISO
  duration: number;         // seconds
  hasCaptions: boolean;
}

async function listSessionsInFolder(
  folderId: string,
  config: PanoptoConfig
): Promise<PanoptoSession[]>
```

Uses `GET /Panopto/api/v1/folders/{folderId}/sessions`. Paginates until exhausted.

### 5.3 `bulkDownloadPanoptoCaptions`

```typescript
interface BulkDownloadResult {
  folderId: string;
  outputDir: string;
  downloaded: { sessionId: string; title: string; path: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  skippedNoCaptions: { sessionId: string; title: string }[];
}

type ProgressCallback = (event: {
  type: 'session-start' | 'session-complete' | 'session-failed';
  sessionId: string;
  title: string;
  index: number;
  total: number;
  reason?: string;
}) => void;

async function bulkDownloadPanoptoCaptions(
  input: { folderId: string; outputDir: string; },
  config: PanoptoConfig,
  onProgress?: ProgressCallback
): Promise<BulkDownloadResult>
```

Iterates sessions. For each with `hasCaptions=true`, calls the existing per-session caption fetcher. Files saved as `<sanitised-title>.panopto.vtt`.

## 6. C&C `download_transcripts` rewrite

```typescript
interface DownloadTranscriptsInput {
  courseId: string;
  semesterId: string;
  panoptoFolderId?: string;       // when omitted, requires `folderQuery` to search
  folderQuery?: string;           // search for folder by name
  outputDir?: string;             // default: ~/.command-and-control/transcripts/<courseId>/<semesterId>/
}

interface DownloadTranscriptsResult {
  courseId: string;
  semesterId: string;
  outputDir: string;
  downloaded: number;
  failed: number;
  skippedNoCaptions: number;
  details: BulkDownloadResult;
}
```

Discovery flow:
1. If `panoptoFolderId` provided → use it directly.
2. If `folderQuery` provided → call `listPanoptoFolders` and use the first match (or error if multiple matches).
3. If neither → return an error suggesting the professor run `list_panopto_folders` first.

Progress streaming uses the same `notifications/progress` pattern shipped for `download_canvas_archive`. Each `session-start` and `session-complete` event becomes one progress notification.

## 7. Where the output goes

Default: `~/.command-and-control/transcripts/<courseId>/<semesterId>/`

CI's `ingest_transcripts` accepts this directory as `transcriptsPath`. The `.panopto.vtt` suffix makes CI's `detectSourceFromFilename` automatically tag the source as `panopto`.

This output directory is also what `analyze_course` (the new workflow) accepts as the optional `transcriptsPath` input — so a complete workflow can be `download_canvas_archive` → `download_transcripts` → `analyze_course` with archive + transcripts.

## 8. Error handling

| Failure | Behaviour |
|---|---|
| Panopto OAuth2 fails | Throw — entire run fails |
| Folder not found | Throw — entire run fails |
| Folder has zero sessions | Return result with empty arrays, status: 'no-sessions' |
| Session has no captions | Add to `skippedNoCaptions`, continue |
| Individual session caption fetch fails | Add to `failed`, continue |
| Disk write fails | Add to `failed`, continue |

## 9. Test plan

- Unit (CDS): `listPanoptoFolders`, `listSessionsInFolder`, `bulkDownloadPanoptoCaptions` against `vi.stubGlobal('fetch', ...)` mocks — same pattern as `brave_search_adapter.test.ts`.
- Unit (C&C): `download_transcripts` with mocked CDS bulk function — verify dir creation, progress callback invocation, result aggregation.
- Integration: skip in CI suite (real API calls). Smoke-test script invocable manually with real credentials.

## 10. Open decisions for review

1. **Folder discovery UX.** Right now I'm proposing `folderQuery` (search by name) as fallback when `panoptoFolderId` is omitted. Alternative: require the professor to call `list_panopto_folders` first and pick. The query approach is friendlier but may pick the wrong folder silently. The list-first approach is more correct but adds a step.

2. **Should we also fetch session metadata (date, duration) into a sidecar JSON?** CI's `mapTranscriptsToWeeks` uses filename heuristics + date hints embedded in the filename. A sidecar `<title>.panopto.json` with structured metadata would be cleaner. Adds work; CI would need updates to read it.

3. **Concurrency.** Sequential downloads are simpler but slow for a full semester. Parallel (3-5 at a time) is faster but harder to stream coherent progress. I lean sequential for v1; parallel as a later optimisation.

## 11. Out of scope

- Panopto folder creation / management (we only read)
- Re-running with incremental download (skip already-downloaded files) — useful future feature
- Whisper fallback for sessions without captions
