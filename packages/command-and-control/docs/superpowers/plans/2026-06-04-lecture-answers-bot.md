# Lecture Answers Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the faculty-facing Lecture Answers Bot per `packages/command-and-control/docs/superpowers/specs/2026-06-04-lecture-answers-bot-design.md` — a hybrid keyword + semantic retrieval system over per-course transcripts, CDS markdown, slide PDFs, and curated FAQ, with platform-agnostic tool naming and a setup-time embedding-provider fallback (Ollama → transformers.js → Voyage).

**Architecture:** All new code lives under `packages/command-and-control/src/tools/answers/` (library code) and `packages/command-and-control/src/tools/workflows/` (MCP-facing thin wrappers). Per-course indexes are SQLite (FTS5 keyword) + SQLite-vec (vector) files at `<courseDir>/.canvas-toolchain/answers-index/`. Embedding providers behind a stable interface; user config at `~/.command-and-control/lecture-answers-config.json`. Four new MCP tools: `setup_lecture_answers`, `index_course_for_answers`, `ask_course`, `reembed_course_index`.

**Tech Stack:** TypeScript ESM (existing monorepo). New deps: `better-sqlite3`, `sqlite-vec`, `@llamaindex/liteparse`, `@xenova/transformers` (lazy-loaded). Reuses existing `@canvas-toolchain/shared-llm` for the Anthropic LLM call.

---

## File Structure (created in this plan)

```
packages/command-and-control/
├─ src/tools/
│  ├─ answers/                              # library code
│  │  ├─ types.ts                           # shared types
│  │  ├─ config.ts                          # ~/.command-and-control/lecture-answers-config.json
│  │  ├─ paths.ts                           # storage path helpers
│  │  ├─ provider/
│  │  │  ├─ types.ts                        # EmbeddingProvider interface
│  │  │  ├─ ollama.ts                       # Ollama provider (A)
│  │  │  ├─ transformers_js.ts              # transformers.js provider (B, lazy-loaded)
│  │  │  ├─ voyage.ts                       # Voyage AI provider (C)
│  │  │  └─ resolve.ts                      # provider selection + detection
│  │  ├─ store/
│  │  │  ├─ schema.ts                       # SQLite DDL constants
│  │  │  ├─ store.ts                        # open / read / write / delete chunks
│  │  │  └─ index_meta.ts                   # index-meta.json read/write
│  │  ├─ chunking/
│  │  │  ├─ transcript.ts                   # timestamp-aware chunker
│  │  │  ├─ markdown.ts                     # heading-aware chunker
│  │  │  ├─ canonical.ts                    # H2-section chunker
│  │  │  └─ slide_pdf.ts                    # one-chunk-per-page via LiteParse
│  │  ├─ ingest/
│  │  │  ├─ discover.ts                     # corpus source discovery
│  │  │  └─ orchestrator.ts                 # mtime delta + per-source ingest + meta update
│  │  └─ retrieval/
│  │     ├─ hybrid.ts                       # FTS5 + vec + RRF + canonical boost
│  │     ├─ prompt.ts                       # LLM prompt builder
│  │     └─ answer.ts                       # LLM call + citation parsing
│  └─ workflows/
│     ├─ setup_lecture_answers.ts           # MCP tool 1
│     ├─ index_course_for_answers.ts        # MCP tool 2
│     ├─ ask_course.ts                      # MCP tool 3
│     └─ reembed_course_index.ts            # MCP tool 4
├─ src/index.ts                             # MODIFY — register the 4 new tools
├─ tests/answers/                           # mirror of src/tools/answers/ test tree
└─ scripts/smoke-integration.ts             # MODIFY — extend with answers-bot smoke test
```

---

## Phase 0 — Foundation

### Task 0.1: Install new deps + shared types + config + paths

**Files:**
- Modify: `packages/command-and-control/package.json`
- Create: `packages/command-and-control/src/tools/answers/types.ts`
- Create: `packages/command-and-control/src/tools/answers/config.ts`
- Create: `packages/command-and-control/src/tools/answers/paths.ts`
- Create: `packages/command-and-control/tests/answers/config.test.ts`

- [ ] **Step 1: Install deps**

```bash
cd packages/command-and-control
npm install better-sqlite3 sqlite-vec @llamaindex/liteparse
npm install --save-dev @types/better-sqlite3
```

`@xenova/transformers` is NOT installed at this phase — it's lazy-loaded only when provider B is selected, and we'll declare it as an optionalDependency in a later task.

- [ ] **Step 2: Write `types.ts`**

```ts
// packages/command-and-control/src/tools/answers/types.ts

export type EmbeddingProviderKind = 'ollama' | 'transformers-js' | 'voyage';

export interface EmbeddingProviderInfo {
  kind: EmbeddingProviderKind;
  model: string;          // 'nomic-embed-text' for ollama, 'BGE-small-en-v1.5' for transformers-js, etc.
  dimension: number;      // 768 | 384 | 1024 | ...
}

export type ChunkSource = 'transcript' | 'cds' | 'slide' | 'canonical';

export interface Chunk {
  id?: number;            // assigned at insert time
  content: string;
  source: ChunkSource;
  sourcePath: string;     // path relative to courseDir or to a transcript source root
  sourceRef: string;      // "00:14:32" | "week-03/overview.md#assignments" | "slides/week-03.pdf p.7" | "## How is …"
  deepLink: string | null;
}

export interface IndexMeta {
  courseId: number;
  provider: EmbeddingProviderInfo;
  lastIndexedAt: string;
  transcriptSources: string[];
  sourceFiles: Record<string, { mtime: number; chunkCount: number }>;
}

export interface LectureAnswersConfig {
  provider: EmbeddingProviderKind;
  model?: string;
  voyageApiKey?: string;      // only present if provider === 'voyage'
  ollamaBaseUrl?: string;     // default 'http://localhost:11434'
}
```

- [ ] **Step 3: Write `paths.ts`**

```ts
// packages/command-and-control/src/tools/answers/paths.ts

import { join } from 'node:path';
import { getCcHomePath } from '../../kb/config.js';

export const LECTURE_ANSWERS_CONFIG = 'lecture-answers-config.json';

export function lectureAnswersConfigPath(): string {
  return join(getCcHomePath(), LECTURE_ANSWERS_CONFIG);
}

export function answersIndexRoot(courseDir: string): string {
  return join(courseDir, '.canvas-toolchain', 'answers-index');
}

export function chunksDbPath(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'chunks.sqlite');
}

export function vectorsDbPath(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'vectors.sqlite');
}

export function indexMetaPath(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'index-meta.json');
}

export function chunkBodiesDir(courseDir: string): string {
  return join(answersIndexRoot(courseDir), 'chunks');
}

export function defaultSlidesDir(courseDir: string): string {
  return join(courseDir, 'slides');
}

export function defaultCanonicalFaqPath(courseDir: string): string {
  return join(courseDir, 'answers', 'canonical.md');
}
```

- [ ] **Step 4: Write `config.ts`**

```ts
// packages/command-and-control/src/tools/answers/config.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { lectureAnswersConfigPath } from './paths.js';
import type { LectureAnswersConfig } from './types.js';

export function loadLectureAnswersConfig(): LectureAnswersConfig | null {
  const path = lectureAnswersConfigPath();
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as LectureAnswersConfig; }
  catch { return null; }
}

export function saveLectureAnswersConfig(cfg: LectureAnswersConfig): void {
  const path = lectureAnswersConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // atomic rename
  const { renameSync } = require('node:fs') as typeof import('node:fs');
  renameSync(tmp, path);
}
```

- [ ] **Step 5: Test**

```ts
// packages/command-and-control/tests/answers/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLectureAnswersConfig, saveLectureAnswersConfig } from '../../src/tools/answers/config.js';
import { lectureAnswersConfigPath } from '../../src/tools/answers/paths.js';

let ccHome: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
});

describe('lecture answers config', () => {
  it('returns null when no config exists', () => {
    expect(loadLectureAnswersConfig()).toBeNull();
  });

  it('round-trips a config write + read', () => {
    saveLectureAnswersConfig({ provider: 'ollama', model: 'nomic-embed-text' });
    const loaded = loadLectureAnswersConfig();
    expect(loaded).toEqual({ provider: 'ollama', model: 'nomic-embed-text' });
  });

  it('writes with mode 0o600', () => {
    saveLectureAnswersConfig({ provider: 'voyage', voyageApiKey: 'secret' });
    const path = lectureAnswersConfigPath();
    expect(existsSync(path)).toBe(true);
    // On Windows mode bits are advisory but the test should still pass — skip on win32
    if (process.platform !== 'win32') {
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});
```

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- answers/config`
Expected: 3 tests pass.

Build: `cd D:/Dev/canvas-toolchain && npm run build --workspace=packages/command-and-control`
Expected: clean.

- [ ] **Step 6: Commit**

```
feat(cc): foundation — config, paths, shared types for lecture answers bot

Installs better-sqlite3, sqlite-vec, @llamaindex/liteparse. Adds shared
types (EmbeddingProviderInfo, Chunk, IndexMeta, LectureAnswersConfig),
path helpers (per-course storage layout), and atomic 0o600 config writer.
Foundation for all subsequent answers-bot tasks.
```

---

## Phase 1 — Embedding providers

### Task 1.1: Provider interface

**Files:**
- Create: `packages/command-and-control/src/tools/answers/provider/types.ts`

- [ ] **Step 1: Write the interface**

```ts
// packages/command-and-control/src/tools/answers/provider/types.ts

import type { EmbeddingProviderInfo } from '../types.js';

export interface EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  /** Returns one float[] per input string. All vectors must share the same
   *  dimension (info.dimension). Throws if the provider is unreachable. */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** Thrown when the configured provider cannot service a request (network out,
 *  daemon down, etc.). Callers should degrade to keyword-only retrieval. */
export class EmbeddingProviderUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EmbeddingProviderUnavailableError';
  }
}
```

- [ ] **Step 2: Build + commit**

```
feat(cc): EmbeddingProvider interface + EmbeddingProviderUnavailableError

Stable contract every provider implementation honors. Unavailability is a
distinct error type so retrieval layer can pattern-match for keyword-only
fallback.
```

### Task 1.2: Ollama provider

**Files:**
- Create: `packages/command-and-control/src/tools/answers/provider/ollama.ts`
- Create: `packages/command-and-control/tests/answers/provider/ollama.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaEmbeddingProvider } from '../../../src/tools/answers/provider/ollama.js';
import { EmbeddingProviderUnavailableError } from '../../../src/tools/answers/provider/types.js';

afterEach(() => vi.unstubAllGlobals());

describe('OllamaEmbeddingProvider', () => {
  it('embeds via POST /api/embeddings, returns one vector per input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ embedding: new Array(768).fill(0.1) }), { status: 200 })));
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' });
    const vecs = await p.embed(['hello', 'world']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]).toBeInstanceOf(Float32Array);
    expect(vecs[0]!.length).toBe(768);
  });

  it('throws EmbeddingProviderUnavailableError when daemon is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const p = new OllamaEmbeddingProvider({ baseUrl: 'http://localhost:11434', model: 'nomic-embed-text' });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });

  it('detects availability by hitting /api/tags', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const ok = await OllamaEmbeddingProvider.isAvailable('http://localhost:11434');
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Write implementation**

```ts
// packages/command-and-control/src/tools/answers/provider/ollama.ts

import type { EmbeddingProvider } from './types.js';
import { EmbeddingProviderUnavailableError } from './types.js';
import type { EmbeddingProviderInfo } from '../types.js';

const DEFAULT_BASE = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed-text';
const DEFAULT_DIM = 768;

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
  dimension?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  private baseUrl: string;
  private model: string;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.info = { kind: 'ollama', model: this.model, dimension: opts.dimension ?? DEFAULT_DIM };
  }

  static async isAvailable(baseUrl: string = DEFAULT_BASE, timeoutMs = 1500): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch { return false; }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    for (const text of texts) {
      try {
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.model, prompt: text }),
        });
        if (!res.ok) throw new Error(`ollama ${res.status}`);
        const data = await res.json() as { embedding: number[] };
        out.push(new Float32Array(data.embedding));
      } catch (e) {
        throw new EmbeddingProviderUnavailableError(`Ollama unavailable: ${e instanceof Error ? e.message : String(e)}`, e);
      }
    }
    return out;
  }
}
```

- [ ] **Step 3: Run + commit**

```
feat(cc): OllamaEmbeddingProvider — local nomic-embed-text via Ollama HTTP API

isAvailable() pings /api/tags with a 1.5s timeout for fast auto-detection
at setup time. embed() loops POST /api/embeddings per chunk. Wraps all
network/HTTP failures in EmbeddingProviderUnavailableError so retrieval
layer can degrade gracefully.
```

### Task 1.3: transformers.js provider (lazy)

**Files:**
- Create: `packages/command-and-control/src/tools/answers/provider/transformers_js.ts`
- Create: `packages/command-and-control/tests/answers/provider/transformers_js.test.ts`
- Modify: `packages/command-and-control/package.json` (add `@xenova/transformers` as `optionalDependencies`)

- [ ] **Step 1: Add optionalDependencies entry**

In `package.json`:

```json
"optionalDependencies": {
  "@xenova/transformers": "^2.17.0"
}
```

Do NOT install in this task — it's optional. The provider lazy-imports it.

- [ ] **Step 2: Write the provider**

```ts
// packages/command-and-control/src/tools/answers/provider/transformers_js.ts

import type { EmbeddingProvider } from './types.js';
import { EmbeddingProviderUnavailableError } from './types.js';
import type { EmbeddingProviderInfo } from '../types.js';

const DEFAULT_MODEL = 'Xenova/bge-small-en-v1.5';
const DEFAULT_DIM = 384;

export class TransformersJsEmbeddingProvider implements EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  private pipelinePromise: Promise<unknown> | null = null;

  constructor(opts: { model?: string; dimension?: number } = {}) {
    this.info = { kind: 'transformers-js', model: opts.model ?? DEFAULT_MODEL, dimension: opts.dimension ?? DEFAULT_DIM };
  }

  static async isAvailable(): Promise<boolean> {
    try { await import('@xenova/transformers'); return true; }
    catch { return false; }
  }

  private async getPipeline() {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        try {
          const mod = await import('@xenova/transformers') as { pipeline: (task: string, model: string) => Promise<unknown> };
          return await mod.pipeline('feature-extraction', this.info.model);
        } catch (e) {
          throw new EmbeddingProviderUnavailableError(
            `transformers.js unavailable: ${e instanceof Error ? e.message : String(e)} ` +
            `(install with: npm install @xenova/transformers --workspace=packages/command-and-control)`, e);
        }
      })();
    }
    return this.pipelinePromise;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const pipe = await this.getPipeline() as (input: string | string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
    const out: Float32Array[] = [];
    for (const text of texts) {
      const result = await pipe(text, { pooling: 'mean', normalize: true });
      out.push(new Float32Array(result.data));
    }
    return out;
  }
}
```

- [ ] **Step 3: Test (mocks the dynamic import)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { TransformersJsEmbeddingProvider } from '../../../src/tools/answers/provider/transformers_js.js';
import { EmbeddingProviderUnavailableError } from '../../../src/tools/answers/provider/types.js';

describe('TransformersJsEmbeddingProvider', () => {
  it('records 384-dim BGE-small as info by default', () => {
    const p = new TransformersJsEmbeddingProvider();
    expect(p.info.kind).toBe('transformers-js');
    expect(p.info.dimension).toBe(384);
  });

  it('throws EmbeddingProviderUnavailableError when @xenova/transformers is not installed', async () => {
    // We expect this to fail in the CI environment where @xenova/transformers is NOT installed.
    // If a developer happens to have it installed locally, this test is skipped.
    const installed = await TransformersJsEmbeddingProvider.isAvailable();
    if (installed) {
      console.warn('Skipping unavailable-error test — @xenova/transformers IS installed locally.');
      return;
    }
    const p = new TransformersJsEmbeddingProvider();
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });
});
```

- [ ] **Step 4: Run + commit**

```
feat(cc): TransformersJsEmbeddingProvider — bundled BGE-small via lazy import

@xenova/transformers added as optionalDependencies so the install doesn't
require it; provider lazy-imports it on first embed() call. isAvailable()
just attempts the dynamic import. Caches the pipeline across calls.
Throws EmbeddingProviderUnavailableError with install instructions when
the dep is missing.
```

### Task 1.4: Voyage AI provider

**Files:**
- Create: `packages/command-and-control/src/tools/answers/provider/voyage.ts`
- Create: `packages/command-and-control/tests/answers/provider/voyage.test.ts`

- [ ] **Step 1: Write the provider**

```ts
// packages/command-and-control/src/tools/answers/provider/voyage.ts

import type { EmbeddingProvider } from './types.js';
import { EmbeddingProviderUnavailableError } from './types.js';
import type { EmbeddingProviderInfo } from '../types.js';

const DEFAULT_MODEL = 'voyage-3';
const DEFAULT_DIM = 1024;

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly info: EmbeddingProviderInfo;
  private apiKey: string;
  private model: string;

  constructor(opts: { apiKey: string; model?: string; dimension?: number }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.info = { kind: 'voyage', model: this.model, dimension: opts.dimension ?? DEFAULT_DIM };
  }

  static async isAvailable(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ input: 'ping', model: DEFAULT_MODEL }),
      });
      return res.ok;
    } catch { return false; }
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ input: texts, model: this.model }),
      });
      if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text().catch(() => '')}`);
      const data = await res.json() as { data: Array<{ embedding: number[] }> };
      return data.data.map(d => new Float32Array(d.embedding));
    } catch (e) {
      throw new EmbeddingProviderUnavailableError(
        `Voyage unavailable: ${e instanceof Error ? e.message : String(e)}`, e);
    }
  }
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { VoyageEmbeddingProvider } from '../../../src/tools/answers/provider/voyage.js';
import { EmbeddingProviderUnavailableError } from '../../../src/tools/answers/provider/types.js';

afterEach(() => vi.unstubAllGlobals());

describe('VoyageEmbeddingProvider', () => {
  it('batches all inputs in a single POST and returns one vector per input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { embedding: new Array(1024).fill(0.1) },
        { embedding: new Array(1024).fill(0.2) },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new VoyageEmbeddingProvider({ apiKey: 'k' });
    const vecs = await p.embed(['a', 'b']);
    expect(vecs).toHaveLength(2);
    expect(vecs[0]!.length).toBe(1024);
    expect(fetchMock).toHaveBeenCalledTimes(1);  // batched
  });

  it('throws EmbeddingProviderUnavailableError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })));
    const p = new VoyageEmbeddingProvider({ apiKey: 'wrong' });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(EmbeddingProviderUnavailableError);
  });
});
```

- [ ] **Step 3: Run + commit**

```
feat(cc): VoyageEmbeddingProvider — cloud voyage-3, 1024-dim, batched

Single POST per embed() call (Voyage supports input arrays — much cheaper
than per-chunk requests). API key passed via constructor; isAvailable()
sends a ping request to validate the key at setup time. Same error wrapping
as other providers.
```

### Task 1.5: Provider resolver

**Files:**
- Create: `packages/command-and-control/src/tools/answers/provider/resolve.ts`
- Create: `packages/command-and-control/tests/answers/provider/resolve.test.ts`

- [ ] **Step 1: Write the resolver**

```ts
// packages/command-and-control/src/tools/answers/provider/resolve.ts

import type { EmbeddingProvider } from './types.js';
import { OllamaEmbeddingProvider } from './ollama.js';
import { TransformersJsEmbeddingProvider } from './transformers_js.js';
import { VoyageEmbeddingProvider } from './voyage.js';
import { loadLectureAnswersConfig } from '../config.js';

/** Build a provider from saved config. Throws if config is absent. */
export function providerFromConfig(): EmbeddingProvider {
  const cfg = loadLectureAnswersConfig();
  if (!cfg) throw new Error('NO_CONFIG: run setup_lecture_answers first.');
  switch (cfg.provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider({ baseUrl: cfg.ollamaBaseUrl, model: cfg.model });
    case 'transformers-js':
      return new TransformersJsEmbeddingProvider({ model: cfg.model });
    case 'voyage':
      if (!cfg.voyageApiKey) throw new Error('VOYAGE_NO_API_KEY: setup_lecture_answers with provider=voyage requires voyageApiKey.');
      return new VoyageEmbeddingProvider({ apiKey: cfg.voyageApiKey, model: cfg.model });
  }
}

export interface DetectionResult {
  kind: 'ollama' | 'unavailable';
  reason?: string;
}

/** Auto-detect Ollama. Used by setup_lecture_answers when called with no
 *  explicit provider. */
export async function autoDetect(ollamaBaseUrl?: string): Promise<DetectionResult> {
  if (await OllamaEmbeddingProvider.isAvailable(ollamaBaseUrl)) {
    return { kind: 'ollama' };
  }
  return { kind: 'unavailable', reason: `Ollama not reachable at ${ollamaBaseUrl ?? 'http://localhost:11434'}` };
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { providerFromConfig, autoDetect } from '../../../src/tools/answers/provider/resolve.js';
import { OllamaEmbeddingProvider } from '../../../src/tools/answers/provider/ollama.js';
import { VoyageEmbeddingProvider } from '../../../src/tools/answers/provider/voyage.js';

let ccHome: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('providerFromConfig', () => {
  it('throws NO_CONFIG when no config exists', () => {
    expect(() => providerFromConfig()).toThrow(/NO_CONFIG/);
  });

  it('builds Ollama provider from config', () => {
    writeFileSync(join(ccHome, 'lecture-answers-config.json'),
      JSON.stringify({ provider: 'ollama' }), 'utf-8');
    const p = providerFromConfig();
    expect(p).toBeInstanceOf(OllamaEmbeddingProvider);
  });

  it('builds Voyage provider only when apiKey is present', () => {
    writeFileSync(join(ccHome, 'lecture-answers-config.json'),
      JSON.stringify({ provider: 'voyage' }), 'utf-8');
    expect(() => providerFromConfig()).toThrow(/VOYAGE_NO_API_KEY/);
    writeFileSync(join(ccHome, 'lecture-answers-config.json'),
      JSON.stringify({ provider: 'voyage', voyageApiKey: 'k' }), 'utf-8');
    const p = providerFromConfig();
    expect(p).toBeInstanceOf(VoyageEmbeddingProvider);
  });
});

describe('autoDetect', () => {
  it('returns ollama when /api/tags is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const r = await autoDetect();
    expect(r.kind).toBe('ollama');
  });

  it('returns unavailable when /api/tags is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const r = await autoDetect();
    expect(r.kind).toBe('unavailable');
    expect(r.reason).toMatch(/Ollama not reachable/);
  });
});
```

- [ ] **Step 3: Run + commit**

```
feat(cc): provider resolver + autoDetect for lecture answers

providerFromConfig() instantiates whichever provider the saved config names,
with friendly errors for missing config / missing API key. autoDetect()
pings Ollama and returns the result for the setup tool to act on.
```

---

## Phase 2 — Storage layer

### Task 2.1: SQLite store (FTS5 + sqlite-vec) — open, write, read, delete

**Files:**
- Create: `packages/command-and-control/src/tools/answers/store/schema.ts`
- Create: `packages/command-and-control/src/tools/answers/store/store.ts`
- Create: `packages/command-and-control/src/tools/answers/store/index_meta.ts`
- Create: `packages/command-and-control/tests/answers/store/store.test.ts`

- [ ] **Step 1: Schema constants**

```ts
// packages/command-and-control/src/tools/answers/store/schema.ts

export const FTS_TABLE_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  content,
  source UNINDEXED,
  source_path UNINDEXED,
  source_ref UNINDEXED,
  deep_link UNINDEXED
);
`;

export const META_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS chunk_meta (
  chunk_id INTEGER PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_mtime INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunk_meta_source_file ON chunk_meta(source_file);
`;

export function vecTableDdl(dimension: number): string {
  return `
CREATE VIRTUAL TABLE IF NOT EXISTS vec USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[${dimension}]
);
`;
}
```

- [ ] **Step 2: Index meta read/write**

```ts
// packages/command-and-control/src/tools/answers/store/index_meta.ts

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { indexMetaPath } from '../paths.js';
import type { IndexMeta } from '../types.js';

export function readIndexMeta(courseDir: string): IndexMeta | null {
  const path = indexMetaPath(courseDir);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')) as IndexMeta; }
  catch { return null; }
}

export function writeIndexMeta(courseDir: string, meta: IndexMeta): void {
  const path = indexMetaPath(courseDir);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf-8');
  renameSync(tmp, path);
}
```

- [ ] **Step 3: Store wrapper**

```ts
// packages/command-and-control/src/tools/answers/store/store.ts

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { answersIndexRoot, chunkBodiesDir, chunksDbPath, vectorsDbPath } from '../paths.js';
import { FTS_TABLE_DDL, META_TABLE_DDL, vecTableDdl } from './schema.js';
import type { Chunk } from '../types.js';

export interface InsertChunkInput extends Omit<Chunk, 'id'> {
  embedding: Float32Array;
  /** The absolute source file path the chunk came from. Recorded in chunk_meta
   *  so we can later prune all chunks for a file when it changes. */
  sourceFile: string;
  sourceMtime: number;
}

export class AnswersStore {
  private chunksDb: Database.Database;
  private vecDb: Database.Database;

  constructor(private courseDir: string, dimension: number) {
    mkdirSync(answersIndexRoot(courseDir), { recursive: true });
    mkdirSync(chunkBodiesDir(courseDir), { recursive: true });
    this.chunksDb = new Database(chunksDbPath(courseDir));
    this.chunksDb.exec(FTS_TABLE_DDL);
    this.chunksDb.exec(META_TABLE_DDL);
    this.vecDb = new Database(vectorsDbPath(courseDir));
    sqliteVec.load(this.vecDb);
    this.vecDb.exec(vecTableDdl(dimension));
  }

  close(): void {
    this.chunksDb.close();
    this.vecDb.close();
  }

  insertChunks(chunks: InsertChunkInput[]): number[] {
    const ids: number[] = [];
    const insertChunkStmt = this.chunksDb.prepare(
      `INSERT INTO chunks(content, source, source_path, source_ref, deep_link) VALUES (?,?,?,?,?)`,
    );
    const insertMetaStmt = this.chunksDb.prepare(
      `INSERT INTO chunk_meta(chunk_id, source_file, source_mtime) VALUES (?,?,?)`,
    );
    const insertVecStmt = this.vecDb.prepare(
      `INSERT INTO vec(chunk_id, embedding) VALUES (?,?)`,
    );

    const tx = this.chunksDb.transaction((batch: InsertChunkInput[]) => {
      for (const c of batch) {
        const info = insertChunkStmt.run(c.content, c.source, c.sourcePath, c.sourceRef, c.deepLink ?? null);
        const id = Number(info.lastInsertRowid);
        insertMetaStmt.run(id, c.sourceFile, c.sourceMtime);
        insertVecStmt.run(id, Buffer.from(c.embedding.buffer));
        writeFileSync(join(chunkBodiesDir(this.courseDir), `${id}.md`), c.content, 'utf-8');
        ids.push(id);
      }
    });
    tx(chunks);
    return ids;
  }

  /** Remove all chunks (FTS + vec + on-disk markdown) for a given absolute source file path.
   *  Returns the count of rows removed. */
  removeBySourceFile(absSourceFile: string): number {
    const rows = this.chunksDb.prepare(`SELECT chunk_id FROM chunk_meta WHERE source_file = ?`).all(absSourceFile) as Array<{ chunk_id: number }>;
    if (rows.length === 0) return 0;
    const ids = rows.map(r => r.chunk_id);
    const placeholders = ids.map(() => '?').join(',');
    this.chunksDb.prepare(`DELETE FROM chunks WHERE ROWID IN (${placeholders})`).run(...ids);
    this.chunksDb.prepare(`DELETE FROM chunk_meta WHERE chunk_id IN (${placeholders})`).run(...ids);
    this.vecDb.prepare(`DELETE FROM vec WHERE chunk_id IN (${placeholders})`).run(...ids);
    for (const id of ids) {
      try { rmSync(join(chunkBodiesDir(this.courseDir), `${id}.md`), { force: true }); } catch { /* ignore */ }
    }
    return ids.length;
  }

  /** Read a chunk's full record by id. */
  getChunk(id: number): Chunk | null {
    const row = this.chunksDb.prepare(
      `SELECT ROWID as id, content, source, source_path, source_ref, deep_link FROM chunks WHERE ROWID = ?`,
    ).get(id) as { id: number; content: string; source: string; source_path: string; source_ref: string; deep_link: string | null } | undefined;
    if (!row) return null;
    return {
      id: row.id, content: row.content,
      source: row.source as Chunk['source'],
      sourcePath: row.source_path, sourceRef: row.source_ref,
      deepLink: row.deep_link,
    };
  }

  /** FTS5 BM25 search. Returns top-K chunk ids + scores. */
  searchKeyword(query: string, k: number): Array<{ id: number; score: number }> {
    const rows = this.chunksDb.prepare(
      `SELECT ROWID as id, bm25(chunks) as score FROM chunks WHERE chunks MATCH ? ORDER BY score LIMIT ?`,
    ).all(query, k) as Array<{ id: number; score: number }>;
    return rows;
  }

  /** Cosine-similarity vector search. Returns top-K chunk ids + distances. */
  searchVector(vector: Float32Array, k: number): Array<{ id: number; score: number }> {
    const buf = Buffer.from(vector.buffer);
    const rows = this.vecDb.prepare(
      `SELECT chunk_id as id, distance as score FROM vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
    ).all(buf, k) as Array<{ id: number; score: number }>;
    return rows;
  }
}

export function destroyIndex(courseDir: string): void {
  const root = answersIndexRoot(courseDir);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}
```

- [ ] **Step 4: Test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnswersStore, destroyIndex } from '../../../src/tools/answers/store/store.js';
import { chunkBodiesDir } from '../../../src/tools/answers/paths.js';

let courseDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
});

afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
});

function vec(d: number, fill: number): Float32Array {
  return new Float32Array(new Array(d).fill(fill));
}

describe('AnswersStore', () => {
  it('inserts chunks across FTS + vec + chunks/ dir; readable by id', () => {
    const store = new AnswersStore(courseDir, 4);
    const ids = store.insertChunks([
      { content: 'hello world', source: 'transcript', sourcePath: 'lecture.md',
        sourceRef: '00:00:12', deepLink: 'https://x/y?t=12',
        embedding: vec(4, 0.1), sourceFile: '/abs/path/lecture.md', sourceMtime: 1000 },
    ]);
    expect(ids).toHaveLength(1);
    const got = store.getChunk(ids[0]!);
    expect(got?.content).toBe('hello world');
    expect(got?.deepLink).toBe('https://x/y?t=12');
    expect(existsSync(join(chunkBodiesDir(courseDir), `${ids[0]}.md`))).toBe(true);
    store.close();
  });

  it('removeBySourceFile drops FTS + vec + meta + on-disk markdown', () => {
    const store = new AnswersStore(courseDir, 4);
    const ids = store.insertChunks([
      { content: 'a', source: 'cds', sourcePath: 'p1.md', sourceRef: '#h', deepLink: null,
        embedding: vec(4, 0.1), sourceFile: '/abs/p1.md', sourceMtime: 1 },
      { content: 'b', source: 'cds', sourcePath: 'p2.md', sourceRef: '#h', deepLink: null,
        embedding: vec(4, 0.2), sourceFile: '/abs/p2.md', sourceMtime: 1 },
    ]);
    const removed = store.removeBySourceFile('/abs/p1.md');
    expect(removed).toBe(1);
    expect(store.getChunk(ids[0]!)).toBeNull();
    expect(store.getChunk(ids[1]!)).not.toBeNull();
    expect(existsSync(join(chunkBodiesDir(courseDir), `${ids[0]}.md`))).toBe(false);
    expect(existsSync(join(chunkBodiesDir(courseDir), `${ids[1]}.md`))).toBe(true);
    store.close();
  });

  it('FTS5 keyword search returns matches ranked by bm25', () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([
      { content: 'VLOOKUP is for vertical lookups', source: 'transcript', sourcePath: 'a.md', sourceRef: '00:01', deepLink: null,
        embedding: vec(4, 0.1), sourceFile: '/a', sourceMtime: 1 },
      { content: 'photosynthesis happens in plants', source: 'transcript', sourcePath: 'b.md', sourceRef: '00:01', deepLink: null,
        embedding: vec(4, 0.2), sourceFile: '/b', sourceMtime: 1 },
    ]);
    const hits = store.searchKeyword('VLOOKUP', 5);
    expect(hits.length).toBeGreaterThan(0);
    const first = store.getChunk(hits[0]!.id);
    expect(first?.content).toMatch(/VLOOKUP/);
    store.close();
  });

  it('vector search returns nearest by cosine distance', () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([
      { content: 'A', source: 'cds', sourcePath: 'a.md', sourceRef: '#', deepLink: null,
        embedding: new Float32Array([1, 0, 0, 0]), sourceFile: '/a', sourceMtime: 1 },
      { content: 'B', source: 'cds', sourcePath: 'b.md', sourceRef: '#', deepLink: null,
        embedding: new Float32Array([0, 1, 0, 0]), sourceFile: '/b', sourceMtime: 1 },
    ]);
    const hits = store.searchVector(new Float32Array([0.99, 0.01, 0, 0]), 2);
    expect(hits.length).toBe(2);
    expect(store.getChunk(hits[0]!.id)?.content).toBe('A');
    store.close();
  });

  it('destroyIndex wipes the answers-index dir', () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([{
      content: 'x', source: 'cds', sourcePath: 'a.md', sourceRef: '#', deepLink: null,
      embedding: vec(4, 0.1), sourceFile: '/a', sourceMtime: 1,
    }]);
    store.close();
    destroyIndex(courseDir);
    expect(existsSync(join(courseDir, '.canvas-toolchain', 'answers-index'))).toBe(false);
  });
});
```

Run: `npm test --workspace=packages/command-and-control -- answers/store`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```
feat(cc): AnswersStore — SQLite FTS5 + sqlite-vec hybrid storage

One AnswersStore per courseDir manages two SQLite files: chunks.sqlite
(FTS5 virtual table + chunk_meta sidecar) and vectors.sqlite (sqlite-vec
vec0 virtual table). Provides insertChunks (single transaction across
both DBs + on-disk markdown body), removeBySourceFile (re-index churn),
getChunk, searchKeyword (BM25), searchVector (cosine distance).
destroyIndex removes the whole answers-index dir for full rebuilds.
```

---

## Phase 3 — Chunking strategies

### Task 3.1: Transcript chunker (timestamp-aware)

**Files:**
- Create: `packages/command-and-control/src/tools/answers/chunking/transcript.ts`
- Create: `packages/command-and-control/tests/answers/chunking/transcript.test.ts`

- [ ] **Step 1: Implement chunker**

```ts
// packages/command-and-control/src/tools/answers/chunking/transcript.ts

import matter from 'gray-matter';

export interface TranscriptChunk {
  content: string;
  startSeconds: number;     // first timestamp inside the chunk
  endSeconds: number;       // last timestamp inside the chunk
  deepLink: string | null;  // rendered from frontmatter.deepLinkTemplate, null if absent
}

export interface TranscriptFrontmatter {
  sourcePlatform?: string;
  sourceId?: string;
  deepLinkTemplate?: string;
  title?: string;
  recordedAt?: string;
  durationSeconds?: number;
}

const TARGET_TOKENS = 300;   // rough — measured by whitespace splits
const HARD_MAX_TOKENS = 500;

function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return Number(parts[0]);
}

export function parseTranscript(raw: string): { frontmatter: TranscriptFrontmatter; body: string } {
  const parsed = matter(raw);
  return { frontmatter: parsed.data as TranscriptFrontmatter, body: parsed.content };
}

/** Split a body of `[HH:MM:SS] line ...` lines into ~TARGET_TOKENS chunks,
 *  rendering deep-link URLs from the frontmatter template. */
export function chunkTranscript(raw: string): TranscriptChunk[] {
  const { frontmatter, body } = parseTranscript(raw);
  const lineRegex = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s?(.*)$/;
  const lines = body.split(/\r?\n/).map(l => {
    const m = lineRegex.exec(l);
    if (!m) return null;
    return { ts: timestampToSeconds(m[1]!), text: m[2]! };
  }).filter((x): x is { ts: number; text: string } => x !== null);

  const chunks: TranscriptChunk[] = [];
  let buf: { ts: number; text: string }[] = [];
  let tokens = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const start = buf[0]!.ts;
    const end = buf[buf.length - 1]!.ts;
    const content = buf.map(l => `[${formatHMS(l.ts)}] ${l.text}`).join('\n');
    chunks.push({
      content, startSeconds: start, endSeconds: end,
      deepLink: renderDeepLink(frontmatter, start),
    });
    buf = []; tokens = 0;
  };

  for (const l of lines) {
    const lt = l.text.split(/\s+/).length;
    if (tokens + lt > HARD_MAX_TOKENS && buf.length > 0) flush();
    buf.push(l);
    tokens += lt;
    if (tokens >= TARGET_TOKENS) flush();
  }
  flush();
  return chunks;
}

function formatHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function renderDeepLink(fm: TranscriptFrontmatter, startSeconds: number): string | null {
  if (!fm.deepLinkTemplate || !fm.sourceId) return null;
  return fm.deepLinkTemplate
    .replace('{sourceId}', fm.sourceId)
    .replace('{startSeconds}', String(startSeconds));
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect } from 'vitest';
import { chunkTranscript, parseTranscript } from '../../../src/tools/answers/chunking/transcript.js';

const SAMPLE = `---
sourcePlatform: panopto
sourceId: abc-123
deepLinkTemplate: "https://bsu.hosted.panopto.com/Pages/Viewer.aspx?id={sourceId}&start={startSeconds}"
title: "Week 03 - VLOOKUP"
---

[00:00:00] welcome to week three.
[00:00:12] today we cover VLOOKUP.
[00:00:30] which is for vertical lookups.
[00:02:15] now lets do an example.
`;

describe('parseTranscript', () => {
  it('splits frontmatter from body', () => {
    const { frontmatter, body } = parseTranscript(SAMPLE);
    expect(frontmatter.sourcePlatform).toBe('panopto');
    expect(body).toMatch(/\[00:00:00\]/);
  });
});

describe('chunkTranscript', () => {
  it('emits at least one chunk with start/end seconds and rendered deep link', () => {
    const chunks = chunkTranscript(SAMPLE);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const first = chunks[0]!;
    expect(first.startSeconds).toBe(0);
    expect(first.deepLink).toBe('https://bsu.hosted.panopto.com/Pages/Viewer.aspx?id=abc-123&start=0');
  });

  it('emits null deepLink when template is absent', () => {
    const noTemplate = SAMPLE.replace(/deepLinkTemplate:.*$/m, '');
    const chunks = chunkTranscript(noTemplate);
    expect(chunks[0]!.deepLink).toBeNull();
  });
});
```

If `gray-matter` is not yet a dep: `npm install gray-matter --workspace=packages/command-and-control` and add to step-2 test setup.

- [ ] **Step 3: Run + commit**

```
feat(cc): transcript chunker — timestamp-aware splits + deep-link rendering

Parses the .enriched.md frontmatter (sourcePlatform, sourceId,
deepLinkTemplate). Splits transcript body on [HH:MM:SS] lines into
~300-token chunks. Each chunk records start/end seconds; deepLink is
rendered from the frontmatter template via {sourceId}/{startSeconds}
substitution.
```

### Task 3.2: CDS markdown chunker (heading-aware)

**Files:**
- Create: `packages/command-and-control/src/tools/answers/chunking/markdown.ts`
- Create: `packages/command-and-control/tests/answers/chunking/markdown.test.ts`

- [ ] **Step 1: Implement**

```ts
// packages/command-and-control/src/tools/answers/chunking/markdown.ts

import matter from 'gray-matter';

export interface MarkdownChunk {
  content: string;
  headingPath: string;  // e.g. "Week 3 > Activities > Submit"
}

const TARGET_TOKENS = 400;
const HARD_MAX_TOKENS = 700;

export function chunkMarkdown(raw: string): MarkdownChunk[] {
  const { content } = matter(raw);
  const lines = content.split(/\r?\n/);

  type Section = { headingPath: string[]; lines: string[] };
  const sections: Section[] = [];
  const stack: string[] = [];
  let current: Section | null = null;

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      const level = m[1]!.length;
      const text = m[2]!.trim();
      while (stack.length >= level) stack.pop();
      stack.push(text);
      if (current) sections.push(current);
      current = { headingPath: [...stack], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  const chunks: MarkdownChunk[] = [];
  for (const s of sections) {
    const text = s.lines.join('\n').trim();
    if (!text) continue;
    const tokens = text.split(/\s+/).length;
    const headingPath = s.headingPath.join(' > ');
    if (tokens <= HARD_MAX_TOKENS) {
      chunks.push({ content: text, headingPath });
    } else {
      // very long section — split on blank lines, then merge to TARGET
      const paragraphs = text.split(/\n\s*\n/);
      let buf: string[] = [];
      let toks = 0;
      for (const p of paragraphs) {
        const pt = p.split(/\s+/).length;
        if (toks + pt > HARD_MAX_TOKENS && buf.length > 0) {
          chunks.push({ content: buf.join('\n\n'), headingPath });
          buf = []; toks = 0;
        }
        buf.push(p); toks += pt;
        if (toks >= TARGET_TOKENS) {
          chunks.push({ content: buf.join('\n\n'), headingPath });
          buf = []; toks = 0;
        }
      }
      if (buf.length > 0) chunks.push({ content: buf.join('\n\n'), headingPath });
    }
  }
  return chunks;
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from '../../../src/tools/answers/chunking/markdown.js';

describe('chunkMarkdown', () => {
  it('splits on heading boundaries; preserves heading path', () => {
    const src = `---
week: 3
---
# Week 3

## Learning Goals

Students will learn VLOOKUP.

## Activities

Submit via Canvas.
`;
    const chunks = chunkMarkdown(src);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.headingPath).toBe('Week 3 > Learning Goals');
    expect(chunks[0]!.content).toContain('VLOOKUP');
    expect(chunks[1]!.headingPath).toBe('Week 3 > Activities');
  });

  it('splits a very long single section on paragraph boundaries', () => {
    const longParas = Array.from({ length: 20 }, (_, i) =>
      'word '.repeat(60) + `(paragraph ${i})`).join('\n\n');
    const chunks = chunkMarkdown(`# H\n\n${longParas}`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(c => c.headingPath === 'H')).toBe(true);
  });
});
```

- [ ] **Step 3: Run + commit**

```
feat(cc): markdown chunker — heading-aware splits with heading path

Walks the document, builds a stack of heading levels, emits one chunk per
leaf section. Very long sections are split on paragraph boundaries while
preserving the heading path. Frontmatter stripped via gray-matter.
```

### Task 3.3: Canonical FAQ chunker

**Files:**
- Create: `packages/command-and-control/src/tools/answers/chunking/canonical.ts`
- Create: `packages/command-and-control/tests/answers/chunking/canonical.test.ts`

- [ ] **Step 1: Implement**

```ts
// packages/command-and-control/src/tools/answers/chunking/canonical.ts

export interface CanonicalChunk {
  question: string;
  content: string;  // includes question heading line for context
}

/** Splits canonical.md into one chunk per ## section. Each chunk's content
 *  includes the question heading + the body up to the next ##. */
export function chunkCanonical(raw: string): CanonicalChunk[] {
  const lines = raw.split(/\r?\n/);
  const chunks: CanonicalChunk[] = [];
  let currentQ: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentQ === null) return;
    const body = buf.join('\n').trim();
    if (body || currentQ) {
      chunks.push({ question: currentQ, content: `## ${currentQ}\n\n${body}` });
    }
  };

  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      flush();
      currentQ = m[1]!.trim();
      buf = [];
    } else if (currentQ !== null) {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect } from 'vitest';
import { chunkCanonical } from '../../../src/tools/answers/chunking/canonical.js';

describe('chunkCanonical', () => {
  it('emits one chunk per ## section', () => {
    const src = `# Canonical FAQ

## How is the final project graded?

40% rubric, 60% peer eval.

## When does the lowest quiz drop?

Auto-drops at semester end.
`;
    const chunks = chunkCanonical(src);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.question).toBe('How is the final project graded?');
    expect(chunks[0]!.content).toContain('40% rubric');
    expect(chunks[1]!.question).toMatch(/lowest quiz/);
  });

  it('returns empty when no ## sections present', () => {
    expect(chunkCanonical('# only h1\n\ncontent')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run + commit**

```
feat(cc): canonical FAQ chunker — one chunk per H2 question/answer pair

Splits canonical.md on ## boundaries. Each chunk's content embeds the
question heading so retrieval shows the full Q&A in context.
```

### Task 3.4: Slide PDF chunker (LiteParse)

**Files:**
- Create: `packages/command-and-control/src/tools/answers/chunking/slide_pdf.ts`
- Create: `packages/command-and-control/tests/answers/chunking/slide_pdf.test.ts`
- Create: `packages/command-and-control/tests/fixtures/answers/sample-slides.pdf` (a tiny 2-page PDF, copy from `packages/canvas-design-studio/tests/fixtures/` if a PDF fixture exists; otherwise generate via the implementer's choice — must be 2+ pages with detectable text)

- [ ] **Step 1: Implement**

```ts
// packages/command-and-control/src/tools/answers/chunking/slide_pdf.ts

import { readFile } from 'node:fs/promises';

export interface SlideChunk {
  page: number;        // 1-indexed
  content: string;     // extracted text for that page
}

/** Parses a PDF and emits one SlideChunk per page. Pages with no extractable
 *  text are skipped. Uses LiteParse under the hood (lazy-imported to avoid
 *  loading until needed). */
export async function chunkSlidePdf(pdfPath: string): Promise<SlideChunk[]> {
  const { parsePdfBuffer } = await import('./_liteparse_shim.js');
  const buf = await readFile(pdfPath);
  const pages = await parsePdfBuffer(buf);
  return pages
    .map((text, i) => ({ page: i + 1, content: text.trim() }))
    .filter(s => s.content.length > 0);
}
```

```ts
// packages/command-and-control/src/tools/answers/chunking/_liteparse_shim.ts
// Thin wrapper around @llamaindex/liteparse. Isolated so tests can mock if needed
// and so the LiteParse-specific API doesn't leak into the chunker.

export async function parsePdfBuffer(buf: Buffer): Promise<string[]> {
  const { parse } = await import('@llamaindex/liteparse');
  const result = await parse(buf, { format: 'text' });
  // LiteParse returns { pages: Array<{ text: string }> } per its current contract.
  // Adapt here if the shape differs in the installed version.
  if (Array.isArray((result as any).pages)) {
    return (result as any).pages.map((p: any) => String(p.text ?? ''));
  }
  // Fallback: treat as single-page document.
  return [String((result as any).text ?? '')];
}
```

- [ ] **Step 2: Test (uses a real fixture PDF)**

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chunkSlidePdf } from '../../../src/tools/answers/chunking/slide_pdf.js';

const FIXTURE = join(__dirname, '..', '..', 'fixtures', 'answers', 'sample-slides.pdf');

describe('chunkSlidePdf', () => {
  it('emits one SlideChunk per non-empty page', async () => {
    if (!existsSync(FIXTURE)) {
      console.warn('Skipping — fixture PDF missing at ' + FIXTURE);
      return;
    }
    const chunks = await chunkSlidePdf(FIXTURE);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.page).toBe(1);
    expect(typeof chunks[0]!.content).toBe('string');
    expect(chunks[0]!.content.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run + commit**

```
feat(cc): slide PDF chunker — one chunk per page via LiteParse

Lazy-imports @llamaindex/liteparse via a thin shim so the LiteParse-specific
API doesn't leak into the chunker. Emits one SlideChunk per non-empty page
with 1-indexed page numbers used for citation refs.
```

---

## Phase 4 — Ingestion orchestrator

### Task 4.1: Discovery + per-source ingest functions + orchestrator

**Files:**
- Create: `packages/command-and-control/src/tools/answers/ingest/discover.ts`
- Create: `packages/command-and-control/src/tools/answers/ingest/orchestrator.ts`
- Create: `packages/command-and-control/tests/answers/ingest/orchestrator.test.ts`

- [ ] **Step 1: Discover**

```ts
// packages/command-and-control/src/tools/answers/ingest/discover.ts

import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { defaultCanonicalFaqPath, defaultSlidesDir } from '../paths.js';

export interface DiscoveredSources {
  transcripts: string[];   // absolute paths to *.enriched.md
  cdsMarkdown: string[];   // absolute paths to *.md inside courseDir (excl. .canvas-toolchain, node_modules, dist)
  slidePdfs: string[];     // absolute paths to *.pdf in courseDir/slides
  canonical: string | null; // absolute path or null
}

const SKIP_DIRS = new Set(['.canvas-toolchain', 'node_modules', 'dist', '.git']);

function walkMarkdown(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walkMarkdown(full, out);
    } else if (extname(entry) === '.md' && !entry.endsWith('.enriched.md')) {
      out.push(full);
    }
  }
}

function walkPdf(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkPdf(full, out);
    else if (extname(entry).toLowerCase() === '.pdf') out.push(full);
  }
}

function walkTranscripts(root: string, out: string[]): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkTranscripts(full, out);
    else if (entry.endsWith('.enriched.md')) out.push(full);
  }
}

export function discoverSources(courseDir: string, transcriptSources: string[]): DiscoveredSources {
  const transcripts: string[] = [];
  for (const src of transcriptSources) walkTranscripts(src, transcripts);

  const cdsMarkdown: string[] = [];
  walkMarkdown(courseDir, cdsMarkdown);

  const slidePdfs: string[] = [];
  walkPdf(defaultSlidesDir(courseDir), slidePdfs);

  const canonicalPath = defaultCanonicalFaqPath(courseDir);
  const canonical = existsSync(canonicalPath) ? canonicalPath : null;

  return { transcripts, cdsMarkdown, slidePdfs, canonical };
}
```

- [ ] **Step 2: Orchestrator**

```ts
// packages/command-and-control/src/tools/answers/ingest/orchestrator.ts

import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { AnswersStore, destroyIndex } from '../store/store.js';
import { readIndexMeta, writeIndexMeta } from '../store/index_meta.js';
import { discoverSources } from './discover.js';
import { chunkTranscript } from '../chunking/transcript.js';
import { chunkMarkdown } from '../chunking/markdown.js';
import { chunkCanonical } from '../chunking/canonical.js';
import { chunkSlidePdf } from '../chunking/slide_pdf.js';
import type { EmbeddingProvider } from '../provider/types.js';
import type { Chunk, IndexMeta } from '../types.js';

export interface IngestInput {
  courseId: number;
  courseDir: string;
  transcriptSources: string[];
  provider: EmbeddingProvider;
  rebuild: boolean;
}

export interface IngestResult {
  filesScanned: number;
  filesIndexed: number;     // files whose chunks were re-embedded
  chunksTotal: number;
  chunksAdded: number;
  chunksRemoved: number;
  warnings: string[];
}

interface PendingChunk extends Omit<Chunk, 'id'> {
  sourceFile: string;
  sourceMtime: number;
}

export async function ingestCourse(input: IngestInput): Promise<IngestResult> {
  const { courseId, courseDir, transcriptSources, provider, rebuild } = input;
  const warnings: string[] = [];

  if (rebuild) destroyIndex(courseDir);

  const existingMeta = rebuild ? null : readIndexMeta(courseDir);
  if (existingMeta && existingMeta.provider.dimension !== provider.info.dimension) {
    warnings.push(`Index built with dimension ${existingMeta.provider.dimension}; current provider is ${provider.info.dimension}. Forcing rebuild.`);
    destroyIndex(courseDir);
  }

  const store = new AnswersStore(courseDir, provider.info.dimension);
  try {
    const sources = discoverSources(courseDir, transcriptSources);
    const allFiles = [...sources.transcripts, ...sources.cdsMarkdown, ...sources.slidePdfs];
    if (sources.canonical) allFiles.push(sources.canonical);
    const meta: IndexMeta = existingMeta && existingMeta.provider.dimension === provider.info.dimension
      ? existingMeta
      : { courseId, provider: provider.info, lastIndexedAt: new Date(0).toISOString(),
          transcriptSources, sourceFiles: {} };

    let filesIndexed = 0;
    let chunksAdded = 0;
    let chunksRemoved = 0;

    // Remove chunks for files that were removed from disk since last index
    for (const knownFile of Object.keys(meta.sourceFiles)) {
      if (!allFiles.includes(knownFile)) {
        chunksRemoved += store.removeBySourceFile(knownFile);
        delete meta.sourceFiles[knownFile];
      }
    }

    // For each present file, re-index if changed
    for (const file of allFiles) {
      let mtime: number;
      try { mtime = statSync(file).mtimeMs; }
      catch (e) { warnings.push(`Skipping ${file}: ${e instanceof Error ? e.message : String(e)}`); continue; }
      const prior = meta.sourceFiles[file];
      if (prior && prior.mtime === mtime) continue;

      // remove any prior chunks for this file
      if (prior) chunksRemoved += store.removeBySourceFile(file);

      // chunk + embed + insert
      let pending: PendingChunk[];
      try {
        if (sources.transcripts.includes(file)) {
          pending = await ingestTranscript(file, mtime, courseDir);
        } else if (sources.cdsMarkdown.includes(file)) {
          pending = ingestCdsMarkdown(file, mtime, courseDir);
        } else if (sources.slidePdfs.includes(file)) {
          pending = await ingestSlidePdf(file, mtime, courseDir);
        } else if (sources.canonical === file) {
          pending = ingestCanonical(file, mtime, courseDir);
        } else continue;
      } catch (e) {
        warnings.push(`Failed to chunk ${file}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      if (pending.length === 0) { meta.sourceFiles[file] = { mtime, chunkCount: 0 }; continue; }

      let embeddings: Float32Array[];
      try { embeddings = await provider.embed(pending.map(p => p.content)); }
      catch (e) {
        warnings.push(`Embedding failed for ${file}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const toInsert = pending.map((p, i) => ({ ...p, embedding: embeddings[i]! }));
      store.insertChunks(toInsert);
      chunksAdded += toInsert.length;
      filesIndexed++;
      meta.sourceFiles[file] = { mtime, chunkCount: pending.length };
    }

    meta.lastIndexedAt = new Date().toISOString();
    meta.transcriptSources = transcriptSources;
    writeIndexMeta(courseDir, meta);

    const chunksTotal = Object.values(meta.sourceFiles).reduce((s, x) => s + x.chunkCount, 0);
    return { filesScanned: allFiles.length, filesIndexed, chunksTotal, chunksAdded, chunksRemoved, warnings };
  } finally {
    store.close();
  }
}

async function ingestTranscript(file: string, mtime: number, courseDir: string): Promise<PendingChunk[]> {
  const raw = readFileSync(file, 'utf-8');
  const chunks = chunkTranscript(raw);
  const rel = relative(courseDir, file) || file;
  return chunks.map(c => ({
    content: c.content, source: 'transcript' as const, sourcePath: rel,
    sourceRef: formatHMS(c.startSeconds), deepLink: c.deepLink,
    sourceFile: file, sourceMtime: mtime,
  }));
}

function ingestCdsMarkdown(file: string, mtime: number, courseDir: string): PendingChunk[] {
  const raw = readFileSync(file, 'utf-8');
  const chunks = chunkMarkdown(raw);
  const rel = relative(courseDir, file);
  return chunks.map(c => ({
    content: c.content, source: 'cds' as const, sourcePath: rel,
    sourceRef: c.headingPath ? `#${c.headingPath}` : '#',
    deepLink: null, sourceFile: file, sourceMtime: mtime,
  }));
}

async function ingestSlidePdf(file: string, mtime: number, courseDir: string): Promise<PendingChunk[]> {
  const chunks = await chunkSlidePdf(file);
  const rel = relative(courseDir, file);
  return chunks.map(c => ({
    content: c.content, source: 'slide' as const, sourcePath: rel,
    sourceRef: `p.${c.page}`, deepLink: null, sourceFile: file, sourceMtime: mtime,
  }));
}

function ingestCanonical(file: string, mtime: number, courseDir: string): PendingChunk[] {
  const raw = readFileSync(file, 'utf-8');
  const chunks = chunkCanonical(raw);
  const rel = relative(courseDir, file);
  return chunks.map(c => ({
    content: c.content, source: 'canonical' as const, sourcePath: rel,
    sourceRef: `## ${c.question}`, deepLink: null,
    sourceFile: file, sourceMtime: mtime,
  }));
}

function formatHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}
```

- [ ] **Step 3: Test (uses a fake provider to keep tests fast + offline)**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ingestCourse } from '../../../src/tools/answers/ingest/orchestrator.js';
import { readIndexMeta } from '../../../src/tools/answers/store/index_meta.js';
import type { EmbeddingProvider } from '../../../src/tools/answers/provider/types.js';

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'fake', dimension: 4 };
  async embed(texts: string[]) { return texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])); }
}

let courseDir: string;
let transcriptDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  transcriptDir = mkdtempSync(join(tmpdir(), 'tx-'));
});

afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
});

describe('ingestCourse', () => {
  it('indexes a fresh corpus end-to-end and writes index-meta', async () => {
    writeFileSync(join(transcriptDir, 'week01.enriched.md'), `---
sourcePlatform: panopto
sourceId: abc
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hello
[00:00:30] world
`);
    mkdirSync(join(courseDir, 'week-01'), { recursive: true });
    writeFileSync(join(courseDir, 'week-01', 'overview.md'), `# Week 1\n## Goals\nlearn things`);
    mkdirSync(join(courseDir, 'answers'), { recursive: true });
    writeFileSync(join(courseDir, 'answers', 'canonical.md'), `## How is grading done?\nWeighted average.`);

    const provider = new FakeProvider();
    const result = await ingestCourse({
      courseId: 48894, courseDir, transcriptSources: [transcriptDir],
      provider, rebuild: false,
    });

    expect(result.filesScanned).toBeGreaterThanOrEqual(3);
    expect(result.chunksAdded).toBeGreaterThanOrEqual(3);
    const meta = readIndexMeta(courseDir);
    expect(meta).not.toBeNull();
    expect(meta!.provider.dimension).toBe(4);
  });

  it('incremental re-index skips unchanged files', async () => {
    writeFileSync(join(transcriptDir, 'lec.enriched.md'),
      `---
sourcePlatform: panopto
sourceId: x
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hi
`);
    const provider = new FakeProvider();
    const first = await ingestCourse({
      courseId: 1, courseDir, transcriptSources: [transcriptDir],
      provider, rebuild: false,
    });
    const second = await ingestCourse({
      courseId: 1, courseDir, transcriptSources: [transcriptDir],
      provider, rebuild: false,
    });
    expect(second.filesIndexed).toBe(0);
    expect(second.chunksAdded).toBe(0);
    expect(second.chunksTotal).toBe(first.chunksTotal);
  });

  it('detects + removes chunks for deleted source files', async () => {
    const f = join(transcriptDir, 'gone.enriched.md');
    writeFileSync(f, `---
sourcePlatform: panopto
sourceId: x
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hi
`);
    const provider = new FakeProvider();
    await ingestCourse({ courseId: 1, courseDir, transcriptSources: [transcriptDir], provider, rebuild: false });
    rmSync(f);
    const second = await ingestCourse({ courseId: 1, courseDir, transcriptSources: [transcriptDir], provider, rebuild: false });
    expect(second.chunksRemoved).toBeGreaterThan(0);
  });

  it('rebuild=true wipes and re-indexes', async () => {
    writeFileSync(join(transcriptDir, 'a.enriched.md'),
      `---
sourcePlatform: panopto
sourceId: x
deepLinkTemplate: "https://x/{sourceId}?t={startSeconds}"
---
[00:00:00] hi
`);
    const provider = new FakeProvider();
    await ingestCourse({ courseId: 1, courseDir, transcriptSources: [transcriptDir], provider, rebuild: false });
    const second = await ingestCourse({
      courseId: 1, courseDir, transcriptSources: [transcriptDir], provider, rebuild: true,
    });
    expect(second.filesIndexed).toBeGreaterThan(0);
    expect(second.chunksAdded).toBeGreaterThan(0);
  });
});
```

Run + build. 4 tests should pass.

- [ ] **Step 4: Commit**

```
feat(cc): ingestion orchestrator — discovery, mtime delta, per-source dispatch

discoverSources() walks transcript dirs, courseDir markdown, slides/ PDFs,
and the canonical FAQ. ingestCourse() compares mtimes to index-meta,
re-embeds only changed files, removes chunks for deleted files, supports
rebuild flag. Per-source-type helper functions dispatch to the correct
chunker and tag chunks with source + sourceRef + (optional) deepLink.
```

---

## Phase 5 — Hybrid retrieval

### Task 5.1: FTS5 + vec + RRF + canonical boost

**Files:**
- Create: `packages/command-and-control/src/tools/answers/retrieval/hybrid.ts`
- Create: `packages/command-and-control/tests/answers/retrieval/hybrid.test.ts`

- [ ] **Step 1: Implement**

```ts
// packages/command-and-control/src/tools/answers/retrieval/hybrid.ts

import { AnswersStore } from '../store/store.js';
import type { EmbeddingProvider } from '../provider/types.js';
import { EmbeddingProviderUnavailableError } from '../provider/types.js';
import type { Chunk } from '../types.js';

export interface HybridRetrievalInput {
  question: string;
  k: number;
  store: AnswersStore;
  provider: EmbeddingProvider | null;  // null forces keyword-only
  canonicalBoost?: number;             // default 0.3
  rrfK?: number;                       // default 60
}

export interface HybridRetrievalResult {
  chunks: Array<{ chunk: Chunk; score: number }>;
  mode: 'hybrid' | 'keyword-only';
  warnings: string[];
}

export async function hybridRetrieve(input: HybridRetrievalInput): Promise<HybridRetrievalResult> {
  const k = input.k;
  const rrfK = input.rrfK ?? 60;
  const boost = input.canonicalBoost ?? 0.3;
  const warnings: string[] = [];

  const fts = input.store.searchKeyword(escapeFts(input.question), k * 2);
  let vec: Array<{ id: number; score: number }> = [];
  let mode: 'hybrid' | 'keyword-only' = 'keyword-only';
  if (input.provider) {
    try {
      const [qVec] = await input.provider.embed([input.question]);
      vec = input.store.searchVector(qVec!, k * 2);
      mode = 'hybrid';
    } catch (e) {
      if (e instanceof EmbeddingProviderUnavailableError) {
        warnings.push(`Embedding provider unavailable; degraded to keyword-only. (${e.message})`);
      } else {
        warnings.push(`Vector search failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const ranks = new Map<number, { ftsRank: number | null; vecRank: number | null }>();
  fts.forEach((h, i) => {
    ranks.set(h.id, { ftsRank: i + 1, vecRank: null });
  });
  vec.forEach((h, i) => {
    const e = ranks.get(h.id);
    if (e) e.vecRank = i + 1;
    else ranks.set(h.id, { ftsRank: null, vecRank: i + 1 });
  });

  const scored: Array<{ id: number; score: number }> = [];
  for (const [id, r] of ranks) {
    let s = 0;
    if (r.ftsRank !== null) s += 1 / (rrfK + r.ftsRank);
    if (r.vecRank !== null) s += 1 / (rrfK + r.vecRank);
    scored.push({ id, score: s });
  }

  // Canonical boost applied AFTER RRF so it's an additive bump independent
  // of dual-rank presence
  const chunks = scored.map(s => ({ chunk: input.store.getChunk(s.id)!, score: s.score }))
    .filter(x => x.chunk !== null);
  for (const x of chunks) {
    if (x.chunk.source === 'canonical') x.score += boost;
  }

  chunks.sort((a, b) => b.score - a.score);
  return { chunks: chunks.slice(0, k), mode, warnings };
}

/** Escape FTS5-special characters in a free-text query so SQLite doesn't parse
 *  parens / quotes / operators. Wraps each term as a phrase. */
function escapeFts(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map(t => `"${t.replace(/"/g, '""')}"`)
    .join(' ');
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnswersStore } from '../../../src/tools/answers/store/store.js';
import { hybridRetrieve } from '../../../src/tools/answers/retrieval/hybrid.js';
import type { EmbeddingProvider } from '../../../src/tools/answers/provider/types.js';

let courseDir: string;

beforeEach(() => { courseDir = mkdtempSync(join(tmpdir(), 'course-')); });
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

function v(d: number, ...vals: number[]): Float32Array {
  const a = new Array(d).fill(0);
  vals.forEach((x, i) => { a[i] = x; });
  return new Float32Array(a);
}

class StaticProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'f', dimension: 4 };
  constructor(private vec: Float32Array) {}
  async embed() { return [this.vec]; }
}

describe('hybridRetrieve', () => {
  it('boosts canonical chunks over equally-scored transcripts', async () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([
      { content: 'how is grading done? weighted average', source: 'canonical',
        sourcePath: 'a.md', sourceRef: '## grading', deepLink: null,
        embedding: v(4, 1, 0, 0, 0), sourceFile: '/a', sourceMtime: 1 },
      { content: 'grading was discussed in week 4 at length',
        source: 'transcript', sourcePath: 't.md', sourceRef: '0:00', deepLink: null,
        embedding: v(4, 1, 0, 0, 0), sourceFile: '/t', sourceMtime: 1 },
    ]);
    const result = await hybridRetrieve({
      question: 'grading', k: 5, store, provider: new StaticProvider(v(4, 1, 0, 0, 0)),
    });
    expect(result.chunks[0]!.chunk.source).toBe('canonical');
    store.close();
  });

  it('degrades to keyword-only when provider is null', async () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([{
      content: 'VLOOKUP for vertical lookups', source: 'transcript',
      sourcePath: 'a.md', sourceRef: '0:00', deepLink: null,
      embedding: v(4, 1, 0, 0, 0), sourceFile: '/a', sourceMtime: 1,
    }]);
    const result = await hybridRetrieve({ question: 'VLOOKUP', k: 5, store, provider: null });
    expect(result.mode).toBe('keyword-only');
    expect(result.chunks.length).toBe(1);
    store.close();
  });

  it('escapes FTS5-special characters in the query', async () => {
    const store = new AnswersStore(courseDir, 4);
    store.insertChunks([{
      content: 'parens and quotes are dangerous',
      source: 'cds', sourcePath: 'x.md', sourceRef: '#', deepLink: null,
      embedding: v(4, 1, 0, 0, 0), sourceFile: '/x', sourceMtime: 1,
    }]);
    // raw paren would normally crash FTS5
    const result = await hybridRetrieve({
      question: 'parens (and) "quotes"', k: 5, store, provider: null,
    });
    expect(result.chunks.length).toBeGreaterThan(0);
    store.close();
  });
});
```

- [ ] **Step 3: Run + commit**

```
feat(cc): hybridRetrieve — FTS5 + vec + RRF + canonical boost

Reciprocal Rank Fusion merges keyword and vector results; canonical chunks
get an additive +0.3 score bump after RRF. EmbeddingProviderUnavailableError
caught + degraded to keyword-only with a warning. FTS5 query escaping
prevents user-input characters from crashing the search.
```

---

## Phase 6 — Answer generation

### Task 6.1: Prompt builder + LLM call + citation parsing

**Files:**
- Create: `packages/command-and-control/src/tools/answers/retrieval/prompt.ts`
- Create: `packages/command-and-control/src/tools/answers/retrieval/answer.ts`
- Create: `packages/command-and-control/tests/answers/retrieval/answer.test.ts`

- [ ] **Step 1: Prompt builder**

```ts
// packages/command-and-control/src/tools/answers/retrieval/prompt.ts

import type { Chunk } from '../types.js';

export const SYSTEM_PROMPT = `You are a faculty research assistant. Answer the question using ONLY the provided context chunks. Cite each fact you use by referencing the chunk number in square brackets, like [3]. If the context does NOT contain the answer, say so explicitly — never fabricate or speculate. Keep answers concise and useful for a busy professor double-checking what they covered in class.`;

export function buildUserPrompt(question: string, chunks: Chunk[]): string {
  const formatted = chunks.map((c, i) => {
    const header = `[${i + 1}] (${c.source}: ${c.sourcePath}${c.sourceRef ? ' ' + c.sourceRef : ''})`;
    return `${header}\n${c.content}`;
  }).join('\n\n');
  return `CONTEXT:\n\n${formatted}\n\nQUESTION: ${question}\n\nAnswer the question using only the context above, citing chunk numbers like [N].`;
}

const CITATION_RE = /\[(\d+)\]/g;

/** Extract the set of chunk indexes (1-based) referenced in the answer text. */
export function extractCitedIndexes(answer: string): number[] {
  const set = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = CITATION_RE.exec(answer)) !== null) {
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > 0) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}
```

- [ ] **Step 2: Answer module**

```ts
// packages/command-and-control/src/tools/answers/retrieval/answer.ts

import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../../setup_anthropic.js';
import { SYSTEM_PROMPT, buildUserPrompt, extractCitedIndexes } from './prompt.js';
import type { Chunk } from '../types.js';

export interface AnswerHooks {
  llm?: LlmClient;
}

export interface Citation {
  index: number;
  source: Chunk['source'];
  sourcePath: string;
  sourceRef: string;
  deepLink: string | null;
  snippet: string;
}

export interface AnswerResult {
  answer: string;
  citations: Citation[];
  usage?: { inputTokens: number; outputTokens: number };
}

export async function generateAnswer(
  question: string,
  chunks: Chunk[],
  hooks: AnswerHooks = {},
): Promise<AnswerResult> {
  const llm = hooks.llm ?? new AnthropicLlmClient(loadAnthropicConfig());
  const userPrompt = buildUserPrompt(question, chunks);
  const response = await llm.complete(SYSTEM_PROMPT, userPrompt, { maxTokens: 1024 });
  const indexes = extractCitedIndexes(response.text);

  const citations: Citation[] = indexes
    .filter(i => i >= 1 && i <= chunks.length)
    .map(i => {
      const c = chunks[i - 1]!;
      return {
        index: i, source: c.source, sourcePath: c.sourcePath,
        sourceRef: c.sourceRef, deepLink: c.deepLink,
        snippet: c.content.slice(0, 240),
      };
    });

  return { answer: response.text, citations, usage: response.usage };
}
```

- [ ] **Step 3: Test**

```ts
import { describe, it, expect } from 'vitest';
import { extractCitedIndexes, buildUserPrompt } from '../../../src/tools/answers/retrieval/prompt.js';
import { generateAnswer } from '../../../src/tools/answers/retrieval/answer.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';
import type { Chunk } from '../../../src/tools/answers/types.js';

function fakeLlm(text: string): LlmClient {
  return { async complete(): Promise<LlmResponse> { return { text, usage: { inputTokens: 100, outputTokens: 50 } }; } };
}

describe('extractCitedIndexes', () => {
  it('returns sorted unique 1-based indexes', () => {
    expect(extractCitedIndexes('Used [3] and [1] and again [3].')).toEqual([1, 3]);
  });
  it('ignores non-citation brackets', () => {
    expect(extractCitedIndexes('[foo] [99]')).toEqual([99]);
  });
});

describe('buildUserPrompt', () => {
  it('numbers chunks 1-based and includes source path', () => {
    const chunks: Chunk[] = [
      { content: 'AAA', source: 'transcript', sourcePath: 'p.md', sourceRef: '0:00', deepLink: null },
    ];
    const p = buildUserPrompt('q?', chunks);
    expect(p).toContain('[1] (transcript: p.md 0:00)');
  });
});

describe('generateAnswer', () => {
  it('returns parsed citations matching cited chunk indexes', async () => {
    const chunks: Chunk[] = [
      { content: 'A', source: 'transcript', sourcePath: 'a', sourceRef: '0', deepLink: 'https://x' },
      { content: 'B', source: 'cds', sourcePath: 'b', sourceRef: '#', deepLink: null },
    ];
    const r = await generateAnswer('q?', chunks, {
      llm: fakeLlm('Per the lecture [1], the answer is X.'),
    });
    expect(r.citations).toHaveLength(1);
    expect(r.citations[0]!.index).toBe(1);
    expect(r.citations[0]!.deepLink).toBe('https://x');
  });
});
```

- [ ] **Step 4: Run + commit**

```
feat(cc): prompt builder + answer generator with citation parsing

SYSTEM_PROMPT instructs the LLM to cite [N] chunk numbers and to refuse
when context is insufficient. buildUserPrompt formats numbered chunks
with source headers. extractCitedIndexes parses [N] markers from the
answer text. generateAnswer wires these together via shared-llm,
returning the answer + structured Citation array.
```

---

## Phase 7 — MCP tool wiring

### Task 7.1: setup_lecture_answers

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/setup_lecture_answers.ts`
- Create: `packages/command-and-control/tests/workflows/setup_lecture_answers.test.ts`

- [ ] **Step 1: Implement**

```ts
// packages/command-and-control/src/tools/workflows/setup_lecture_answers.ts

import { saveLectureAnswersConfig } from '../answers/config.js';
import { autoDetect } from '../answers/provider/resolve.js';
import type { EmbeddingProviderKind, LectureAnswersConfig } from '../answers/types.js';

export interface SetupLectureAnswersInput {
  provider?: EmbeddingProviderKind;
  voyageApiKey?: string;
  ollamaBaseUrl?: string;
  model?: string;
}

export interface SetupLectureAnswersResult {
  configured: boolean;
  provider?: EmbeddingProviderKind;
  embeddingDimension?: number;
  message?: string;
  fix?: string[];
}

export async function setupLectureAnswers(input: SetupLectureAnswersInput = {}): Promise<SetupLectureAnswersResult> {
  let kind = input.provider;
  if (!kind) {
    const detected = await autoDetect(input.ollamaBaseUrl);
    if (detected.kind === 'ollama') kind = 'ollama';
    else {
      return {
        configured: false,
        message: detected.reason ?? 'No embedding provider auto-detected.',
        fix: [
          'Install Ollama (https://ollama.com/download) then run `ollama pull nomic-embed-text` and re-call setup_lecture_answers.',
          'OR re-call setup_lecture_answers with provider="transformers-js" to use the bundled in-process embedder (requires installing @xenova/transformers in command-and-control).',
          'OR re-call setup_lecture_answers with provider="voyage" and voyageApiKey="..." for cloud embeddings (Voyage AI).',
        ],
      };
    }
  }

  if (kind === 'voyage' && !input.voyageApiKey) {
    return {
      configured: false,
      message: 'provider=voyage requires voyageApiKey.',
      fix: ['Re-call setup_lecture_answers with provider="voyage" and voyageApiKey="vk-..." (https://www.voyageai.com/).'],
    };
  }

  const cfg: LectureAnswersConfig = { provider: kind, model: input.model };
  if (kind === 'ollama' && input.ollamaBaseUrl) cfg.ollamaBaseUrl = input.ollamaBaseUrl;
  if (kind === 'voyage') cfg.voyageApiKey = input.voyageApiKey;
  saveLectureAnswersConfig(cfg);

  const dim = kind === 'ollama' ? 768 : kind === 'transformers-js' ? 384 : 1024;
  return { configured: true, provider: kind, embeddingDimension: dim, message: `Lecture answers configured with provider=${kind}.` };
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupLectureAnswers } from '../../src/tools/workflows/setup_lecture_answers.js';
import { loadLectureAnswersConfig } from '../../src/tools/answers/config.js';

let ccHome: string;

beforeEach(() => { ccHome = mkdtempSync(join(tmpdir(), 'cc-home-')); process.env.CC_HOME = ccHome; });
afterEach(() => { delete process.env.CC_HOME; rmSync(ccHome, { recursive: true, force: true }); vi.unstubAllGlobals(); });

describe('setupLectureAnswers', () => {
  it('auto-configures Ollama when available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const r = await setupLectureAnswers();
    expect(r.configured).toBe(true);
    expect(r.provider).toBe('ollama');
    expect(loadLectureAnswersConfig()?.provider).toBe('ollama');
  });

  it('returns fix instructions when Ollama is absent and no explicit provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const r = await setupLectureAnswers();
    expect(r.configured).toBe(false);
    expect(r.fix).toBeDefined();
    expect(r.fix!.length).toBe(3);
  });

  it('refuses voyage without an API key', async () => {
    const r = await setupLectureAnswers({ provider: 'voyage' });
    expect(r.configured).toBe(false);
    expect(r.message).toMatch(/voyageApiKey/);
  });

  it('saves voyage config when api key is provided', async () => {
    const r = await setupLectureAnswers({ provider: 'voyage', voyageApiKey: 'vk-x' });
    expect(r.configured).toBe(true);
    expect(loadLectureAnswersConfig()?.voyageApiKey).toBe('vk-x');
  });
});
```

- [ ] **Step 3: Commit**

```
feat(cc): setup_lecture_answers MCP tool (V&R-style opt-in setup)

Auto-detects Ollama; falls through to explicit-provider selection with
remediation instructions when Ollama is absent. Validates voyage requires
voyageApiKey. Writes to ~/.command-and-control/lecture-answers-config.json
via the atomic 0o600 writer.
```

### Task 7.2: index_course_for_answers

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/index_course_for_answers.ts`
- Create: `packages/command-and-control/tests/workflows/index_course_for_answers.test.ts`

- [ ] **Step 1: Implement**

```ts
// packages/command-and-control/src/tools/workflows/index_course_for_answers.ts

import { ingestCourse, type IngestResult } from '../answers/ingest/orchestrator.js';
import { providerFromConfig } from '../answers/provider/resolve.js';
import type { EmbeddingProvider } from '../answers/provider/types.js';

export interface IndexCourseForAnswersInput {
  courseId: number;
  courseDir: string;
  rebuild?: boolean;
  transcriptSources?: string[];
}

export interface IndexCourseForAnswersHooks {
  provider?: EmbeddingProvider;  // tests inject a fake
}

export interface IndexCourseForAnswersResult extends IngestResult {
  ok: boolean;
  provider: 'ollama' | 'transformers-js' | 'voyage';
  durationMs: number;
}

export async function indexCourseForAnswers(
  input: IndexCourseForAnswersInput,
  hooks: IndexCourseForAnswersHooks = {},
): Promise<IndexCourseForAnswersResult> {
  const t0 = performance.now();
  const provider = hooks.provider ?? providerFromConfig();
  const sources = input.transcriptSources ?? defaultTranscriptSources(input.courseId);
  const result = await ingestCourse({
    courseId: input.courseId, courseDir: input.courseDir, transcriptSources: sources,
    provider, rebuild: input.rebuild ?? false,
  });
  return { ok: true, provider: provider.info.kind, durationMs: Math.round(performance.now() - t0), ...result };
}

function defaultTranscriptSources(courseId: number): string[] {
  // Convention: existing sub-project 2 writes enriched transcripts here.
  // If a different layout is in use, callers can pass transcriptSources explicitly.
  const { join } = require('node:path') as typeof import('node:path');
  const { homedir } = require('node:os') as typeof import('node:os');
  const ciHome = process.env.CURRICULUM_INTELLIGENCE_HOME ?? join(homedir(), '.curriculum-intelligence');
  return [join(ciHome, 'panopto', String(courseId))];
}
```

- [ ] **Step 2: Test (uses the fake provider from earlier orchestrator test)**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexCourseForAnswers } from '../../src/tools/workflows/index_course_for_answers.js';
import type { EmbeddingProvider } from '../../src/tools/answers/provider/types.js';

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'f', dimension: 4 };
  async embed(t: string[]) { return t.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])); }
}

let courseDir: string;
let transcriptDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  transcriptDir = mkdtempSync(join(tmpdir(), 'tx-'));
});
afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
});

describe('indexCourseForAnswers', () => {
  it('returns ok=true with provider + duration when ingestion succeeds', async () => {
    mkdirSync(join(courseDir, 'week-01'), { recursive: true });
    writeFileSync(join(courseDir, 'week-01', 'overview.md'), '# Week 1\nstuff');
    const r = await indexCourseForAnswers(
      { courseId: 1, courseDir, transcriptSources: [transcriptDir] },
      { provider: new FakeProvider() },
    );
    expect(r.ok).toBe(true);
    expect(r.provider).toBe('ollama');
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(r.chunksAdded).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Commit**

```
feat(cc): index_course_for_answers workflow wrapper

Loads provider from config (or DI hook for tests), calls ingestCourse,
adds ok flag, provider name, duration. Default transcript source is the
existing sub-project 2 output dir; explicit transcriptSources param wins.
```

### Task 7.3: ask_course

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/ask_course.ts`
- Create: `packages/command-and-control/tests/workflows/ask_course.test.ts`

- [ ] **Step 1: Implement**

```ts
// packages/command-and-control/src/tools/workflows/ask_course.ts

import { AnswersStore } from '../answers/store/store.js';
import { readIndexMeta } from '../answers/store/index_meta.js';
import { hybridRetrieve } from '../answers/retrieval/hybrid.js';
import { generateAnswer, type Citation } from '../answers/retrieval/answer.js';
import { providerFromConfig } from '../answers/provider/resolve.js';
import { ingestCourse } from '../answers/ingest/orchestrator.js';
import type { EmbeddingProvider } from '../answers/provider/types.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

export interface AskCourseInput {
  courseId: number;
  courseDir: string;
  question: string;
  k?: number;
  /** Reserved for v1.1 — currently ignored. */
  weekScope?: number;
  transcriptSources?: string[];
}

export interface AskCourseHooks {
  provider?: EmbeddingProvider;
  llm?: LlmClient;
}

export interface AskCourseResult {
  answer: string;
  citations: Citation[];
  retrievalMode: 'hybrid' | 'keyword-only';
  warnings?: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

export async function askCourse(
  input: AskCourseInput,
  hooks: AskCourseHooks = {},
): Promise<AskCourseResult> {
  const k = input.k ?? 8;
  const transcriptSources = input.transcriptSources ?? defaultTranscriptSources(input.courseId);

  // Auto-incremental re-index. If provider blows up here we still try to query
  // with whatever's on disk (degraded to keyword-only).
  let provider: EmbeddingProvider | null = null;
  try { provider = hooks.provider ?? providerFromConfig(); } catch { /* fall through */ }
  const warnings: string[] = [];
  if (provider) {
    try {
      await ingestCourse({ courseId: input.courseId, courseDir: input.courseDir,
        transcriptSources, provider, rebuild: false });
    } catch (e) {
      warnings.push(`Auto-incremental index failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const meta = readIndexMeta(input.courseDir);
  const dim = meta?.provider.dimension ?? provider?.info.dimension ?? 768;
  const store = new AnswersStore(input.courseDir, dim);
  try {
    const retrieval = await hybridRetrieve({
      question: input.question, k, store, provider,
    });
    warnings.push(...retrieval.warnings);

    const chunks = retrieval.chunks.map(x => x.chunk);
    const answerResult = await generateAnswer(input.question, chunks, { llm: hooks.llm });
    return {
      answer: answerResult.answer, citations: answerResult.citations,
      retrievalMode: retrieval.mode,
      warnings: warnings.length > 0 ? warnings : undefined,
      usage: answerResult.usage,
    };
  } finally {
    store.close();
  }
}

function defaultTranscriptSources(courseId: number): string[] {
  const { join } = require('node:path') as typeof import('node:path');
  const { homedir } = require('node:os') as typeof import('node:os');
  const ciHome = process.env.CURRICULUM_INTELLIGENCE_HOME ?? join(homedir(), '.curriculum-intelligence');
  return [join(ciHome, 'panopto', String(courseId))];
}
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askCourse } from '../../src/tools/workflows/ask_course.js';
import type { EmbeddingProvider } from '../../src/tools/answers/provider/types.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'f', dimension: 4 };
  async embed(t: string[]) { return t.map(() => new Float32Array([1, 0, 0, 0])); }
}

function fakeLlm(text: string): LlmClient {
  return { async complete(): Promise<LlmResponse> { return { text, usage: { inputTokens: 1, outputTokens: 1 } }; } };
}

let courseDir: string;
let transcriptDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  transcriptDir = mkdtempSync(join(tmpdir(), 'tx-'));
});
afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
});

describe('askCourse', () => {
  it('end-to-end: ingest, retrieve, answer, citations', async () => {
    mkdirSync(join(courseDir, 'week-01'), { recursive: true });
    writeFileSync(join(courseDir, 'week-01', 'overview.md'),
      '# Week 1\nVLOOKUP looks up values in the leftmost column.');
    const result = await askCourse(
      { courseId: 1, courseDir, transcriptSources: [transcriptDir], question: 'what is VLOOKUP?' },
      { provider: new FakeProvider(), llm: fakeLlm('VLOOKUP is for vertical lookups [1].') },
    );
    expect(result.answer).toMatch(/VLOOKUP/);
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
    expect(result.retrievalMode).toBe('hybrid');
  });
});
```

- [ ] **Step 3: Commit**

```
feat(cc): ask_course workflow — auto-incremental + retrieve + answer

Calls ingestCourse with rebuild=false first to pick up any source-file
changes since last query; ingest failures are surfaced as warnings but
the query proceeds against whatever's on disk. Hybrid retrieval + LLM
answer generation + citation parsing. Falls back to keyword-only when
the embedding provider is missing or unavailable.
```

### Task 7.4: reembed_course_index + MCP registration

**Files:**
- Create: `packages/command-and-control/src/tools/workflows/reembed_course_index.ts`
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: reembed_course_index**

```ts
// packages/command-and-control/src/tools/workflows/reembed_course_index.ts

import { setupLectureAnswers } from './setup_lecture_answers.js';
import { indexCourseForAnswers, type IndexCourseForAnswersResult } from './index_course_for_answers.js';
import type { EmbeddingProviderKind } from '../answers/types.js';

export interface ReembedCourseIndexInput {
  courseId: number;
  courseDir: string;
  provider?: EmbeddingProviderKind;
  voyageApiKey?: string;
  ollamaBaseUrl?: string;
  transcriptSources?: string[];
}

export async function reembedCourseIndex(
  input: ReembedCourseIndexInput,
): Promise<IndexCourseForAnswersResult> {
  if (input.provider) {
    const setup = await setupLectureAnswers({
      provider: input.provider,
      voyageApiKey: input.voyageApiKey,
      ollamaBaseUrl: input.ollamaBaseUrl,
    });
    if (!setup.configured) {
      throw new Error(setup.message ?? 'setup_lecture_answers failed during reembed_course_index');
    }
  }
  return indexCourseForAnswers({
    courseId: input.courseId, courseDir: input.courseDir,
    transcriptSources: input.transcriptSources, rebuild: true,
  });
}
```

- [ ] **Step 2: Register all 4 tools in `src/index.ts`**

Add the imports near the existing workflow imports:

```ts
import { setupLectureAnswers, type SetupLectureAnswersInput } from './tools/workflows/setup_lecture_answers.js';
import { indexCourseForAnswers, type IndexCourseForAnswersInput } from './tools/workflows/index_course_for_answers.js';
import { askCourse, type AskCourseInput } from './tools/workflows/ask_course.js';
import { reembedCourseIndex, type ReembedCourseIndexInput } from './tools/workflows/reembed_course_index.js';
```

Add four tool definitions in the tools array (next to the existing publish-workflow tools):

```ts
{
  name: 'setup_lecture_answers',
  description: 'First-run configuration for the lecture answers bot. Auto-detects Ollama on localhost:11434. When Ollama is absent, returns guidance to either install Ollama or re-call with provider="transformers-js" (bundled, in-process) or provider="voyage" (cloud, requires voyageApiKey). The bot is opt-in — until this tool succeeds, ask_course and index_course_for_answers report NO_CONFIG.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      provider: { enum: ['ollama', 'transformers-js', 'voyage'] as const, description: 'Explicit provider choice. When omitted, auto-detects Ollama.' },
      voyageApiKey: { type: 'string', description: 'Required when provider is "voyage".' },
      ollamaBaseUrl: { type: 'string', description: 'Override the default Ollama base URL (http://localhost:11434).' },
      model: { type: 'string', description: 'Override the default embedding model name for the chosen provider.' },
    },
  },
},
{
  name: 'index_course_for_answers',
  description: 'Build or incrementally update a per-course hybrid (FTS5 + vec) index over enriched lecture transcripts, CDS markdown, slide PDFs (under <courseDir>/slides/), and the canonical FAQ (<courseDir>/answers/canonical.md). Auto-incremental on subsequent calls based on file mtimes. Pass rebuild=true to wipe and re-embed everything (provider switch, suspected corruption).',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'courseDir'],
    properties: {
      courseId: { type: 'number' },
      courseDir: { type: 'string' },
      rebuild: { type: 'boolean', description: 'Wipe and re-embed everything. Default false.' },
      transcriptSources: { type: 'array', items: { type: 'string' }, description: 'Override the default transcript source directory list.' },
    },
  },
},
{
  name: 'ask_course',
  description: 'Faculty-facing Q&A against the per-course hybrid index. Auto-incrementally re-indexes any changed source files before retrieving. Returns the LLM-generated answer plus citations (with deep-link URLs for transcript chunks where the source platform provided a deepLinkTemplate). Degrades to keyword-only retrieval when the embedding provider is unavailable.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'courseDir', 'question'],
    properties: {
      courseId: { type: 'number' },
      courseDir: { type: 'string' },
      question: { type: 'string' },
      k: { type: 'number', description: 'Top-K chunks to retrieve. Default 8.' },
      transcriptSources: { type: 'array', items: { type: 'string' } },
    },
  },
},
{
  name: 'reembed_course_index',
  description: 'Switch embedding providers and rebuild the per-course index in one call. Convenience wrapper over setup_lecture_answers + index_course_for_answers --rebuild. Use when migrating from Ollama to Voyage (or vice versa), since vector dimensions are not interchangeable.',
  inputSchema: {
    type: 'object' as const,
    required: ['courseId', 'courseDir'],
    properties: {
      courseId: { type: 'number' },
      courseDir: { type: 'string' },
      provider: { enum: ['ollama', 'transformers-js', 'voyage'] as const },
      voyageApiKey: { type: 'string' },
      ollamaBaseUrl: { type: 'string' },
      transcriptSources: { type: 'array', items: { type: 'string' } },
    },
  },
},
```

Add four case dispatches in the switch statement:

```ts
case 'setup_lecture_answers':
  result = await setupLectureAnswers(args as unknown as SetupLectureAnswersInput);
  break;
case 'index_course_for_answers':
  result = await indexCourseForAnswers(args as unknown as IndexCourseForAnswersInput);
  break;
case 'ask_course':
  result = await askCourse(args as unknown as AskCourseInput);
  break;
case 'reembed_course_index':
  result = await reembedCourseIndex(args as unknown as ReembedCourseIndexInput);
  break;
```

- [ ] **Step 3: Build + full C&C test suite**

```bash
cd D:/Dev/canvas-toolchain
npm run build --workspace=packages/command-and-control
npm test --workspace=packages/command-and-control
```

Expected: clean build, all prior tests pass + the new answers tests pass.

- [ ] **Step 4: Commit**

```
feat(cc): reembed_course_index + register all 4 lecture-answers MCP tools

setup_lecture_answers + index_course_for_answers + ask_course +
reembed_course_index now visible to MCP clients with full inputSchema
descriptions. reembed_course_index is the convenience wrapper for
provider-migration (switches config then rebuilds index).
```

---

## Phase 8 — End-to-end integration

### Task 8.1: Cross-feature integration test against fixture corpus

**Files:**
- Create: `packages/command-and-control/tests/answers/end-to-end.test.ts`
- Create: `packages/command-and-control/tests/fixtures/answers/course/week-01/overview.md`
- Create: `packages/command-and-control/tests/fixtures/answers/course/week-01/assignment.md`
- Create: `packages/command-and-control/tests/fixtures/answers/course/answers/canonical.md`
- Create: `packages/command-and-control/tests/fixtures/answers/transcripts/week01.enriched.md`

- [ ] **Step 1: Build the fixture corpus**

Tiny but realistic — enough to exercise every source type:

```md
<!-- tests/fixtures/answers/course/week-01/overview.md -->
# Week 1 Overview

## Learning Goals

Students will understand the difference between VLOOKUP and XLOOKUP.

## Activities

Read Chapter 3. Submit Quiz 1 via Canvas.
```

```md
<!-- tests/fixtures/answers/course/week-01/assignment.md -->
# Assignment 1

Build a 5-row spreadsheet using VLOOKUP. Submit as .xlsx.
```

```md
<!-- tests/fixtures/answers/course/answers/canonical.md -->
## How is the final project graded?

40% rubric, 60% peer evaluation. See the rubric in week 15.
```

```md
<!-- tests/fixtures/answers/transcripts/week01.enriched.md -->
---
sourcePlatform: panopto
sourceId: abc-123
deepLinkTemplate: "https://bsu.hosted.panopto.com/Pages/Viewer.aspx?id={sourceId}&start={startSeconds}"
title: "Week 01 - VLOOKUP Introduction"
recordedAt: 2026-02-15T14:00:00Z
durationSeconds: 600
---
[00:00:00] welcome to week one.
[00:00:30] today we cover VLOOKUP.
[00:01:00] VLOOKUP looks up values in the leftmost column.
[00:02:00] it returns a corresponding value from a chosen column.
```

- [ ] **Step 2: Write the integration test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexCourseForAnswers } from '../../src/tools/workflows/index_course_for_answers.js';
import { askCourse } from '../../src/tools/workflows/ask_course.js';
import type { EmbeddingProvider } from '../../src/tools/answers/provider/types.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';

const FIXTURE_ROOT = join(__dirname, '..', 'fixtures', 'answers');

class FakeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'fake', dimension: 4 };
  async embed(t: string[]) { return t.map(() => new Float32Array([1, 0, 0, 0])); }
}

function fakeLlm(text: string): LlmClient {
  return { async complete(): Promise<LlmResponse> { return { text, usage: { inputTokens: 100, outputTokens: 50 } }; } };
}

let courseDir: string;
let transcriptDir: string;

beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'e2e-course-'));
  transcriptDir = mkdtempSync(join(tmpdir(), 'e2e-tx-'));
  cpSync(join(FIXTURE_ROOT, 'course'), courseDir, { recursive: true });
  cpSync(join(FIXTURE_ROOT, 'transcripts'), transcriptDir, { recursive: true });
});
afterEach(() => {
  rmSync(courseDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
});

describe('end-to-end: index → ask → answer with citations', () => {
  it('indexes every source type and answers with citations spanning sources', async () => {
    const provider = new FakeProvider();
    const indexResult = await indexCourseForAnswers(
      { courseId: 48894, courseDir, transcriptSources: [transcriptDir] },
      { provider },
    );
    expect(indexResult.ok).toBe(true);
    expect(indexResult.chunksAdded).toBeGreaterThanOrEqual(3);

    const askResult = await askCourse(
      { courseId: 48894, courseDir, transcriptSources: [transcriptDir], question: 'what is VLOOKUP and how is the final project graded?' },
      { provider, llm: fakeLlm('VLOOKUP looks up values [1]. The final project is 40% rubric, 60% peer eval [2].') },
    );
    expect(askResult.answer).toMatch(/VLOOKUP/);
    expect(askResult.citations).toHaveLength(2);
    expect(askResult.citations.some(c => c.source === 'canonical')).toBe(true);
    expect(askResult.retrievalMode).toBe('hybrid');
  });

  it('incremental re-index on second ask_course picks up canonical edits', async () => {
    const provider = new FakeProvider();
    await indexCourseForAnswers(
      { courseId: 48894, courseDir, transcriptSources: [transcriptDir] }, { provider });

    // Mutate canonical FAQ
    const canonicalPath = join(courseDir, 'answers', 'canonical.md');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(canonicalPath, `## What is the late policy?\n\n10% per day, max 3 days.`, 'utf-8');

    const r = await askCourse(
      { courseId: 48894, courseDir, transcriptSources: [transcriptDir], question: 'late policy?' },
      { provider, llm: fakeLlm('Late policy: 10% per day [1].') },
    );
    // Should retrieve the new canonical chunk (it was indexed incrementally during the askCourse call).
    expect(r.citations.some(c => c.source === 'canonical' && c.snippet.includes('10%'))).toBe(true);
  });
});
```

Run + commit.

- [ ] **Step 3: Commit**

```
test(cc): end-to-end answers bot — fixture corpus + cross-feature integration

Verifies: indexing every source type, hybrid retrieval, citation parsing,
auto-incremental re-index on subsequent ask_course (canonical edit picked
up without manual index_course_for_answers call). Fixture corpus is a
2-page week-1 course with one transcript and one canonical FAQ entry.
```

---

## Phase 9 — Smoke test extension + monorepo regression

### Task 9.1: Extend smoke:integration with an answers-bot smoke test

**Files:**
- Modify: `packages/command-and-control/scripts/smoke-integration.ts`

- [ ] **Step 1: Append a smoke step that exercises the new tools**

After the existing `generate_course` step, append:

```ts
// Smoke: lecture answers bot end-to-end (uses a fake provider + fake LLM to avoid
// hitting any external service in the smoke test).
import { ingestCourse } from '../src/tools/answers/ingest/orchestrator.js';
import { askCourse } from '../src/tools/workflows/ask_course.js';
import type { EmbeddingProvider } from '../src/tools/answers/provider/types.js';

class SmokeProvider implements EmbeddingProvider {
  readonly info = { kind: 'ollama' as const, model: 'smoke', dimension: 4 };
  async embed(texts: string[]) { return texts.map(() => new Float32Array([1, 0, 0, 0])); }
}

const smokeCourseDir = path.join(tempHome, 'course-fixture');
fs.mkdirSync(path.join(smokeCourseDir, 'week-01'), { recursive: true });
fs.writeFileSync(path.join(smokeCourseDir, 'week-01', 'overview.md'),
  '# Week 1\n\n## Goals\n\nLearn VLOOKUP.', 'utf-8');

const ingestResult = await ingestCourse({
  courseId: 1, courseDir: smokeCourseDir,
  transcriptSources: [], provider: new SmokeProvider(), rebuild: false,
});
console.log(`lecture answers: indexed chunks=${ingestResult.chunksAdded} files=${ingestResult.filesIndexed}`);

const askResult = await askCourse(
  { courseId: 1, courseDir: smokeCourseDir, transcriptSources: [], question: 'what should students learn this week?' },
  { provider: new SmokeProvider(),
    llm: { async complete() { return { text: 'Students learn VLOOKUP [1].', usage: { inputTokens: 100, outputTokens: 50 } }; } } },
);
if (askResult.citations.length === 0) throw new Error('lecture answers smoke: expected at least one citation');
console.log(`lecture answers: answer cites=${askResult.citations.length} mode=${askResult.retrievalMode}`);
```

(Adjust import names / scope to match the existing `smoke-integration.ts` style — `path`/`fs` are likely already imported there.)

- [ ] **Step 2: Run + commit**

```bash
cd D:/Dev/canvas-toolchain
npm run smoke:integration --workspace=packages/command-and-control
```

Expected: existing smoke output PLUS two new lines confirming the answers bot ingested and answered.

```
test(cc): smoke:integration covers lecture answers bot end-to-end

Adds an in-process ingest + ask round-trip using a SmokeProvider (fake
embeddings) and a fake LLM so the smoke test stays hermetic. Verifies
the bot pipeline is wired correctly through MCP-facing surface without
needing Ollama, transformers.js, or Anthropic at smoke time.
```

### Task 9.2: Monorepo regression checkpoint

- [ ] **Step 1: Run all tests**

```bash
cd D:/Dev/canvas-toolchain
npm test
npm run build
```

Expected: all packages green; build clean. Plan adds approximately:
- config: 3 tests
- providers (ollama / transformers-js / voyage / resolve): ~9 tests
- store: 5 tests
- chunking (transcript / markdown / canonical / slide): ~10 tests
- ingest orchestrator: 4 tests
- hybrid retrieval: 3 tests
- prompt + answer: ~4 tests
- 4 workflow tools: ~6 tests (setup-only at workflow level; full coverage at lib level)
- end-to-end: 2 tests
- **Total: ~46 new tests.**

- [ ] **Step 2: Update memory state**

Update `C:\Users\krank\.claude\projects\D--Dev-canvas-toolchain\memory\project-current-state.md` reflecting that #61 has shipped, and that AnswerBot spec sheet exists at `D:\Dev\AnswerBot\AnswerBotSpecSheet.md`.

- [ ] **Step 3: Close the GitHub issue**

```bash
gh issue close 61 --comment "Shipped via commits in branch main (2026-06-04). Lecture answers bot with hybrid keyword+semantic retrieval, platform-agnostic transcript schema, setup-time embedding provider fallback (Ollama → transformers.js → Voyage), curated FAQ self-improvement loop, four MCP tools (setup_lecture_answers, index_course_for_answers, ask_course, reembed_course_index). Student-facing future captured in D:\Dev\AnswerBot\AnswerBotSpecSheet.md."
```

---

## Self-review checklist (run before declaring done)

- [ ] Every task has concrete file paths.
- [ ] Every task has executable test code OR explicit reason for omission.
- [ ] No "implement later" / "similar to task N" placeholders.
- [ ] Provider abstractions actually constrain through the `EmbeddingProvider` interface (no provider leaks types into store / retrieval / orchestrator).
- [ ] `.enriched.md` schema is platform-neutral (no Panopto-specific assumptions in chunker / store / retrieval).
- [ ] Tool names are platform-agnostic (`setup_lecture_answers`, NOT `setup_panopto_answers`).
- [ ] EmbeddingProviderUnavailableError is the documented signal for graceful keyword-only degrade.
- [ ] All four MCP tools are registered in `src/index.ts` with full inputSchemas.
- [ ] Smoke test runs offline (no Ollama/Voyage/Anthropic) — uses in-process fakes.
- [ ] Spec self-review checklist (in the spec doc) all items still hold against this plan.
