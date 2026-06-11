# Bulk Panopto Transcript Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `setup_panopto` and `bulk_fetch_panopto_transcripts` MCP tools to Command & Control so professors can download all Panopto transcripts for a course folder in one command, with optional auto-ingest into Curriculum Intelligence.

**Architecture:** The Panopto API client (`listSessionsInFolder`, `bulkDownloadPanoptoCaptions`, OAuth2 flow) already lives in `canvas-design-studio/src/tools/panopto.ts`. C&C adds a separate `panopto-config.json` config file managed by `setup_panopto`, and a workflow tool that loads that config, calls the CDS bulk downloader, and optionally chains CI's `ingestTranscripts`. One filename fix is needed in CDS: filenames must be prefixed with `YYYY-MM-DD_` from the session's start time.

**Tech Stack:** TypeScript, Vitest, Node.js `fs`/`os`/`path`, existing `canvas-design-mcp` and `curriculum-intelligence-mcp` npm workspace dependencies.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `packages/canvas-design-studio/src/tools/panopto.ts` | Modify line 476 | Prefix saved filename with `YYYY-MM-DD_` |
| `packages/canvas-design-studio/tests/panopto.test.ts` | Modify | Add filename format test |
| `packages/command-and-control/src/tools/setup_panopto.ts` | Create | `PanoptoSetupConfig` type, `loadPanoptoConfig()`, `setupPanopto()` |
| `packages/command-and-control/tests/tools/setup_panopto.test.ts` | Create | Tests for both exported functions |
| `packages/command-and-control/src/tools/workflows/bulk_fetch_panopto_transcripts.ts` | Create | Orchestrate download + optional ingest, forward progress |
| `packages/command-and-control/tests/tools/workflows/bulk_fetch_panopto_transcripts.test.ts` | Create | Tests for all four result buckets + ingest wiring + progress |
| `packages/command-and-control/src/index.ts` | Modify | Register `setup_panopto` and `bulk_fetch_panopto_transcripts` |

---

## Task 1: Fix Date-Prefixed Filename in CDS

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/panopto.ts:476`
- Modify: `packages/canvas-design-studio/tests/panopto.test.ts`

---

- [ ] **Step 1.1: Add the failing filename test to `packages/canvas-design-studio/tests/panopto.test.ts`**

Add this describe block at the end of the file, after all existing describe blocks:

```ts
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
```

Add these imports at the top of the file if not already present (they may already be imported — skip any that already exist).

Then add this describe block at the bottom of the file:

```ts
describe('bulkDownloadPanoptoCaptions — filename format', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('prefixes filename with YYYY-MM-DD from session.startTime', async () => {
    const outDir = join(tmpdir(), `panopto-bulk-test-${Date.now()}`);
    const mockFetch = vi.mocked(fetch);

    // 1. OAuth2 token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok' }),
    } as Response);
    // 2. List sessions in folder
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Results: [{
          Id: 'sess-01',
          Name: 'Week 03: Tableau Intro',
          StartTime: '2026-06-01T14:00:00Z',
          Duration: 3600,
          HasCaptions: true,
        }],
        TotalNumberOfResults: 1,
      }),
    } as Response);
    // 3. Captions list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ Language: 'en', FileUrl: 'https://example.hosted.panopto.com/captions/abc.vtt', IsDefault: true }]),
    } as Response);
    // 4. VTT content
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello students.\n',
    } as Response);

    try {
      await bulkDownloadPanoptoCaptions({ folderId: 'folder-01', outputDir: outDir }, CFG_API);
      const files = readdirSync(outDir);
      expect(files).toContain('2026-06-01_week-03-tableau-intro.panopto.vtt');
    } finally {
      if (existsSync(outDir)) rmSync(outDir, { recursive: true });
    }
  });
});
```

Note: `bulkDownloadPanoptoCaptions` and `CFG_API` must be imported at the top of the test file. `bulkDownloadPanoptoCaptions` is already exported from `panopto.ts`. Add it to the existing import:

```ts
import {
  buildEmbedUrl,
  buildViewerUrl,
  buildEmbedHtml,
  formatDuration,
  formatSearchResults,
  parseVttToText,
  sanitizeFilename,
  searchPanoptoVideos,
  embedPanoptoVideo,
  fetchPanoptoCaptions,
  bulkDownloadPanoptoCaptions,  // ← add this
} from '../src/tools/panopto.js';
```

---

- [ ] **Step 1.2: Run the test to verify it fails**

```powershell
cd packages\canvas-design-studio
npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "filename|FAIL|PASS|bulkDownload"
```

Expected: FAIL — the file will be saved as `week-03-tableau-intro.panopto.vtt` (no date prefix).

---

- [ ] **Step 1.3: Fix the filename in `packages/canvas-design-studio/src/tools/panopto.ts`**

Find line 476 (inside `bulkDownloadPanoptoCaptions`):

```ts
      const filename = `${sanitizeFilename(session.title)}.panopto.vtt`;
```

Replace with:

```ts
      const datePrefix = session.startTime.slice(0, 10); // "YYYY-MM-DD"
      const filename = `${datePrefix}_${sanitizeFilename(session.title)}.panopto.vtt`;
```

---

- [ ] **Step 1.4: Run the test to verify it passes**

```powershell
cd packages\canvas-design-studio
npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "filename|bulkDownload|FAIL|PASS"
```

Expected: PASS — `2026-06-01_week-03-tableau-intro.panopto.vtt` found in output dir.

---

- [ ] **Step 1.5: Run the full CDS test suite to confirm no regressions**

```powershell
cd packages\canvas-design-studio
npm test
```

Expected: All tests pass.

---

- [ ] **Step 1.6: Commit**

```powershell
cd D:\Dev\canvas-toolchain
git add packages/canvas-design-studio/src/tools/panopto.ts packages/canvas-design-studio/tests/panopto.test.ts
git commit -m "feat(cds): date-prefix bulk Panopto transcript filenames (YYYY-MM-DD_title.panopto.vtt)"
```

---

## Task 2: Add `setup_panopto` Tool to C&C

**Files:**
- Create: `packages/command-and-control/src/tools/setup_panopto.ts`
- Create: `packages/command-and-control/tests/tools/setup_panopto.test.ts`

---

- [ ] **Step 2.1: Create the failing test file at `packages/command-and-control/tests/tools/setup_panopto.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Lazy import after env var is set in each test — use dynamic import in beforeEach
// or restructure to use a tmpHome set before the module resolves getCcHomePath.
// Pattern: set CC_HOME before importing, then import the module.
// Since vitest caches modules, we isolate via env var (getCcHomePath reads CC_HOME at call time).

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-panopto-setup-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

import { setupPanopto, loadPanoptoConfig } from '../../src/tools/setup_panopto.js';

const TEST_INPUT = {
  domain: 'example.hosted.panopto.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('setupPanopto', () => {
  it('saves config and returns configured:true when credentials validate', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response);

    const result = await setupPanopto(TEST_INPUT);

    expect(result.configured).toBe(true);
    expect(result.domain).toBe('example.hosted.panopto.com');
    expect(result.validatedAt).toBeDefined();
    const saved = JSON.parse(readFileSync(join(tmpHome, 'panopto-config.json'), 'utf-8'));
    expect(saved.domain).toBe('example.hosted.panopto.com');
    expect(saved.clientId).toBe('test-client-id');
    expect(saved.lastValidatedAt).toBeDefined();
  });

  it('does NOT save config and returns error when credential test fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const result = await setupPanopto(TEST_INPUT);

    expect(result.configured).toBe(false);
    expect(result.error).toBe('CREDENTIAL_VALIDATION_FAILED');
    expect(existsSync(join(tmpHome, 'panopto-config.json'))).toBe(false);
  });

  it('saves without calling fetch when test:false', async () => {
    const result = await setupPanopto({ ...TEST_INPUT, test: false });

    expect(result.configured).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(existsSync(join(tmpHome, 'panopto-config.json'))).toBe(true);
  });

  it('does not include clientSecret in return value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response);

    const result = await setupPanopto(TEST_INPUT);

    expect(JSON.stringify(result)).not.toContain('test-client-secret');
  });
});

describe('loadPanoptoConfig', () => {
  it('throws PANOPTO_NOT_CONFIGURED when file is absent', () => {
    expect(() => loadPanoptoConfig()).toThrow('PANOPTO_NOT_CONFIGURED');
  });

  it('returns full config when file exists and is valid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response);
    await setupPanopto(TEST_INPUT);

    const config = loadPanoptoConfig();
    expect(config.domain).toBe('example.hosted.panopto.com');
    expect(config.clientId).toBe('test-client-id');
    expect(config.clientSecret).toBe('test-client-secret');
  });
});
```

---

- [ ] **Step 2.2: Run the tests to verify they fail**

```powershell
cd packages\command-and-control
npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "setup_panopto|FAIL|Cannot find"
```

Expected: FAIL — `Cannot find module '../../src/tools/setup_panopto.js'`.

---

- [ ] **Step 2.3: Create `packages/command-and-control/src/tools/setup_panopto.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPanoptoToken } from 'canvas-design-mcp/dist/tools/panopto.js';
import { getCcHomePath } from '../kb/config.js';

export interface PanoptoSetupConfig {
  domain: string;
  clientId: string;
  clientSecret: string;
  iframeWhitelisted: boolean | null;
  configuredAt: string;
  lastValidatedAt: string;
}

export interface SetupPanoptoInput {
  domain: string;
  clientId: string;
  clientSecret: string;
  iframeWhitelisted?: boolean | null;
  /** Default: true — validate credentials before saving. */
  test?: boolean;
}

export interface SetupPanoptoResult {
  configured: boolean;
  domain?: string;
  validatedAt?: string;
  message?: string;
  error?: string;
  fix?: string[];
}

function getPanoptoConfigPath(): string {
  return join(getCcHomePath(), 'panopto-config.json');
}

/**
 * Loads the saved Panopto config. Throws with PANOPTO_NOT_CONFIGURED if absent or incomplete.
 * Used by bulk_fetch_panopto_transcripts to fail fast with a clear message.
 */
export function loadPanoptoConfig(): PanoptoSetupConfig {
  const configPath = getPanoptoConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      'PANOPTO_NOT_CONFIGURED: Run setup_panopto with your Panopto domain, clientId, and clientSecret.',
    );
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<PanoptoSetupConfig>;
  if (!config.domain || !config.clientId || !config.clientSecret) {
    throw new Error(
      'PANOPTO_NOT_CONFIGURED: panopto-config.json is missing required fields. Re-run setup_panopto.',
    );
  }
  return config as PanoptoSetupConfig;
}

export async function setupPanopto(input: SetupPanoptoInput): Promise<SetupPanoptoResult> {
  const { domain, clientId, clientSecret, iframeWhitelisted = null, test = true } = input;
  const now = new Date().toISOString();

  if (test) {
    try {
      await getPanoptoToken({ domain, clientId, clientSecret, iframeWhitelisted });
    } catch (err) {
      return {
        configured: false,
        error: 'CREDENTIAL_VALIDATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        fix: [
          'Verify your clientId and clientSecret in the Panopto admin panel',
          'Confirm the domain is correct (e.g. "example.hosted.panopto.com")',
          'Ensure the API client has the Creator role in Panopto',
        ],
      };
    }
  }

  const config: PanoptoSetupConfig = {
    domain,
    clientId,
    clientSecret,
    iframeWhitelisted,
    configuredAt: now,
    lastValidatedAt: test ? now : '',
  };

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  writeFileSync(getPanoptoConfigPath(), JSON.stringify(config, null, 2), 'utf-8');

  return {
    configured: true,
    domain,
    ...(test && { validatedAt: now }),
    message: test
      ? `Panopto configured and credentials validated for ${domain}.`
      : `Panopto configured for ${domain} (credentials not tested).`,
  };
}
```

---

- [ ] **Step 2.4: Run the tests to verify they pass**

```powershell
cd packages\command-and-control
npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "setup_panopto|FAIL|PASS"
```

Expected: All `setup_panopto` tests PASS.

---

- [ ] **Step 2.5: Run the full C&C test suite to confirm no regressions**

```powershell
cd packages\command-and-control
npm test
```

Expected: All tests pass.

---

- [ ] **Step 2.6: Commit**

```powershell
cd D:\Dev\canvas-toolchain
git add packages/command-and-control/src/tools/setup_panopto.ts packages/command-and-control/tests/tools/setup_panopto.test.ts
git commit -m "feat(cc): add setup_panopto tool with credential validation and panopto-config.json"
```

---

## Task 3: Add `bulk_fetch_panopto_transcripts` Workflow

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/bulk_fetch_panopto_transcripts.ts`
- Create: `packages/command-and-control/tests/tools/workflows/bulk_fetch_panopto_transcripts.test.ts`

---

- [ ] **Step 3.1: Create the failing test file at `packages/command-and-control/tests/tools/workflows/bulk_fetch_panopto_transcripts.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/tools/setup_panopto.js', () => ({
  loadPanoptoConfig: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/panopto.js', () => ({
  bulkDownloadPanoptoCaptions: vi.fn(),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js', () => ({
  ingestTranscripts: vi.fn(),
}));

import { loadPanoptoConfig } from '../../../src/tools/setup_panopto.js';
import { bulkDownloadPanoptoCaptions } from 'canvas-design-mcp/dist/tools/panopto.js';
import { ingestTranscripts } from 'curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js';
import { bulkFetchPanoptoTranscripts } from '../../../src/tools/workflows/bulk_fetch_panopto_transcripts.js';

const MOCK_CONFIG = {
  domain: 'example.hosted.panopto.com',
  clientId: 'id',
  clientSecret: 'secret',
  iframeWhitelisted: true,
  configuredAt: '2026-01-01T00:00:00Z',
  lastValidatedAt: '2026-01-01T00:00:00Z',
};

const MOCK_DOWNLOAD_RESULT = {
  folderId: 'folder-01',
  outputDir: '/tmp/panopto-out',
  downloaded: [
    { sessionId: 's1', title: 'Lecture 1', path: '/tmp/panopto-out/2026-06-01_lecture-1.panopto.vtt' },
    { sessionId: 's2', title: 'Lecture 2', path: '/tmp/panopto-out/2026-06-03_lecture-2.panopto.vtt' },
  ],
  skippedNoCaptions: [{ sessionId: 's3', title: 'Lecture 3' }],
  failed: [{ sessionId: 's4', title: 'Lecture 4', reason: 'HTTP 500' }],
};

const MOCK_INGEST_RESULT = {
  courseId: 'itm310',
  semesterId: 'fall2026',
  transcriptCount: 2,
  transcriptsJsonPath: '/tmp/ci/transcripts.json',
  copiedTo: null,
};

beforeEach(() => {
  vi.mocked(loadPanoptoConfig).mockReturnValue(MOCK_CONFIG);
  vi.mocked(bulkDownloadPanoptoCaptions).mockResolvedValue(MOCK_DOWNLOAD_RESULT);
  vi.mocked(ingestTranscripts).mockReturnValue(MOCK_INGEST_RESULT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bulkFetchPanoptoTranscripts', () => {
  it('returns PANOPTO_NOT_CONFIGURED error when config is absent', async () => {
    vi.mocked(loadPanoptoConfig).mockImplementation(() => {
      throw new Error('PANOPTO_NOT_CONFIGURED: Run setup_panopto...');
    });

    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
    });

    expect(result.error).toBe('PANOPTO_NOT_CONFIGURED');
    expect(result.downloaded).toHaveLength(0);
    expect(bulkDownloadPanoptoCaptions).not.toHaveBeenCalled();
  });

  it('populates all four buckets correctly from the download result', async () => {
    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
    });

    expect(result.downloaded).toHaveLength(2);
    expect(result.skippedNoCaptions).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.summary).toEqual({
      total: 4,
      downloadedCount: 2,
      skippedCount: 1,
      failedCount: 1,
    });
    expect(result.error).toBeUndefined();
  });

  it('does not include ingestResult when courseId and semesterId are absent', async () => {
    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
    });

    expect(result.ingestResult).toBeUndefined();
    expect(ingestTranscripts).not.toHaveBeenCalled();
  });

  it('includes ingestResult and calls ingestTranscripts when courseId and semesterId provided', async () => {
    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
      courseId: 'itm310',
      semesterId: 'fall2026',
    });

    expect(result.ingestResult).toBeDefined();
    expect(result.ingestResult?.courseId).toBe('itm310');
    expect(ingestTranscripts).toHaveBeenCalledWith({
      courseId: 'itm310',
      semesterId: 'fall2026',
      transcriptsPath: '/tmp/panopto-out',
      source: 'panopto',
      copy: false,
    });
  });

  it('forwards progress events from bulkDownloadPanoptoCaptions to the caller', async () => {
    vi.mocked(bulkDownloadPanoptoCaptions).mockImplementation(
      async (_input, _config, onProgress) => {
        onProgress?.({ type: 'session-start', sessionId: 's1', title: 'L1', index: 0, total: 2 });
        onProgress?.({ type: 'session-complete', sessionId: 's1', title: 'L1', index: 0, total: 2 });
        onProgress?.({ type: 'session-failed', sessionId: 's2', title: 'L2', index: 1, total: 2, reason: 'err' });
        return {
          folderId: 'folder-01',
          outputDir: '/tmp/panopto-out',
          downloaded: [{ sessionId: 's1', title: 'L1', path: '/tmp/l1.vtt' }],
          skippedNoCaptions: [],
          failed: [{ sessionId: 's2', title: 'L2', reason: 'err' }],
        };
      },
    );

    const events: unknown[] = [];
    await bulkFetchPanoptoTranscripts(
      { folderId: 'folder-01', outputPath: '/tmp/panopto-out' },
      (e) => events.push(e),
    );

    expect(events).toHaveLength(3);
    expect((events[0] as { type: string }).type).toBe('session-start');
    expect((events[1] as { type: string }).type).toBe('session-complete');
    expect((events[2] as { type: string }).type).toBe('session-failed');
  });
});
```

---

- [ ] **Step 3.2: Run the tests to verify they fail**

```powershell
cd packages\command-and-control
npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "bulk_fetch|bulkFetch|FAIL|Cannot find"
```

Expected: FAIL — `Cannot find module '.../bulk_fetch_panopto_transcripts.js'`.

---

- [ ] **Step 3.3: Create `packages/command-and-control/src/tools/workflows/bulk_fetch_panopto_transcripts.ts`**

```ts
import { bulkDownloadPanoptoCaptions } from 'canvas-design-mcp/dist/tools/panopto.js';
import type { ProgressCallback } from 'canvas-design-mcp/dist/tools/panopto.js';
import { ingestTranscripts } from 'curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js';
import type { IngestTranscriptsResult } from 'curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js';
import { loadPanoptoConfig } from '../setup_panopto.js';

export interface BulkFetchPanoptoTranscriptsInput {
  folderId: string;
  outputPath: string;
  courseId?: string;
  semesterId?: string;
  /** Passed through to ingestTranscripts — copies files into CI semester folder. Default: false. */
  copy?: boolean;
}

export interface BulkFetchPanoptoTranscriptsResult {
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
  ingestResult?: IngestTranscriptsResult;
  error?: string;
  message?: string;
  fix?: string[];
}

export type { ProgressCallback };

export async function bulkFetchPanoptoTranscripts(
  input: BulkFetchPanoptoTranscriptsInput,
  onProgress?: ProgressCallback,
): Promise<BulkFetchPanoptoTranscriptsResult> {
  const { folderId, outputPath, courseId, semesterId, copy = false } = input;

  let panoptoConfig;
  try {
    panoptoConfig = loadPanoptoConfig();
  } catch (err) {
    return {
      folderId,
      outputPath,
      downloaded: [],
      skippedNoCaptions: [],
      failed: [],
      summary: { total: 0, downloadedCount: 0, skippedCount: 0, failedCount: 0 },
      error: 'PANOPTO_NOT_CONFIGURED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Run setup_panopto with your Panopto domain, clientId, and clientSecret.'],
    };
  }

  let downloadResult;
  try {
    downloadResult = await bulkDownloadPanoptoCaptions(
      { folderId, outputDir: outputPath },
      panoptoConfig,
      onProgress,
    );
  } catch (err) {
    return {
      folderId,
      outputPath,
      downloaded: [],
      skippedNoCaptions: [],
      failed: [],
      summary: { total: 0, downloadedCount: 0, skippedCount: 0, failedCount: 0 },
      error: 'DOWNLOAD_FAILED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Re-run setup_panopto with test:true to re-validate credentials.'],
    };
  }

  const total =
    downloadResult.downloaded.length +
    downloadResult.skippedNoCaptions.length +
    downloadResult.failed.length;

  const result: BulkFetchPanoptoTranscriptsResult = {
    folderId,
    outputPath,
    downloaded: downloadResult.downloaded,
    skippedNoCaptions: downloadResult.skippedNoCaptions,
    failed: downloadResult.failed,
    summary: {
      total,
      downloadedCount: downloadResult.downloaded.length,
      skippedCount: downloadResult.skippedNoCaptions.length,
      failedCount: downloadResult.failed.length,
    },
  };

  if (courseId && semesterId) {
    result.ingestResult = ingestTranscripts({
      courseId,
      semesterId,
      transcriptsPath: outputPath,
      source: 'panopto',
      copy,
    });
  }

  return result;
}
```

---

- [ ] **Step 3.4: Run the tests to verify they pass**

```powershell
cd packages\command-and-control
npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "bulk_fetch|bulkFetch|FAIL|PASS"
```

Expected: All `bulkFetchPanoptoTranscripts` tests PASS.

---

- [ ] **Step 3.5: Run the full C&C test suite**

```powershell
cd packages\command-and-control
npm test
```

Expected: All tests pass.

---

- [ ] **Step 3.6: Commit**

```powershell
cd D:\Dev\canvas-toolchain
git add packages/command-and-control/src/tools/workflows/bulk_fetch_panopto_transcripts.ts packages/command-and-control/tests/tools/workflows/bulk_fetch_panopto_transcripts.test.ts
git commit -m "feat(cc): add bulk_fetch_panopto_transcripts workflow with optional CI auto-ingest"
```

---

## Task 4: Wire Both Tools into C&C `index.ts`

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

---

- [ ] **Step 4.1: Add imports to `packages/command-and-control/src/index.ts`**

Find the existing import block at the top of the file. Add these two imports alongside the other tool imports:

```ts
import { setupPanopto } from './tools/setup_panopto.js';
import {
  bulkFetchPanoptoTranscripts,
  type BulkFetchPanoptoTranscriptsInput,
  type ProgressCallback,
} from './tools/workflows/bulk_fetch_panopto_transcripts.js';
```

---

- [ ] **Step 4.2: Add the tool schemas to the `ListToolsRequestSchema` handler**

Inside the `tools: [...]` array in `server.setRequestHandler(ListToolsRequestSchema, ...)`, add these two entries after the existing workflow tools and before the registry tools:

```ts
    {
      name: 'setup_panopto',
      description: 'Configure Panopto integration: set domain, clientId, and clientSecret. Validates credentials before saving. Run this once per institution setup.',
      inputSchema: {
        type: 'object' as const,
        required: ['domain', 'clientId', 'clientSecret'],
        properties: {
          domain: { type: 'string', description: 'Panopto hostname, e.g. "example.hosted.panopto.com".' },
          clientId: { type: 'string', description: 'OAuth2 client ID from the Panopto admin panel.' },
          clientSecret: { type: 'string', description: 'OAuth2 client secret. Stored locally, never echoed back.' },
          iframeWhitelisted: {
            type: 'boolean',
            description: 'Whether your Canvas instance allows Panopto iframes. Null = unknown.',
            nullable: true,
          },
          test: {
            type: 'boolean',
            description: 'Validate credentials before saving (default: true). Set false for scripted setup.',
          },
        },
      },
    },
    {
      name: 'bulk_fetch_panopto_transcripts',
      description: 'Download all Panopto transcripts for a folder as VTT files. Optionally auto-ingests into Curriculum Intelligence. Requires setup_panopto to be run first.',
      inputSchema: {
        type: 'object' as const,
        required: ['folderId', 'outputPath'],
        properties: {
          folderId: { type: 'string', description: 'Panopto folder ID (visible in the folder URL).' },
          outputPath: { type: 'string', description: 'Absolute path where VTT files will be saved.' },
          courseId: { type: 'string', description: 'If provided with semesterId, auto-ingests into Curriculum Intelligence.' },
          semesterId: { type: 'string', description: 'If provided with courseId, auto-ingests into Curriculum Intelligence.' },
          copy: {
            type: 'boolean',
            description: 'Copy VTT files into the CI semester folder during ingest (default: false).',
          },
        },
      },
    },
```

---

- [ ] **Step 4.3: Add the switch cases to the `CallToolRequestSchema` handler**

Inside the `switch (name)` block, add these two cases. Place them after the `update_course_materials` case and before `full_pipeline`:

```ts
      case 'setup_panopto':
        result = await setupPanopto(args as Parameters<typeof setupPanopto>[0]);
        break;
      case 'bulk_fetch_panopto_transcripts': {
        const progressToken = extra._meta?.progressToken;
        let progressCount = 0;
        const onProgress: ProgressCallback | undefined = progressToken != null
          ? (event) => {
              progressCount++;
              const icon =
                event.type === 'session-complete' ? '✓'
                : event.type === 'session-failed' ? '✗'
                : '→';
              const message = `[${event.index + 1}/${event.total}] ${icon} ${event.title}${
                event.reason ? ` — ${event.reason}` : ''
              }`;
              void extra.sendNotification({
                method: 'notifications/progress',
                params: { progressToken, progress: progressCount, message },
              });
            }
          : undefined;
        result = await bulkFetchPanoptoTranscripts(
          args as unknown as BulkFetchPanoptoTranscriptsInput,
          onProgress,
        );
        break;
      }
```

---

- [ ] **Step 4.4: Build the C&C package**

```powershell
cd packages\command-and-control
npm run build 2>&1
```

Expected: Zero TypeScript errors. Output in `dist/`.

---

- [ ] **Step 4.5: Run the full C&C test suite one final time**

```powershell
cd packages\command-and-control
npm test
```

Expected: All tests pass.

---

- [ ] **Step 4.6: Commit**

```powershell
cd D:\Dev\canvas-toolchain
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register setup_panopto and bulk_fetch_panopto_transcripts MCP tools"
```

---

## Done

At this point the following is true:

- `npm test` passes in both `canvas-design-studio` and `command-and-control`
- `npm run build` passes in `command-and-control`
- A professor can run `setup_panopto` once, then call `bulk_fetch_panopto_transcripts` each semester with a folder ID to get all VTT files, optionally auto-ingested into CI
- Filenames sort chronologically: `2026-06-01_week-03-tableau-intro.panopto.vtt`
- Progress notifications fire per-session to any MCP client that provides a `progressToken`
- CI's `map_transcripts_to_weeks`, `extract_lecture_topics`, and `build_quote_bank` tools immediately have access to the downloaded transcripts
