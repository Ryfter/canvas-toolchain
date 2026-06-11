# Panopto Transcript Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Panopto transcript enrichment pipeline: write `_sessions.json` manifest on download, add `panopto-enrich.ts` to CDS, add `setup_panopto_vocab` and `enrich_panopto_transcripts` to C&C, and register both in `index.ts`.

**Architecture:** CDS owns enrichment logic (`panopto-enrich.ts`); C&C owns vocab lifecycle (`setup_panopto_vocab`) and orchestration (`enrich_panopto_transcripts`). The `_sessions.json` manifest is written by `bulkDownloadPanoptoCaptions` after all downloads complete and consumed by `enrich_panopto_transcripts`. No new packages.

**Tech Stack:** TypeScript, Vitest, `curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js` (parseVtt), `node:fs`, `node:path`, `Intl.DateTimeFormat` (UTC date formatting).

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-05-25-panopto-transcript-enrichment-design.md`

---

## File Map

| File | Change |
|---|---|
| `packages/canvas-design-studio/src/tools/panopto.ts` | Add `basename` import; add `startTime`/`duration` to `BulkDownloadResult.downloaded[]`; populate in download loop; write `_sessions.json` after loop |
| `packages/canvas-design-studio/tests/panopto-bulk.test.ts` | Update `writeFileSync` assertion to `toHaveBeenCalledTimes(2)`; add `_sessions.json` shape test |
| `packages/canvas-design-studio/src/tools/panopto-enrich.ts` | New — `BUILTIN_FILLER_WORDS`, `enrichVtt`, `enrichVttFile`, interfaces |
| `packages/canvas-design-studio/tests/panopto-enrich.test.ts` | New — 10 tests for enrichVtt |
| `packages/command-and-control/src/tools/setup_panopto_vocab.ts` | New — `loadPanoptoVocab`, `setupPanoptoVocab` |
| `packages/command-and-control/tests/tools/setup_panopto_vocab.test.ts` | New — 8 tests |
| `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts` | New — `enrichPanoptoTranscripts` workflow |
| `packages/command-and-control/tests/tools/workflows/enrich_panopto_transcripts.test.ts` | New — 5 tests |
| `packages/command-and-control/src/index.ts` | Import + register `setup_panopto_vocab` and `enrich_panopto_transcripts` |

---

### Task 1: Extend `BulkDownloadResult` + write `_sessions.json` manifest

**Files:**
- Modify: `packages/canvas-design-studio/src/tools/panopto.ts`
- Modify: `packages/canvas-design-studio/tests/panopto-bulk.test.ts`

- [ ] **Step 1: Write the failing test for `_sessions.json` shape**

Add a new test to the existing `describe('bulkDownloadPanoptoCaptions')` block in `packages/canvas-design-studio/tests/panopto-bulk.test.ts`. Insert after the existing test (line 219, before closing `}`):

```ts
it('writes _sessions.json manifest with correct shape after download', async () => {
  const mockFetch = vi.mocked(fetch);
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Results: [
          { Id: 'sess-1', Name: 'Lecture 1', StartTime: '2026-05-01T12:00:00Z', Duration: 3600, HasCaptions: true },
        ],
        TotalNumberOfResults: 1,
      }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token' }),
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [{ Language: 'en', FileUrl: 'https://panopto/1.vtt', IsDefault: true }],
    } as Response)
    .mockResolvedValueOnce({
      ok: true,
      text: async () => 'WEBVTT\n\n00:01.000 --> 00:04.000\nHello',
    } as Response);

  await bulkDownloadPanoptoCaptions(
    { folderId: 'folder-1', outputDir: '/transcripts' },
    CFG_API,
  );

  expect(fs.writeFileSync).toHaveBeenCalledTimes(2);

  const manifestCall = vi.mocked(fs.writeFileSync).mock.calls[1];
  expect(manifestCall[0]).toBe('/transcripts/_sessions.json');
  const manifest = JSON.parse(manifestCall[1] as string);
  expect(manifest.domain).toBe(DOMAIN);
  expect(manifest.sessions).toHaveLength(1);
  expect(manifest.sessions[0]).toMatchObject({
    sessionId: 'sess-1',
    title: 'Lecture 1',
    startTime: '2026-05-01T12:00:00Z',
    duration: 3600,
    filename: expect.stringContaining('lecture-1.panopto.vtt'),
  });
  expect(manifest.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});
```

- [ ] **Step 2: Also update the existing `writeFileSync` assertion in the existing test**

In `packages/canvas-design-studio/tests/panopto-bulk.test.ts`, the existing test at line 213 says:
```ts
expect(fs.writeFileSync).toHaveBeenCalledOnce();
```

Change it to:
```ts
expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
```

- [ ] **Step 3: Run the new test to confirm it fails**

```powershell
cd packages/canvas-design-studio && npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "sessions.json|FAIL|PASS" | head -20
```

Expected: FAIL — `writeFileSync` assertion or `_sessions.json` shape assertion fails.

- [ ] **Step 4: Implement the changes in `panopto.ts`**

**4a.** Change line 3 from:
```ts
import { join } from 'node:path';
```
to:
```ts
import { basename, join } from 'node:path';
```

**4b.** Change the `BulkDownloadResult` interface (lines 294–300) from:
```ts
export interface BulkDownloadResult {
  folderId: string;
  outputDir: string;
  downloaded: { sessionId: string; title: string; path: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  skippedNoCaptions: { sessionId: string; title: string }[];
}
```
to:
```ts
export interface BulkDownloadResult {
  folderId: string;
  outputDir: string;
  downloaded: { sessionId: string; title: string; path: string; startTime: string; duration: number }[];
  failed: { sessionId: string; title: string; reason: string }[];
  skippedNoCaptions: { sessionId: string; title: string }[];
}
```

**4c.** Change `result.downloaded.push(...)` (lines 481–485) from:
```ts
      result.downloaded.push({
        sessionId: session.id,
        title: session.title,
        path: filePath,
      });
```
to:
```ts
      result.downloaded.push({
        sessionId: session.id,
        title: session.title,
        path: filePath,
        startTime: session.startTime,
        duration: session.duration,
      });
```

**4d.** After the for loop closing brace (after line 511, before `return result`), add:

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

- [ ] **Step 5: Run tests and verify they pass**

```powershell
cd packages/canvas-design-studio && npm test
```

Expected: all tests pass including the new `_sessions.json` shape test.

- [ ] **Step 6: Commit**

```powershell
git add packages/canvas-design-studio/src/tools/panopto.ts packages/canvas-design-studio/tests/panopto-bulk.test.ts
git commit -m "feat: write _sessions.json manifest after bulkDownloadPanoptoCaptions"
```

---

### Task 2: Create `panopto-enrich.ts` (CDS) + tests

**Files:**
- Create: `packages/canvas-design-studio/src/tools/panopto-enrich.ts`
- Create: `packages/canvas-design-studio/tests/panopto-enrich.test.ts`

- [ ] **Step 1: Write the test file first**

Create `packages/canvas-design-studio/tests/panopto-enrich.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js', () => ({
  parseVtt: vi.fn(),
}));

import { parseVtt } from 'curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js';
import {
  BUILTIN_FILLER_WORDS,
  enrichVtt,
  enrichVttFile,
  type EnrichVttOptions,
  type SessionManifestEntry,
} from '../src/tools/panopto-enrich.js';

const MOCK_SESSION: SessionManifestEntry = {
  sessionId: 'a1b2c3d4-0000-0000-0000-000000000001',
  title: 'Week 03: Tableau Intro',
  startTime: '2026-06-01T14:00:00Z',
  duration: 3600,
  filename: '2026-06-01_week-03-tableau-intro.panopto.vtt',
};

const BASE_OPTS: EnrichVttOptions = {
  fillerWords: [...BUILTIN_FILLER_WORDS],
  corrections: [],
  domain: 'example.hosted.panopto.com',
};

beforeEach(() => {
  vi.mocked(parseVtt).mockClear();
});

describe('BUILTIN_FILLER_WORDS', () => {
  it('does not modify BUILTIN_FILLER_WORDS when enrichVtt is called', () => {
    const originalLength = BUILTIN_FILLER_WORDS.length;
    vi.mocked(parseVtt).mockReturnValue([{ startSec: 0, endSec: 5, text: 'Hello students' }]);

    enrichVtt('WEBVTT\n\n', MOCK_SESSION, { ...BASE_OPTS, fillerWords: [...BUILTIN_FILLER_WORDS] });

    expect(BUILTIN_FILLER_WORDS).toHaveLength(originalLength);
  });
});

describe('enrichVtt — filler and corrections', () => {
  it('strips built-in filler words from cue text', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'Hello uh students um welcome' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).not.toContain(' uh ');
    expect(md).not.toContain(' um ');
    expect(md).toContain('Hello');
    expect(md).toContain('students');
    expect(md).toContain('welcome');
  });

  it('applies vocab corrections to cue text', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'The tool KOBE is useful' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, {
      ...BASE_OPTS,
      corrections: [{ from: 'KOBE', to: 'COBE' }],
    });

    expect(md).toContain('COBE');
    expect(md).not.toContain('KOBE');
  });
});

describe('enrichVtt — header', () => {
  it('header contains title, formatted date (UTC), and H:MM:SS duration', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'Hello' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('# Week 03: Tableau Intro');
    expect(md).toContain('Monday, June 1, 2026');
    expect(md).toContain('1:00:00');
  });
});

describe('enrichVtt — deep links', () => {
  it('injects [→ 5:00] link after the first 300-second bucket', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'First bucket content' },
      { startSec: 300, endSec: 305, text: 'Second bucket content' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('[→ 5:00]');
  });

  it('does NOT inject a trailing link after the last bucket', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'First bucket' },
      { startSec: 300, endSec: 305, text: 'Second bucket' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    const lines = md.split('\n').filter((l) => l.trim() !== '');
    const lastLine = lines[lines.length - 1];
    expect(lastLine).not.toMatch(/^\[→/);
  });

  it('link URL contains ?id={sessionId}&start=300', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'First' },
      { startSec: 300, endSec: 305, text: 'Second' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain(`?id=${MOCK_SESSION.sessionId}&start=300`);
  });
});

describe('enrichVtt — key-statement blockquotes', () => {
  it('renders a cue containing a key-statement trigger as a blockquote', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'The reason we use Tableau is efficiency.' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('> The reason we use Tableau is efficiency.');
  });

  it('non-matching cues are prose; matching cues are blockquoted at their position', () => {
    vi.mocked(parseVtt).mockReturnValue([
      { startSec: 0, endSec: 5, text: 'Hello students.' },
      { startSec: 5, endSec: 10, text: 'The reason is efficiency.' },
      { startSec: 10, endSec: 15, text: 'Let us proceed.' },
    ]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('Hello students.');
    expect(md).toContain('> The reason is efficiency.');
    expect(md).toContain('Let us proceed.');

    const lines = md.split('\n');
    const proseIdx1 = lines.findIndex((l) => l.includes('Hello students.'));
    const blockquoteIdx = lines.findIndex((l) => l.startsWith('> The reason'));
    const proseIdx2 = lines.findIndex((l) => l.includes('Let us proceed.'));
    expect(proseIdx1).toBeLessThan(blockquoteIdx);
    expect(blockquoteIdx).toBeLessThan(proseIdx2);
  });
});

describe('enrichVtt — edge cases', () => {
  it('on empty cues array returns header-only markdown without errors', () => {
    vi.mocked(parseVtt).mockReturnValue([]);

    const md = enrichVtt('WEBVTT\n\n', MOCK_SESSION, BASE_OPTS);

    expect(md).toContain('# Week 03: Tableau Intro');
    expect(md).not.toContain('[→');
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```powershell
cd packages/canvas-design-studio && npm test -- panopto-enrich --reporter=verbose 2>&1 | head -30
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `panopto-enrich.ts`**

Create `packages/canvas-design-studio/src/tools/panopto-enrich.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parseVtt } from 'curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js';

export const BUILTIN_FILLER_WORDS: string[] = [
  'uh', 'um', 'umm', 'like', 'right', 'you know', 'uh-huh', 'so', 'basically', 'actually',
];

const KEY_STATEMENT_TRIGGERS: string[] = [
  // Causal
  'the reason', 'the reason is', "that's why", 'because of this',
  // Emphasis
  'i want you to remember', "don't forget", 'remember that', 'keep in mind',
  // Summary
  'in summary', 'to summarize', 'the key point', 'the key idea', 'the main idea',
  // Definition
  'is defined as', 'means that', 'what we mean by',
  // Imperative
  'make sure', 'you need to', 'you must', 'always', 'never',
];

export interface EnrichVttOptions {
  fillerWords: string[];
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

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function enrichVtt(
  vttContent: string,
  session: SessionManifestEntry,
  options: EnrichVttOptions,
): string {
  const rawCues = parseVtt(vttContent);

  const fillerRegex =
    options.fillerWords.length > 0
      ? new RegExp('\\b(' + options.fillerWords.join('|') + ')\\b[,]?', 'gi')
      : null;

  const processedCues = rawCues.map((cue) => {
    let text = cue.text;
    if (fillerRegex) {
      text = text.replace(fillerRegex, '');
    }
    for (const correction of options.corrections) {
      text = text.replaceAll(correction.from, correction.to);
    }
    text = text.replace(/  +/g, ' ').trim();

    const lower = text.toLowerCase();
    const isKeyStatement = KEY_STATEMENT_TRIGGERS.some((trigger) => lower.includes(trigger));

    return { startSec: cue.startSec, text, isKeyStatement };
  });

  // Group into 5-minute buckets
  const bucketMap = new Map<number, typeof processedCues>();
  for (const cue of processedCues) {
    const bucketIndex = Math.floor(cue.startSec / 300);
    if (!bucketMap.has(bucketIndex)) bucketMap.set(bucketIndex, []);
    bucketMap.get(bucketIndex)!.push(cue);
  }

  // Render header
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(session.startTime));

  const lines: string[] = [
    `# ${session.title}`,
    `**Date:** ${date} | **Duration:** ${formatDuration(session.duration)}`,
    '',
    '---',
    '',
  ];

  const sortedBuckets = [...bucketMap.keys()].sort((a, b) => a - b);

  for (let i = 0; i < sortedBuckets.length; i++) {
    const bucketIndex = sortedBuckets[i];
    const bucketCues = bucketMap.get(bucketIndex)!;
    const isLast = i === sortedBuckets.length - 1;

    // Render cues: flush prose before each blockquote, collect trailing prose
    const proseParts: string[] = [];
    for (const cue of bucketCues) {
      if (cue.text === '') continue;
      if (cue.isKeyStatement) {
        if (proseParts.length > 0) {
          lines.push(proseParts.join(' '));
          lines.push('');
          proseParts.length = 0;
        }
        lines.push(`> ${cue.text}`);
        lines.push('');
      } else {
        proseParts.push(cue.text);
      }
    }
    if (proseParts.length > 0) {
      lines.push(proseParts.join(' '));
      lines.push('');
    }

    // Deep link to start of next bucket (skip on last bucket)
    if (!isLast) {
      const nextBucket = sortedBuckets[i + 1];
      const startSec = nextBucket * 300;
      const mm = Math.floor(startSec / 60);
      const ss = String(startSec % 60).padStart(2, '0');
      const url = `https://${options.domain}/Panopto/Pages/Viewer.aspx?id=${session.sessionId}&start=${startSec}`;
      lines.push(`[→ ${mm}:${ss}](${url})`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function enrichVttFile(
  vttPath: string,
  session: SessionManifestEntry,
  options: EnrichVttOptions,
): string {
  const vttContent = readFileSync(vttPath, 'utf-8');
  return enrichVtt(vttContent, session, options);
}
```

- [ ] **Step 4: Run tests and verify they pass**

```powershell
cd packages/canvas-design-studio && npm test -- panopto-enrich --reporter=verbose
```

Expected: all 10 tests pass.

- [ ] **Step 5: Run full CDS test suite to check for regressions**

```powershell
cd packages/canvas-design-studio && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/canvas-design-studio/src/tools/panopto-enrich.ts packages/canvas-design-studio/tests/panopto-enrich.test.ts
git commit -m "feat: add panopto-enrich.ts with enrichVtt, key-statement blockquotes, and deep links"
```

---

### Task 3: Create `setup_panopto_vocab.ts` (C&C) + tests

**Files:**
- Create: `packages/command-and-control/src/tools/setup_panopto_vocab.ts`
- Create: `packages/command-and-control/tests/tools/setup_panopto_vocab.test.ts`

- [ ] **Step 1: Write the test file first**

Create `packages/command-and-control/tests/tools/setup_panopto_vocab.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPanoptoVocab, setupPanoptoVocab } from '../../src/tools/setup_panopto_vocab.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = join(tmpdir(), `cc-vocab-test-${Date.now()}`);
  mkdirSync(tmpHome, { recursive: true });
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.CC_HOME;
});

describe('loadPanoptoVocab', () => {
  it('returns empty defaults when panopto-vocab.json is absent', () => {
    const vocab = loadPanoptoVocab();
    expect(vocab).toEqual({ fillerWords: [], corrections: [] });
  });

  it('throws VOCAB_CORRUPT on malformed JSON', () => {
    writeFileSync(join(tmpHome, 'panopto-vocab.json'), '{bad json', 'utf-8');
    expect(() => loadPanoptoVocab()).toThrow();
    try {
      loadPanoptoVocab();
    } catch (err: any) {
      expect(err.error).toBe('VOCAB_CORRUPT');
    }
  });
});

describe('setupPanoptoVocab', () => {
  it('list returns empty defaults when file absent', () => {
    const result = setupPanoptoVocab({ action: 'list' });
    expect(result.vocab).toEqual({ fillerWords: [], corrections: [] });
  });

  it('add-correction writes the entry and skips exact duplicates', () => {
    setupPanoptoVocab({ action: 'add-correction', from: 'KOBE', to: 'COBE' });

    const vocab = loadPanoptoVocab();
    expect(vocab.corrections).toHaveLength(1);
    expect(vocab.corrections[0]).toEqual({ from: 'KOBE', to: 'COBE' });

    // Duplicate is skipped
    setupPanoptoVocab({ action: 'add-correction', from: 'KOBE', to: 'COBE' });
    const vocab2 = loadPanoptoVocab();
    expect(vocab2.corrections).toHaveLength(1);
  });

  it('add-filler appends the word', () => {
    setupPanoptoVocab({ action: 'add-filler', word: 'essentially' });

    const vocab = loadPanoptoVocab();
    expect(vocab.fillerWords).toContain('essentially');
  });

  it('add-filler skips duplicate words', () => {
    setupPanoptoVocab({ action: 'add-filler', word: 'essentially' });
    setupPanoptoVocab({ action: 'add-filler', word: 'essentially' });

    const vocab = loadPanoptoVocab();
    expect(vocab.fillerWords.filter((w) => w === 'essentially')).toHaveLength(1);
  });

  it('remove-correction removes the matching entry', () => {
    setupPanoptoVocab({ action: 'add-correction', from: 'KOBE', to: 'COBE' });
    setupPanoptoVocab({ action: 'add-correction', from: 'kobe', to: 'COBE' });

    setupPanoptoVocab({ action: 'remove-correction', from: 'KOBE' });

    const vocab = loadPanoptoVocab();
    expect(vocab.corrections).toHaveLength(1);
    expect(vocab.corrections[0].from).toBe('kobe');
  });

  it('writes the file with mode 0o600 (atomic write)', () => {
    setupPanoptoVocab({ action: 'add-filler', word: 'basically' });

    const vocabPath = join(tmpHome, 'panopto-vocab.json');
    expect(existsSync(vocabPath)).toBe(true);
    const content = JSON.parse(readFileSync(vocabPath, 'utf-8'));
    expect(content.fillerWords).toContain('basically');
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```powershell
cd packages/command-and-control && npm test -- setup_panopto_vocab --reporter=verbose 2>&1 | head -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `setup_panopto_vocab.ts`**

Create `packages/command-and-control/src/tools/setup_panopto_vocab.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export interface PanoptoVocab {
  fillerWords: string[];
  corrections: { from: string; to: string }[];
}

export interface SetupPanoptoVocabInput {
  action: 'add-correction' | 'add-filler' | 'remove-correction' | 'list';
  from?: string;
  to?: string;
  word?: string;
}

export interface SetupPanoptoVocabResult {
  action: string;
  vocab: PanoptoVocab;
  message?: string;
  error?: string;
  fix?: string[];
}

function getVocabPath(): string {
  return join(getCcHomePath(), 'panopto-vocab.json');
}

export function loadPanoptoVocab(): PanoptoVocab {
  const vocabPath = getVocabPath();
  if (!existsSync(vocabPath)) {
    return { fillerWords: [], corrections: [] };
  }
  try {
    return JSON.parse(readFileSync(vocabPath, 'utf-8')) as PanoptoVocab;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw { error: 'VOCAB_CORRUPT', fix: ['Delete panopto-vocab.json and re-run setup_panopto_vocab'] };
  }
}

function saveVocab(vocab: PanoptoVocab): void {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const vocabPath = getVocabPath();
  const tmpPath = `${vocabPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(vocab, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, vocabPath);
}

export function setupPanoptoVocab(input: SetupPanoptoVocabInput): SetupPanoptoVocabResult {
  const { action, from, to, word } = input;

  let vocab: PanoptoVocab;
  try {
    vocab = loadPanoptoVocab();
  } catch (err: any) {
    return { action, vocab: { fillerWords: [], corrections: [] }, error: err.error, fix: err.fix };
  }

  switch (action) {
    case 'list':
      return { action, vocab };

    case 'add-correction': {
      if (!from || !to) {
        return { action, vocab, error: 'MISSING_FIELDS', fix: ['Provide both from and to for add-correction'] };
      }
      const alreadyExists = vocab.corrections.some((c) => c.from === from && c.to === to);
      if (!alreadyExists) {
        vocab.corrections.push({ from, to });
        saveVocab(vocab);
      }
      return {
        action,
        vocab,
        message: alreadyExists ? `Correction ${from}→${to} already exists.` : `Added correction ${from}→${to}.`,
      };
    }

    case 'add-filler': {
      if (!word) {
        return { action, vocab, error: 'MISSING_FIELDS', fix: ['Provide word for add-filler'] };
      }
      const alreadyInList = vocab.fillerWords.includes(word);
      if (!alreadyInList) {
        vocab.fillerWords.push(word);
        saveVocab(vocab);
      }
      return {
        action,
        vocab,
        message: alreadyInList ? `"${word}" already in filler list.` : `Added "${word}" to filler list.`,
      };
    }

    case 'remove-correction': {
      if (!from) {
        return { action, vocab, error: 'MISSING_FIELDS', fix: ['Provide from for remove-correction'] };
      }
      vocab.corrections = vocab.corrections.filter((c) => c.from !== from);
      saveVocab(vocab);
      return { action, vocab, message: `Removed correction for "${from}".` };
    }
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```powershell
cd packages/command-and-control && npm test -- setup_panopto_vocab --reporter=verbose
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/command-and-control/src/tools/setup_panopto_vocab.ts packages/command-and-control/tests/tools/setup_panopto_vocab.test.ts
git commit -m "feat: add setup_panopto_vocab tool with loadPanoptoVocab helper"
```

---

### Task 4: Create `enrich_panopto_transcripts.ts` workflow (C&C) + tests

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts`
- Create: `packages/command-and-control/tests/tools/workflows/enrich_panopto_transcripts.test.ts`

- [ ] **Step 1: Write the test file first**

Create `packages/command-and-control/tests/tools/workflows/enrich_panopto_transcripts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../../../src/tools/setup_panopto.js', () => ({
  loadPanoptoConfig: vi.fn(),
}));
vi.mock('../../../src/tools/setup_panopto_vocab.js', () => ({
  loadPanoptoVocab: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/panopto-enrich.js', () => ({
  enrichVttFile: vi.fn(),
  BUILTIN_FILLER_WORDS: ['uh', 'um'],
}));

import { loadPanoptoConfig } from '../../../src/tools/setup_panopto.js';
import { loadPanoptoVocab } from '../../../src/tools/setup_panopto_vocab.js';
import { enrichVttFile } from 'canvas-design-mcp/dist/tools/panopto-enrich.js';
import { enrichPanoptoTranscripts } from '../../../src/tools/workflows/enrich_panopto_transcripts.js';

const MOCK_CONFIG = {
  domain: 'example.hosted.panopto.com',
  clientId: 'id',
  clientSecret: 'secret',
  iframeWhitelisted: true,
  configuredAt: '2026-01-01T00:00:00Z',
  lastValidatedAt: '2026-01-01T00:00:00Z',
};

const MOCK_VOCAB = { fillerWords: [], corrections: [] };

const MANIFEST = {
  domain: 'example.hosted.panopto.com',
  generatedAt: '2026-06-01T00:00:00Z',
  sessions: [
    {
      sessionId: 's1',
      title: 'Lecture 1',
      startTime: '2026-06-01T14:00:00Z',
      duration: 3600,
      filename: '2026-06-01_lecture-1.panopto.vtt',
    },
    {
      sessionId: 's2',
      title: 'Lecture 2',
      startTime: '2026-06-03T14:00:00Z',
      duration: 3600,
      filename: '2026-06-03_lecture-2.panopto.vtt',
    },
    {
      sessionId: 's3',
      title: 'Lecture 3',
      startTime: '2026-06-05T14:00:00Z',
      duration: 3600,
      filename: '2026-06-05_lecture-3.panopto.vtt',
    },
  ],
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `enrich-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  vi.mocked(loadPanoptoConfig).mockReturnValue(MOCK_CONFIG);
  vi.mocked(loadPanoptoVocab).mockReturnValue(MOCK_VOCAB);
  vi.mocked(enrichVttFile).mockReturnValue('# Lecture\n\nContent');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('enrichPanoptoTranscripts', () => {
  it('returns MANIFEST_NOT_FOUND when _sessions.json is absent', async () => {
    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.error).toBe('MANIFEST_NOT_FOUND');
    expect(result.fix).toBeDefined();
    expect(enrichVttFile).not.toHaveBeenCalled();
  });

  it('returns PANOPTO_NOT_CONFIGURED when panopto config is absent', async () => {
    vi.mocked(loadPanoptoConfig).mockImplementation(() => {
      throw new Error('PANOPTO_NOT_CONFIGURED');
    });
    writeFileSync(join(tmpDir, '_sessions.json'), JSON.stringify(MANIFEST), 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.error).toBe('PANOPTO_NOT_CONFIGURED');
  });

  it('3-session folder: 2 enrich successfully, 1 fails (missing VTT)', async () => {
    writeFileSync(join(tmpDir, '_sessions.json'), JSON.stringify(MANIFEST), 'utf-8');
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');
    writeFileSync(join(tmpDir, '2026-06-03_lecture-2.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');
    // s3 VTT intentionally absent

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.enriched).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].sessionId).toBe('s3');
    expect(result.summary).toEqual({ total: 3, enrichedCount: 2, failedCount: 1 });
    expect(result.error).toBeUndefined();
  });

  it('panopto-vocab.json absent: enrichment succeeds using built-in fillers only', async () => {
    vi.mocked(loadPanoptoVocab).mockReturnValue({ fillerWords: [], corrections: [] });
    writeFileSync(join(tmpDir, '_sessions.json'), JSON.stringify({ ...MANIFEST, sessions: [MANIFEST.sessions[0]] }), 'utf-8');
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.error).toBeUndefined();
    expect(result.enriched).toHaveLength(1);
    // Built-in fillers are passed to enrichVttFile
    expect(enrichVttFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ fillerWords: expect.arrayContaining(['uh', 'um']) }),
    );
  });

  it('.enriched.md is written alongside .panopto.vtt with correct filename', async () => {
    writeFileSync(join(tmpDir, '_sessions.json'), JSON.stringify({ ...MANIFEST, sessions: [MANIFEST.sessions[0]] }), 'utf-8');
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    const mdPath = join(tmpDir, '2026-06-01_lecture-1.enriched.md');
    expect(existsSync(mdPath)).toBe(true);
    expect(result.enriched[0].mdPath).toBe(mdPath);
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```powershell
cd packages/command-and-control && npm test -- enrich_panopto_transcripts --reporter=verbose 2>&1 | head -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `enrich_panopto_transcripts.ts`**

Create `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  enrichVttFile,
  BUILTIN_FILLER_WORDS,
  type SessionsManifest,
} from 'canvas-design-mcp/dist/tools/panopto-enrich.js';
import { loadPanoptoConfig } from '../setup_panopto.js';
import { loadPanoptoVocab } from '../setup_panopto_vocab.js';

export interface EnrichPanoptoTranscriptsInput {
  transcriptsPath: string;
}

export interface EnrichPanoptoTranscriptsResult {
  transcriptsPath: string;
  enriched: { sessionId: string; title: string; mdPath: string }[];
  failed: { sessionId: string; title: string; reason: string }[];
  summary: { total: number; enrichedCount: number; failedCount: number };
  error?: string;
  message?: string;
  fix?: string[];
}

export async function enrichPanoptoTranscripts(
  input: EnrichPanoptoTranscriptsInput,
): Promise<EnrichPanoptoTranscriptsResult> {
  const { transcriptsPath } = input;

  const manifestPath = join(transcriptsPath, '_sessions.json');
  if (!existsSync(manifestPath)) {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: 'MANIFEST_NOT_FOUND',
      fix: ['Run bulk_fetch_panopto_transcripts first'],
    };
  }

  let manifest: SessionsManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SessionsManifest;
  } catch {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: 'MANIFEST_CORRUPT',
      fix: ['Re-run bulk_fetch_panopto_transcripts to regenerate _sessions.json'],
    };
  }

  let domain: string;
  try {
    const config = loadPanoptoConfig();
    domain = config.domain;
  } catch {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: 'PANOPTO_NOT_CONFIGURED',
      fix: ['Run setup_panopto with your Panopto domain, clientId, and clientSecret.'],
    };
  }

  let vocab: { fillerWords: string[]; corrections: { from: string; to: string }[] };
  try {
    vocab = loadPanoptoVocab();
  } catch (err: any) {
    return {
      transcriptsPath,
      enriched: [],
      failed: [],
      summary: { total: 0, enrichedCount: 0, failedCount: 0 },
      error: err.error ?? 'VOCAB_CORRUPT',
      fix: err.fix,
    };
  }

  const allFillerWords = [...BUILTIN_FILLER_WORDS, ...vocab.fillerWords];

  const result: EnrichPanoptoTranscriptsResult = {
    transcriptsPath,
    enriched: [],
    failed: [],
    summary: { total: manifest.sessions.length, enrichedCount: 0, failedCount: 0 },
  };

  for (const session of manifest.sessions) {
    const vttPath = join(transcriptsPath, session.filename);

    if (!existsSync(vttPath)) {
      result.failed.push({ sessionId: session.sessionId, title: session.title, reason: 'VTT file not found' });
      continue;
    }

    try {
      const markdown = enrichVttFile(vttPath, session, {
        fillerWords: allFillerWords,
        corrections: vocab.corrections,
        domain,
      });
      const mdPath = join(transcriptsPath, session.filename.replace(/\.panopto\.vtt$/, '.enriched.md'));
      writeFileSync(mdPath, markdown, 'utf-8');
      result.enriched.push({ sessionId: session.sessionId, title: session.title, mdPath });
    } catch (err) {
      result.failed.push({
        sessionId: session.sessionId,
        title: session.title,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  result.summary.enrichedCount = result.enriched.length;
  result.summary.failedCount = result.failed.length;

  return result;
}
```

- [ ] **Step 4: Run tests and verify they pass**

```powershell
cd packages/command-and-control && npm test -- enrich_panopto_transcripts --reporter=verbose
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run full C&C test suite to check for regressions**

```powershell
cd packages/command-and-control && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts packages/command-and-control/tests/tools/workflows/enrich_panopto_transcripts.test.ts
git commit -m "feat: add enrich_panopto_transcripts workflow"
```

---

### Task 5: Register `setup_panopto_vocab` and `enrich_panopto_transcripts` in `index.ts`

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Add imports**

After the existing `bulkFetchPanoptoTranscripts` import block (after line 25), add:

```ts
import { setupPanoptoVocab } from './tools/setup_panopto_vocab.js';
import {
  enrichPanoptoTranscripts,
  type EnrichPanoptoTranscriptsInput,
} from './tools/workflows/enrich_panopto_transcripts.js';
```

- [ ] **Step 2: Add tool schemas**

In the `ListToolsRequestSchema` handler, add after the `bulk_fetch_panopto_transcripts` schema (after line 159, still inside the `// ── Panopto transcripts ──` section):

```ts
    {
      name: 'setup_panopto_vocab',
      description: 'Manage professor vocabulary corrections and filler words for transcript enrichment. Add or remove vocab entries used by enrich_panopto_transcripts.',
      inputSchema: {
        type: 'object' as const,
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['add-correction', 'add-filler', 'remove-correction', 'list'],
            description: 'list: show current vocab. add-correction: add a find/replace pair. add-filler: add a word to the filler list. remove-correction: remove a correction by its from value.',
          },
          from: { type: 'string', description: 'Required for add-correction and remove-correction. The source word/phrase to find.' },
          to: { type: 'string', description: 'Required for add-correction. The replacement word/phrase.' },
          word: { type: 'string', description: 'Required for add-filler. The filler word to add.' },
        },
      },
    },
    {
      name: 'enrich_panopto_transcripts',
      description: 'Generate enriched markdown from downloaded Panopto VTT files. Adds Week/Date headers, deep links every 5 minutes, strips filler words, applies vocab corrections, and highlights key statements as blockquotes. Requires bulk_fetch_panopto_transcripts to have been run first.',
      inputSchema: {
        type: 'object' as const,
        required: ['transcriptsPath'],
        properties: {
          transcriptsPath: {
            type: 'string',
            description: 'Absolute path to the folder where bulk_fetch_panopto_transcripts wrote VTT files and _sessions.json.',
          },
        },
      },
    },
```

- [ ] **Step 3: Add switch cases**

In the `CallToolRequestSchema` handler's switch statement, add after the `bulk_fetch_panopto_transcripts` case (after line 316):

```ts
      case 'setup_panopto_vocab':
        result = setupPanoptoVocab(args as unknown as Parameters<typeof setupPanoptoVocab>[0]);
        break;
      case 'enrich_panopto_transcripts':
        result = await enrichPanoptoTranscripts(args as unknown as EnrichPanoptoTranscriptsInput);
        break;
```

- [ ] **Step 4: Build to verify TypeScript compilation**

```powershell
cd packages/command-and-control && npm run build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 5: Run full C&C test suite**

```powershell
cd packages/command-and-control && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add packages/command-and-control/src/index.ts
git commit -m "feat: register setup_panopto_vocab and enrich_panopto_transcripts in MCP server"
```

---

## Verification

After all tasks complete, run from the repo root to confirm nothing regressed:

```powershell
cd packages/canvas-design-studio && npm test && npm run build
cd packages/command-and-control && npm test && npm run build
```
