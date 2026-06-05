# Ollama Generation-Time LLM Provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `OllamaLlmClient` as a peer to `AnthropicLlmClient` across brainstorm / rubric / answers features, with provider switchable via two new MCP tools (`setup_ollama`, `set_active_llm_provider`).

**Architecture:** New modules in `@canvas-toolchain/shared-llm` (`ollama.ts`, `resolve.ts`, `errors.ts`, `recommendations.ts`) provide the building blocks. C&C adds setup tools + a thin resolver shim that reads two config files (`ollama-config.json`, `llm-provider.json`) and returns a concrete `LlmClient`. Three call sites swap their hard-coded `AnthropicLlmClient` construction for a single `resolveLlmClient()` call. Hard-fail on provider errors — no silent cross-provider fallback.

**Tech Stack:** TypeScript ESM, Vitest, Node 18+. No new runtime dependencies — Ollama is reached via `fetch` to `localhost:11434`.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-05-ollama-generation-fallback-design.md`

**Issue:** [#89](https://github.com/Ryfter/canvas-toolchain/issues/89)

---

## Phase 0 — Baseline Verification

### Task 0.1: Confirm clean working tree and baseline tests pass

**Files:** None modified.

- [ ] **Step 1: Confirm clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean` on `main`.

- [ ] **Step 2: Run full test suite — must be green before we start**

Run: `npm test --workspaces`
Expected: all packages pass. Capture the baseline test count from each package (typically `shared-llm ~16`, `command-and-control ~1100+`).

- [ ] **Step 3: Run smoke integration — must be green before we start**

Run: `npm run smoke:integration --workspace command-and-control-mcp`
Expected: smoke completes without error.

- [ ] **Step 4: Note baseline counts**

Record in a scratch note the baseline test counts so Phase 6 verification can compare.

---

## Phase 1 — `shared-llm` Foundation

### Task 1.1: Add `LlmProviderError` class

**Files:**
- Create: `packages/shared-llm/src/errors.ts`
- Test: `packages/shared-llm/tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared-llm/tests/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LlmProviderError } from '../src/errors.js';

describe('LlmProviderError', () => {
  it('preserves code, provider, message, and fix', () => {
    const err = new LlmProviderError('OLLAMA_UNREACHABLE', 'No connection', 'ollama', ['Start Ollama']);
    expect(err.code).toBe('OLLAMA_UNREACHABLE');
    expect(err.provider).toBe('ollama');
    expect(err.message).toBe('No connection');
    expect(err.fix).toEqual(['Start Ollama']);
  });

  it('is an instance of Error and LlmProviderError', () => {
    const err = new LlmProviderError('ANY', 'msg', 'unknown', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LlmProviderError);
  });

  it('has name === "LlmProviderError" so stack traces are readable', () => {
    const err = new LlmProviderError('ANY', 'msg', 'unknown', []);
    expect(err.name).toBe('LlmProviderError');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- errors.test.ts`
Expected: FAIL — `Cannot find module '../src/errors.js'`.

- [ ] **Step 3: Implement `errors.ts`**

Create `packages/shared-llm/src/errors.ts`:

```ts
export type LlmProvider = 'anthropic' | 'ollama' | 'unknown';

export class LlmProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly provider: LlmProvider,
    public readonly fix: string[],
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- errors.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-llm/src/errors.ts packages/shared-llm/tests/errors.test.ts
git commit -m "feat(shared-llm): LlmProviderError with code/provider/fix metadata (#89)"
```

---

### Task 1.2: Map Anthropic HTTP errors to `LlmProviderError`

**Files:**
- Modify: `packages/shared-llm/src/index.ts` (AnthropicLlmClient error handling)
- Modify: `packages/shared-llm/tests/anthropic-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared-llm/tests/anthropic-client.test.ts` (just before the closing `});` of the `describe` block):

```ts
  it('throws LlmProviderError with ANTHROPIC_INVALID_KEY on 401', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('bad key', { status: 401 }));
    const client = new AnthropicLlmClient(cfg);
    const { LlmProviderError } = await import('../src/errors.js');

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'ANTHROPIC_INVALID_KEY',
        provider: 'anthropic',
      });
  });

  it('throws LlmProviderError with ANTHROPIC_RATE_LIMITED on 429', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('rate limited', { status: 429 }));
    const client = new AnthropicLlmClient(cfg);
    const { LlmProviderError } = await import('../src/errors.js');

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'ANTHROPIC_RATE_LIMITED',
        provider: 'anthropic',
      });
  });

  it('throws LlmProviderError with LLM_REQUEST_FAILED on 500', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('server err', { status: 500 }));
    const client = new AnthropicLlmClient(cfg);
    const { LlmProviderError } = await import('../src/errors.js');

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'LLM_REQUEST_FAILED',
        provider: 'anthropic',
      });
  });
```

Also update the existing line:

```ts
    await expect(client.complete('sys', 'usr')).rejects.toThrow(/Anthropic API 429.*rate limited/);
```

Replace it with:

```ts
    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({ code: 'ANTHROPIC_RATE_LIMITED' });
```

(That existing test was the 429 case but expected the legacy plain-Error shape. After this task it must expect the new structured error.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- anthropic-client.test.ts`
Expected: FAIL — the new tests + the updated 429 test all fail because the implementation still throws plain `Error`.

- [ ] **Step 3: Update `AnthropicLlmClient` to throw `LlmProviderError`**

In `packages/shared-llm/src/index.ts`, locate the `if (!response.ok)` block inside `AnthropicLlmClient.complete`. Replace:

```ts
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Anthropic API ${response.status}: ${detail.slice(0, 200)}`);
    }
```

With:

```ts
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const truncated = detail.slice(0, 200);
      if (response.status === 401) {
        throw new LlmProviderError(
          'ANTHROPIC_INVALID_KEY',
          `Anthropic API 401: ${truncated}`,
          'anthropic',
          ['Re-run setup_anthropic with a valid key'],
        );
      }
      if (response.status === 429) {
        throw new LlmProviderError(
          'ANTHROPIC_RATE_LIMITED',
          `Anthropic API 429: ${truncated}`,
          'anthropic',
          ['Wait and retry, or switch to Ollama with set_active_llm_provider'],
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `Anthropic API ${response.status}: ${truncated}`,
        'anthropic',
        ['Check network and provider status'],
      );
    }
```

Also add the import at the top of `packages/shared-llm/src/index.ts`:

```ts
import { LlmProviderError } from './errors.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- anthropic-client.test.ts`
Expected: PASS — all 7 tests (4 original including the updated 429, plus 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-llm/src/index.ts packages/shared-llm/tests/anthropic-client.test.ts
git commit -m "feat(shared-llm): AnthropicLlmClient throws LlmProviderError with mapped codes (#89)"
```

---

### Task 1.3: `OllamaLlmClient` — implements `LlmClient` against `/api/generate`

**Files:**
- Create: `packages/shared-llm/src/ollama.ts`
- Create: `packages/shared-llm/tests/_fixtures/ollama-responses.ts`
- Test: `packages/shared-llm/tests/ollama.test.ts`

- [ ] **Step 1: Write fixture file**

Create `packages/shared-llm/tests/_fixtures/ollama-responses.ts`:

```ts
export const OLLAMA_GENERATE_OK = {
  model: 'qwen2.5:14b',
  created_at: '2026-06-05T16:00:00Z',
  response: 'hello world',
  done: true,
  prompt_eval_count: 12,
  eval_count: 4,
};

export const OLLAMA_TAGS_OK = {
  models: [
    { name: 'qwen2.5:14b', size: 9000000000, modified_at: '2026-06-01T00:00:00Z' },
    { name: 'llama3.1:8b', size: 4500000000, modified_at: '2026-06-01T00:00:00Z' },
  ],
};
```

- [ ] **Step 2: Write the failing tests**

Create `packages/shared-llm/tests/ollama.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { OllamaLlmClient } from '../src/ollama.js';
import { LlmProviderError } from '../src/errors.js';
import { OLLAMA_GENERATE_OK } from './_fixtures/ollama-responses.js';

describe('OllamaLlmClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs combined system+user prompt to /api/generate', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify(OLLAMA_GENERATE_OK),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    const result = await client.complete('You are helpful.', 'Say hi.');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      }),
    );
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('qwen2.5:14b');
    expect(body.stream).toBe(false);
    expect(body.prompt).toBe('You are helpful.\n\nSay hi.');
    expect(result).toEqual({
      text: 'hello world',
      usage: { inputTokens: 12, outputTokens: 4 },
    });
  });

  it('honors opts.model and opts.maxTokens overrides', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify(OLLAMA_GENERATE_OK),
      { status: 200 },
    ));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await client.complete('sys', 'usr', { model: 'llama3.1:8b', maxTokens: 500 });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('llama3.1:8b');
    expect(body.options).toEqual({ num_predict: 500 });
  });

  it('throws OLLAMA_MODEL_NOT_PULLED on 404', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('model not found', { status: 404 }));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'OLLAMA_MODEL_NOT_PULLED',
        provider: 'ollama',
      });
  });

  it('throws OLLAMA_UNREACHABLE on connection refused (TypeError from fetch)', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    );
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'OLLAMA_UNREACHABLE',
        provider: 'ollama',
      });
  });

  it('throws OLLAMA_TIMEOUT when AbortSignal fires', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new DOMException('aborted', 'AbortError'), { name: 'AbortError' }),
    );
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b', timeoutMs: 1 });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'OLLAMA_TIMEOUT',
        provider: 'ollama',
      });
  });

  it('throws LLM_REQUEST_FAILED on unexpected 500', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('boom', { status: 500 }));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await expect(client.complete('sys', 'usr'))
      .rejects.toMatchObject({
        constructor: LlmProviderError,
        code: 'LLM_REQUEST_FAILED',
        provider: 'ollama',
      });
  });

  it('omits options.num_predict when maxTokens not supplied', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify(OLLAMA_GENERATE_OK),
      { status: 200 },
    ));
    const client = new OllamaLlmClient({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    await client.complete('sys', 'usr');

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.options).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- ollama.test.ts`
Expected: FAIL — `Cannot find module '../src/ollama.js'`.

- [ ] **Step 4: Implement `OllamaLlmClient`**

Create `packages/shared-llm/src/ollama.ts`:

```ts
import type { LlmClient, LlmResponse } from './index.js';
import { LlmProviderError } from './errors.js';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  /** Per-request timeout in ms. Default 120000 (120s). */
  timeoutMs?: number;
}

interface OllamaGenerateResponse {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class OllamaLlmClient implements LlmClient {
  constructor(private readonly cfg: OllamaConfig) {}

  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: { model?: string; maxTokens?: number } = {},
  ): Promise<LlmResponse> {
    const model = opts.model ?? this.cfg.model;
    const timeoutMs = this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const body: Record<string, unknown> = {
      model,
      prompt: `${systemPrompt}\n\n${userPrompt}`,
      stream: false,
    };
    if (opts.maxTokens !== undefined) {
      body.options = { num_predict: opts.maxTokens };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.cfg.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const e = err as { name?: string; cause?: { code?: string } };
      if (e?.name === 'AbortError') {
        throw new LlmProviderError(
          'OLLAMA_TIMEOUT',
          `Ollama request exceeded ${timeoutMs}ms timeout`,
          'ollama',
          ['Try a smaller model, or raise CC_OLLAMA_TIMEOUT_MS'],
        );
      }
      if (e?.cause?.code === 'ECONNREFUSED' || (err instanceof TypeError && /fetch failed/i.test(String(err)))) {
        throw new LlmProviderError(
          'OLLAMA_UNREACHABLE',
          `Could not reach Ollama at ${this.cfg.baseUrl}`,
          'ollama',
          [`Start Ollama with 'ollama serve', or switch providers with set_active_llm_provider`],
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `Ollama request failed: ${err instanceof Error ? err.message : String(err)}`,
        'ollama',
        ['Check network and provider status'],
      );
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const truncated = detail.slice(0, 200);
      if (response.status === 404) {
        throw new LlmProviderError(
          'OLLAMA_MODEL_NOT_PULLED',
          `Ollama 404: ${truncated}`,
          'ollama',
          [`Run: ollama pull ${model}`],
        );
      }
      throw new LlmProviderError(
        'LLM_REQUEST_FAILED',
        `Ollama API ${response.status}: ${truncated}`,
        'ollama',
        ['Check network and provider status'],
      );
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    const text = payload.response ?? '';
    const usage = (payload.prompt_eval_count !== undefined || payload.eval_count !== undefined)
      ? { inputTokens: payload.prompt_eval_count ?? 0, outputTokens: payload.eval_count ?? 0 }
      : undefined;
    return { text, usage };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- ollama.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-llm/src/ollama.ts packages/shared-llm/tests/ollama.test.ts packages/shared-llm/tests/_fixtures/ollama-responses.ts
git commit -m "feat(shared-llm): OllamaLlmClient with structured error mapping (#89)"
```

---

### Task 1.4: `resolveLlmClient` factory

**Files:**
- Create: `packages/shared-llm/src/resolve.ts`
- Test: `packages/shared-llm/tests/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared-llm/tests/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveLlmClient } from '../src/resolve.js';
import { AnthropicLlmClient } from '../src/index.js';
import { OllamaLlmClient } from '../src/ollama.js';
import { LlmProviderError } from '../src/errors.js';

describe('resolveLlmClient', () => {
  it('returns AnthropicLlmClient when provider=anthropic and anthropic config present', () => {
    const client = resolveLlmClient({
      provider: 'anthropic',
      anthropic: { apiKey: 'sk-test', model: 'claude-3' },
    });
    expect(client).toBeInstanceOf(AnthropicLlmClient);
  });

  it('returns OllamaLlmClient when provider=ollama and ollama config present', () => {
    const client = resolveLlmClient({
      provider: 'ollama',
      ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' },
    });
    expect(client).toBeInstanceOf(OllamaLlmClient);
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=anthropic but anthropic config absent', () => {
    expect(() => resolveLlmClient({ provider: 'anthropic' }))
      .toThrow(expect.objectContaining({
        constructor: LlmProviderError,
        code: 'LLM_PROVIDER_CONFIG_MISSING',
        provider: 'anthropic',
      }));
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=ollama but ollama config absent', () => {
    expect(() => resolveLlmClient({ provider: 'ollama' }))
      .toThrow(expect.objectContaining({
        constructor: LlmProviderError,
        code: 'LLM_PROVIDER_CONFIG_MISSING',
        provider: 'ollama',
      }));
  });

  it('throws LLM_PROVIDER_NOT_SET when provider value is not anthropic or ollama', () => {
    expect(() => resolveLlmClient({ provider: 'something' as never }))
      .toThrow(expect.objectContaining({
        constructor: LlmProviderError,
        code: 'LLM_PROVIDER_NOT_SET',
        provider: 'unknown',
      }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- resolve.test.ts`
Expected: FAIL — `Cannot find module '../src/resolve.js'`.

- [ ] **Step 3: Implement `resolve.ts`**

Create `packages/shared-llm/src/resolve.ts`:

```ts
import { AnthropicLlmClient, type AnthropicConfig, type LlmClient } from './index.js';
import { OllamaLlmClient, type OllamaConfig } from './ollama.js';
import { LlmProviderError } from './errors.js';

export interface ResolveInput {
  provider: 'anthropic' | 'ollama';
  anthropic?: AnthropicConfig;
  ollama?: OllamaConfig;
}

export function resolveLlmClient(input: ResolveInput): LlmClient {
  if (input.provider === 'anthropic') {
    if (!input.anthropic) {
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        'Active provider is anthropic but anthropic config was not supplied',
        'anthropic',
        ['Run setup_anthropic'],
      );
    }
    return new AnthropicLlmClient(input.anthropic);
  }
  if (input.provider === 'ollama') {
    if (!input.ollama) {
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        'Active provider is ollama but ollama config was not supplied',
        'ollama',
        ['Run setup_ollama'],
      );
    }
    return new OllamaLlmClient(input.ollama);
  }
  throw new LlmProviderError(
    'LLM_PROVIDER_NOT_SET',
    `Unknown provider: ${String(input.provider)}`,
    'unknown',
    ['Run set_active_llm_provider to choose anthropic or ollama'],
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- resolve.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-llm/src/resolve.ts packages/shared-llm/tests/resolve.test.ts
git commit -m "feat(shared-llm): resolveLlmClient factory for provider selection (#89)"
```

---

### Task 1.5: `recommendations.ts` — fetch + cache + fallback for the markdown page

**Files:**
- Create: `packages/shared-llm/src/recommendations.ts`
- Test: `packages/shared-llm/tests/recommendations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared-llm/tests/recommendations.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchRecommendedModels } from '../src/recommendations.js';

let tmpDir: string;
let cachePath: string;
let fallbackPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rec-models-'));
  cachePath = join(tmpDir, 'cache.md');
  fallbackPath = join(tmpDir, 'fallback.md');
  writeFileSync(fallbackPath, '# Fallback content');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchRecommendedModels', () => {
  it('returns network content and writes cache on successful fetch', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Network content', { status: 200 }),
    );

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Network content');
    expect(readFileSync(cachePath, 'utf-8')).toBe('# Network content');
  });

  it('returns fresh cache without hitting network when cache is within TTL', async () => {
    writeFileSync(cachePath, '# Cached content');
    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Cached content');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('re-fetches when cache exists but is older than TTL', async () => {
    writeFileSync(cachePath, '# Stale cache');
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    utimesSync(cachePath, oldTime, oldTime);
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Fresh content', { status: 200 }),
    );

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Fresh content');
  });

  it('returns stale cache when network fails and cache exists', async () => {
    writeFileSync(cachePath, '# Stale cache');
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    utimesSync(cachePath, oldTime, oldTime);
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Stale cache');
  });

  it('returns fallback when both network and cache absent', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Fallback content');
  });

  it('returns fallback when fetch returns non-OK and no cache', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('not found', { status: 404 }));

    const result = await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toBe('# Fallback content');
  });

  it('creates cache directory if it does not exist', async () => {
    const nestedCachePath = join(tmpDir, 'nested', 'deep', 'cache.md');
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Network', { status: 200 }),
    );

    await fetchRecommendedModels({
      url: 'http://example.test/models.md',
      cachePath: nestedCachePath,
      fallbackPath,
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(existsSync(nestedCachePath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- recommendations.test.ts`
Expected: FAIL — `Cannot find module '../src/recommendations.js'`.

- [ ] **Step 3: Implement `recommendations.ts`**

Create `packages/shared-llm/src/recommendations.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface FetchRecommendedModelsInput {
  url: string;
  cachePath: string;
  fallbackPath: string;
  ttlMs: number;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export async function fetchRecommendedModels(input: FetchRecommendedModelsInput): Promise<string> {
  const { url, cachePath, fallbackPath, ttlMs, timeoutMs = DEFAULT_TIMEOUT_MS } = input;

  if (existsSync(cachePath)) {
    const mtime = statSync(cachePath).mtimeMs;
    if (Date.now() - mtime < ttlMs) {
      return readFileSync(cachePath, 'utf-8');
    }
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);
    if (response.ok) {
      const text = await response.text();
      writeCache(cachePath, text);
      return text;
    }
  } catch {
    // fall through to cache / fallback
  }

  if (existsSync(cachePath)) {
    return readFileSync(cachePath, 'utf-8');
  }

  return readFileSync(fallbackPath, 'utf-8');
}

function writeCache(cachePath: string, content: string): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  const tmp = `${cachePath}.tmp`;
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, cachePath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @canvas-toolchain/shared-llm -- recommendations.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-llm/src/recommendations.ts packages/shared-llm/tests/recommendations.test.ts
git commit -m "feat(shared-llm): fetchRecommendedModels with cache + bundled fallback (#89)"
```

---

### Task 1.6: Re-export new modules from `shared-llm` package entry

**Files:**
- Modify: `packages/shared-llm/src/index.ts`

- [ ] **Step 1: Add re-exports at the bottom of `packages/shared-llm/src/index.ts`**

Append to the end of `packages/shared-llm/src/index.ts`:

```ts
export { OllamaLlmClient } from './ollama.js';
export type { OllamaConfig } from './ollama.js';
export { resolveLlmClient } from './resolve.js';
export type { ResolveInput } from './resolve.js';
export { LlmProviderError } from './errors.js';
export type { LlmProvider } from './errors.js';
export { fetchRecommendedModels } from './recommendations.js';
export type { FetchRecommendedModelsInput } from './recommendations.js';
```

- [ ] **Step 2: Build the package to verify TypeScript compiles**

Run: `npm run build --workspace @canvas-toolchain/shared-llm`
Expected: tsc exits 0; `dist/index.d.ts` includes the new exports.

- [ ] **Step 3: Verify all shared-llm tests still pass**

Run: `npm test --workspace @canvas-toolchain/shared-llm`
Expected: PASS — all tests from Tasks 1.1-1.5 plus the existing Anthropic tests.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-llm/src/index.ts
git commit -m "feat(shared-llm): re-export Ollama / resolve / errors / recommendations modules (#89)"
```

---

## Phase 2 — C&C Config Layer

### Task 2.1: Bundled fallback markdown page

**Files:**
- Create: `packages/command-and-control/src/recommended-models.fallback.md`
- Modify: `packages/command-and-control/tsconfig.json` (only if needed for non-TS asset inclusion — verify first)

- [ ] **Step 1: Create the bundled fallback file**

Create `packages/command-and-control/src/recommended-models.fallback.md`:

```markdown
# Recommended Models for Canvas Toolchain (Bundled Fallback)

This is the offline fallback copy. The live version lives at
`docs/recommended-models.md` in the canvas-toolchain repo and is fetched
at setup time when network is available.

---

## General-Purpose Models — by VRAM Tier

For canvas-toolchain's built-in LLM features (brainstorming, rubric, answers
bot), pick one model that fits your hardware tier.

### Tier: 32 GB (RTX 5090, A6000)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:32b` | [Ollama](https://ollama.com/library/qwen2.5:32b) | Strong generalist at this tier | ~20 GB |

### Tier: 24 GB (RTX 4090, RTX 3090)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:14b` | [Ollama](https://ollama.com/library/qwen2.5:14b) | Strong reasoning at moderate VRAM | ~10 GB |

### Tier: 16 GB (RTX 4080, base M-series Mac)

<!-- Open a PR with your tested model -->

### Tier: 6 GB

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:3b` | [Ollama](https://ollama.com/library/qwen2.5:3b) | Fast on modest laptops | ~3 GB |

---

## Task-Specialized Models

Not wired into canvas-toolchain by default. Install if you have specific
workflows where a finetune beats a generalist.

### Whisper (Lecture Audio Transcription)

Will be consumed by sub-project 3 (Panopto Whisper comparison) when it ships.
```

- [ ] **Step 2: Verify TypeScript build does not strip the file**

Run: `npm run build --workspace command-and-control-mcp`
Expected: tsc exits 0 (the markdown file isn't a TS source so tsc ignores it).

Check that the file is reachable at runtime: `node -e "console.log(require('node:fs').existsSync('packages/command-and-control/src/recommended-models.fallback.md'))"`
Expected: `true`.

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/src/recommended-models.fallback.md
git commit -m "feat(cc): bundled fallback for recommended-models markdown (#89)"
```

---

### Task 2.2: `setup_ollama` MCP tool

**Files:**
- Create: `packages/command-and-control/src/tools/setup_ollama.ts`
- Test: `packages/command-and-control/tests/tools/setup_ollama.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/tools/setup_ollama.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { setupOllama, loadOllamaConfig } from '../../src/tools/setup_ollama.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('setup_ollama discovery mode', () => {
  it('returns the bundled fallback markdown when no model arg and no network', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await setupOllama({});

    expect(result.mode).toBe('discovery');
    expect(result.recommendations).toMatch(/Recommended Models for Canvas Toolchain/);
    expect(result.nextStep).toMatch(/setup_ollama/);
  });

  it('returns network-fetched markdown when reachable', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('# Live recommendations\n\n## Tier: 32 GB\n', { status: 200 }),
    );

    const result = await setupOllama({});

    expect(result.mode).toBe('discovery');
    expect(result.recommendations).toBe('# Live recommendations\n\n## Tier: 32 GB\n');
  });
});

describe('setup_ollama commit mode', () => {
  function mockTagsAndGenerate(modelInTags: string) {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: modelInTags }] }), { status: 200 });
      }
      return new Response('not handled', { status: 500 });
    });
  }

  it('happy path: writes ollama-config.json atomically with 0o600 and returns ok', async () => {
    mockTagsAndGenerate('qwen2.5:14b');

    const result = await setupOllama({ model: 'qwen2.5:14b' });

    expect(result.mode).toBe('commit');
    expect(result.ok).toBe(true);
    expect(result.model).toBe('qwen2.5:14b');
    expect(result.baseUrl).toBe('http://localhost:11434');

    const configPath = join(ccHomeDir, 'ollama-config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config).toEqual({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });

    if (platform() !== 'win32') {
      const mode = statSync(configPath).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('honors custom baseUrl', async () => {
    mockTagsAndGenerate('qwen2.5:14b');

    const result = await setupOllama({ baseUrl: 'http://10.0.0.5:11434', model: 'qwen2.5:14b' });

    expect(result.ok).toBe(true);
    expect(result.baseUrl).toBe('http://10.0.0.5:11434');
    const config = JSON.parse(readFileSync(join(ccHomeDir, 'ollama-config.json'), 'utf-8'));
    expect(config.baseUrl).toBe('http://10.0.0.5:11434');
  });

  it('returns OLLAMA_UNREACHABLE when probe fails — does NOT write config', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('fetch failed'));

    const result = await setupOllama({ model: 'qwen2.5:14b' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OLLAMA_UNREACHABLE');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/ollama serve/)]));
    expect(existsSync(join(ccHomeDir, 'ollama-config.json'))).toBe(false);
  });

  it('returns OLLAMA_MODEL_NOT_PULLED when model absent from /api/tags', async () => {
    mockTagsAndGenerate('different-model');

    const result = await setupOllama({ model: 'qwen2.5:14b' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('OLLAMA_MODEL_NOT_PULLED');
    expect(result.fix).toEqual(expect.arrayContaining([expect.stringMatching(/ollama pull qwen2.5:14b/)]));
    expect(existsSync(join(ccHomeDir, 'ollama-config.json'))).toBe(false);
  });
});

describe('loadOllamaConfig', () => {
  it('throws when ollama-config.json is missing', () => {
    expect(() => loadOllamaConfig()).toThrow(/OLLAMA_NOT_CONFIGURED/);
  });

  it('returns the parsed config when present', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(
      join(ccHomeDir, 'ollama-config.json'),
      JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }),
    );
    expect(loadOllamaConfig()).toEqual({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' });
  });

  it('throws when the file is corrupt JSON', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'ollama-config.json'), '{ not valid');
    expect(() => loadOllamaConfig()).toThrow(/OLLAMA_NOT_CONFIGURED/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace command-and-control-mcp -- setup_ollama.test.ts`
Expected: FAIL — `Cannot find module '../../src/tools/setup_ollama.js'`.

- [ ] **Step 3: Implement `setup_ollama.ts`**

Create `packages/command-and-control/src/tools/setup_ollama.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRecommendedModels } from '@canvas-toolchain/shared-llm';
import { getCcHomePath } from '../kb/config.js';

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_RECOMMENDATIONS_URL =
  'https://raw.githubusercontent.com/Ryfter/canvas-toolchain/main/docs/recommended-models.md';
const RECOMMENDATIONS_TTL_MS = 24 * 60 * 60 * 1000;

export interface OllamaConfigFile {
  baseUrl: string;
  model: string;
}

export interface SetupOllamaInput {
  baseUrl?: string;
  model?: string;
}

export type SetupOllamaResult =
  | {
      mode: 'discovery';
      baseUrl: string;
      recommendations: string;
      nextStep: string;
    }
  | {
      mode: 'commit';
      ok: true;
      baseUrl: string;
      model: string;
      configPath: string;
    }
  | {
      mode: 'commit';
      ok: false;
      error: string;
      message: string;
      fix: string[];
    };

function getOllamaConfigPath(): string {
  return join(getCcHomePath(), 'ollama-config.json');
}

function getCachePath(): string {
  return join(getCcHomePath(), 'cache', 'recommended-models.md');
}

function getFallbackPath(): string {
  return fileURLToPath(new URL('../recommended-models.fallback.md', import.meta.url));
}

export function loadOllamaConfig(): OllamaConfigFile {
  const path = getOllamaConfigPath();
  if (!existsSync(path)) {
    throw new Error('OLLAMA_NOT_CONFIGURED: Run setup_ollama with a chosen model.');
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<OllamaConfigFile>;
    if (!parsed.baseUrl || !parsed.model) {
      throw new Error('OLLAMA_NOT_CONFIGURED: ollama-config.json missing fields. Re-run setup_ollama.');
    }
    return { baseUrl: parsed.baseUrl, model: parsed.model };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('OLLAMA_NOT_CONFIGURED')) throw err;
    throw new Error('OLLAMA_NOT_CONFIGURED: ollama-config.json is corrupt. Re-run setup_ollama.');
  }
}

async function probeTags(baseUrl: string): Promise<{ ok: true; tags: string[] } | { ok: false }> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(tid);
    if (!response.ok) return { ok: false };
    const payload = (await response.json()) as { models?: Array<{ name?: string }> };
    const tags = (payload.models ?? []).map((m) => m.name ?? '').filter(Boolean);
    return { ok: true, tags };
  } catch {
    return { ok: false };
  }
}

export async function setupOllama(input: SetupOllamaInput): Promise<SetupOllamaResult> {
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL;
  const recommendationsUrl = process.env.CC_RECOMMENDED_MODELS_URL ?? DEFAULT_RECOMMENDATIONS_URL;

  if (!input.model) {
    const recommendations = await fetchRecommendedModels({
      url: recommendationsUrl,
      cachePath: getCachePath(),
      fallbackPath: getFallbackPath(),
      ttlMs: RECOMMENDATIONS_TTL_MS,
    });
    return {
      mode: 'discovery',
      baseUrl,
      recommendations,
      nextStep: 'Pick a model from above and re-run setup_ollama with { model: "<id>" }.',
    };
  }

  const probe = await probeTags(baseUrl);
  if (!probe.ok) {
    return {
      mode: 'commit',
      ok: false,
      error: 'OLLAMA_UNREACHABLE',
      message: `Could not reach Ollama at ${baseUrl}/api/tags`,
      fix: [`Start Ollama with 'ollama serve', or switch providers with set_active_llm_provider`],
    };
  }
  if (!probe.tags.includes(input.model)) {
    return {
      mode: 'commit',
      ok: false,
      error: 'OLLAMA_MODEL_NOT_PULLED',
      message: `Model '${input.model}' is not present in /api/tags`,
      fix: [`Run: ollama pull ${input.model}`],
    };
  }

  const config: OllamaConfigFile = { baseUrl, model: input.model };
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getOllamaConfigPath();
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  return {
    mode: 'commit',
    ok: true,
    baseUrl,
    model: input.model,
    configPath,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace command-and-control-mcp -- setup_ollama.test.ts`
Expected: PASS — all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/setup_ollama.ts packages/command-and-control/tests/tools/setup_ollama.test.ts
git commit -m "feat(cc): setup_ollama MCP tool (discovery + commit modes) (#89)"
```

---

### Task 2.3: `set_active_llm_provider` MCP tool

**Files:**
- Create: `packages/command-and-control/src/tools/set_active_llm_provider.ts`
- Test: `packages/command-and-control/tests/tools/set_active_llm_provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/tools/set_active_llm_provider.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { setActiveLlmProvider, loadActiveProvider } from '../../src/tools/set_active_llm_provider.js';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

function seedAnthropicConfig() {
  writeFileSync(join(ccHomeDir, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
}

function seedOllamaConfig() {
  writeFileSync(join(ccHomeDir, 'ollama-config.json'), JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }));
}

describe('setActiveLlmProvider', () => {
  it('writes llm-provider.json with provider=anthropic when anthropic-config.json exists', async () => {
    seedAnthropicConfig();
    const result = await setActiveLlmProvider({ provider: 'anthropic' });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('anthropic');
    const path = join(ccHomeDir, 'llm-provider.json');
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ provider: 'anthropic' });

    if (platform() !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it('writes llm-provider.json with provider=ollama when ollama-config.json exists', async () => {
    seedOllamaConfig();
    const result = await setActiveLlmProvider({ provider: 'ollama' });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('ollama');
    expect(JSON.parse(readFileSync(join(ccHomeDir, 'llm-provider.json'), 'utf-8'))).toEqual({ provider: 'ollama' });
  });

  it('returns PROVIDER_NOT_CONFIGURED when anthropic chosen but config missing', async () => {
    const result = await setActiveLlmProvider({ provider: 'anthropic' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
    expect(result.fix).toEqual(['Run setup_anthropic first']);
    expect(existsSync(join(ccHomeDir, 'llm-provider.json'))).toBe(false);
  });

  it('returns PROVIDER_NOT_CONFIGURED when ollama chosen but config missing', async () => {
    const result = await setActiveLlmProvider({ provider: 'ollama' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('PROVIDER_NOT_CONFIGURED');
    expect(result.fix).toEqual(['Run setup_ollama first']);
    expect(existsSync(join(ccHomeDir, 'llm-provider.json'))).toBe(false);
  });

  it('returns INVALID_PROVIDER for any other value', async () => {
    seedAnthropicConfig();
    const result = await setActiveLlmProvider({ provider: 'gemini' as never });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_PROVIDER');
  });
});

describe('loadActiveProvider', () => {
  it('throws when llm-provider.json absent', () => {
    expect(() => loadActiveProvider()).toThrow(/LLM_PROVIDER_NOT_SET/);
  });

  it('returns the provider name when file present', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'llm-provider.json'), JSON.stringify({ provider: 'ollama' }));
    expect(loadActiveProvider()).toBe('ollama');
  });

  it('throws when file is corrupt', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'llm-provider.json'), 'not json');
    expect(() => loadActiveProvider()).toThrow(/LLM_PROVIDER_NOT_SET/);
  });

  it('throws when provider value is not anthropic or ollama', () => {
    mkdirSync(ccHomeDir, { recursive: true });
    writeFileSync(join(ccHomeDir, 'llm-provider.json'), JSON.stringify({ provider: 'gemini' }));
    expect(() => loadActiveProvider()).toThrow(/LLM_PROVIDER_NOT_SET/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace command-and-control-mcp -- set_active_llm_provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `set_active_llm_provider.ts`**

Create `packages/command-and-control/src/tools/set_active_llm_provider.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export type ActiveProvider = 'anthropic' | 'ollama';

export interface SetActiveLlmProviderInput {
  provider: ActiveProvider;
}

export type SetActiveLlmProviderResult =
  | { ok: true; provider: ActiveProvider; configPath: string }
  | { ok: false; error: string; message: string; fix: string[] };

function getActiveProviderPath(): string {
  return join(getCcHomePath(), 'llm-provider.json');
}

function getAnthropicConfigPath(): string {
  return join(getCcHomePath(), 'anthropic-config.json');
}

function getOllamaConfigPath(): string {
  return join(getCcHomePath(), 'ollama-config.json');
}

export function loadActiveProvider(): ActiveProvider {
  const path = getActiveProviderPath();
  if (!existsSync(path)) {
    throw new Error('LLM_PROVIDER_NOT_SET: Run set_active_llm_provider with anthropic or ollama.');
  }
  let parsed: { provider?: string };
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    throw new Error('LLM_PROVIDER_NOT_SET: llm-provider.json is corrupt. Re-run set_active_llm_provider.');
  }
  if (parsed.provider !== 'anthropic' && parsed.provider !== 'ollama') {
    throw new Error(`LLM_PROVIDER_NOT_SET: invalid provider '${parsed.provider}'. Re-run set_active_llm_provider.`);
  }
  return parsed.provider;
}

export async function setActiveLlmProvider(input: SetActiveLlmProviderInput): Promise<SetActiveLlmProviderResult> {
  if (input.provider !== 'anthropic' && input.provider !== 'ollama') {
    return {
      ok: false,
      error: 'INVALID_PROVIDER',
      message: `Provider must be 'anthropic' or 'ollama', got '${String(input.provider)}'`,
      fix: [`Provider must be 'anthropic' or 'ollama'`],
    };
  }

  if (input.provider === 'anthropic' && !existsSync(getAnthropicConfigPath())) {
    return {
      ok: false,
      error: 'PROVIDER_NOT_CONFIGURED',
      message: 'anthropic-config.json is missing',
      fix: ['Run setup_anthropic first'],
    };
  }
  if (input.provider === 'ollama' && !existsSync(getOllamaConfigPath())) {
    return {
      ok: false,
      error: 'PROVIDER_NOT_CONFIGURED',
      message: 'ollama-config.json is missing',
      fix: ['Run setup_ollama first'],
    };
  }

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getActiveProviderPath();
  const tmp = `${configPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ provider: input.provider }, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, configPath);

  return { ok: true, provider: input.provider, configPath };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace command-and-control-mcp -- set_active_llm_provider.test.ts`
Expected: PASS — all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/set_active_llm_provider.ts packages/command-and-control/tests/tools/set_active_llm_provider.test.ts
git commit -m "feat(cc): set_active_llm_provider MCP tool (#89)"
```

---

### Task 2.4: C&C resolver shim `src/llm/resolve.ts`

**Files:**
- Create: `packages/command-and-control/src/llm/resolve.ts`
- Test: `packages/command-and-control/tests/llm/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/command-and-control/tests/llm/resolve.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveActiveLlmClient } from '../../src/llm/resolve.js';
import { AnthropicLlmClient, OllamaLlmClient, LlmProviderError } from '@canvas-toolchain/shared-llm';

let ccHomeDir: string;
const ORIGINAL_CC_HOME = process.env.CC_HOME;

beforeEach(() => {
  ccHomeDir = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = ccHomeDir;
});

afterEach(() => {
  rmSync(ccHomeDir, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

function seedAnthropic() {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
}

function seedOllama() {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'ollama-config.json'), JSON.stringify({ baseUrl: 'http://localhost:11434', model: 'qwen2.5:14b' }));
}

function seedProvider(provider: 'anthropic' | 'ollama') {
  mkdirSync(ccHomeDir, { recursive: true });
  writeFileSync(join(ccHomeDir, 'llm-provider.json'), JSON.stringify({ provider }));
}

describe('resolveActiveLlmClient', () => {
  it('returns AnthropicLlmClient when provider=anthropic + anthropic-config present', () => {
    seedAnthropic();
    seedProvider('anthropic');
    expect(resolveActiveLlmClient()).toBeInstanceOf(AnthropicLlmClient);
  });

  it('returns OllamaLlmClient when provider=ollama + ollama-config present', () => {
    seedOllama();
    seedProvider('ollama');
    expect(resolveActiveLlmClient()).toBeInstanceOf(OllamaLlmClient);
  });

  it('throws LLM_PROVIDER_NOT_SET when llm-provider.json is missing', () => {
    seedAnthropic();
    expect(() => resolveActiveLlmClient()).toThrow(
      expect.objectContaining({ constructor: LlmProviderError, code: 'LLM_PROVIDER_NOT_SET' }),
    );
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=anthropic but anthropic-config missing', () => {
    seedProvider('anthropic');
    expect(() => resolveActiveLlmClient()).toThrow(
      expect.objectContaining({ constructor: LlmProviderError, code: 'LLM_PROVIDER_CONFIG_MISSING' }),
    );
  });

  it('throws LLM_PROVIDER_CONFIG_MISSING when provider=ollama but ollama-config missing', () => {
    seedProvider('ollama');
    expect(() => resolveActiveLlmClient()).toThrow(
      expect.objectContaining({ constructor: LlmProviderError, code: 'LLM_PROVIDER_CONFIG_MISSING' }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace command-and-control-mcp -- llm/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resolve.ts`**

Create `packages/command-and-control/src/llm/resolve.ts`:

```ts
import { resolveLlmClient, LlmProviderError, type LlmClient } from '@canvas-toolchain/shared-llm';
import { loadActiveProvider } from '../tools/set_active_llm_provider.js';
import { loadAnthropicConfig } from '../tools/setup_anthropic.js';
import { loadOllamaConfig } from '../tools/setup_ollama.js';

export function resolveActiveLlmClient(): LlmClient {
  let provider: 'anthropic' | 'ollama';
  try {
    provider = loadActiveProvider();
  } catch (err) {
    throw new LlmProviderError(
      'LLM_PROVIDER_NOT_SET',
      err instanceof Error ? err.message : String(err),
      'unknown',
      ['Run set_active_llm_provider to choose anthropic or ollama'],
    );
  }

  if (provider === 'anthropic') {
    try {
      const cfg = loadAnthropicConfig();
      return resolveLlmClient({
        provider: 'anthropic',
        anthropic: { apiKey: cfg.apiKey, model: cfg.model },
      });
    } catch (err) {
      if (err instanceof LlmProviderError) throw err;
      throw new LlmProviderError(
        'LLM_PROVIDER_CONFIG_MISSING',
        err instanceof Error ? err.message : String(err),
        'anthropic',
        ['Run setup_anthropic'],
      );
    }
  }

  try {
    const cfg = loadOllamaConfig();
    const timeoutOverride = process.env.CC_OLLAMA_TIMEOUT_MS
      ? Number(process.env.CC_OLLAMA_TIMEOUT_MS)
      : undefined;
    return resolveLlmClient({
      provider: 'ollama',
      ollama: {
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        ...(timeoutOverride !== undefined && !Number.isNaN(timeoutOverride) ? { timeoutMs: timeoutOverride } : {}),
      },
    });
  } catch (err) {
    if (err instanceof LlmProviderError) throw err;
    throw new LlmProviderError(
      'LLM_PROVIDER_CONFIG_MISSING',
      err instanceof Error ? err.message : String(err),
      'ollama',
      ['Run setup_ollama'],
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace command-and-control-mcp -- llm/resolve.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/llm/resolve.ts packages/command-and-control/tests/llm/resolve.test.ts
git commit -m "feat(cc): resolveActiveLlmClient — reads provider + config, returns client (#89)"
```

---

### Task 2.5: Register `setup_ollama` and `set_active_llm_provider` MCP tools

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Locate the existing tool registrations**

Run: `rg "setup_anthropic" packages/command-and-control/src/index.ts -n`
Note the line numbers where `setup_anthropic` is imported and registered.

- [ ] **Step 2: Add imports and tool registrations**

In `packages/command-and-control/src/index.ts`, add alongside the existing setup_anthropic import:

```ts
import { setupOllama } from './tools/setup_ollama.js';
import { setActiveLlmProvider } from './tools/set_active_llm_provider.js';
```

Then add two new `server.tool(...)` registrations alongside `setup_anthropic`. Use the existing `setup_anthropic` registration as the structural template — exact line numbers will vary, so locate the registration and place the new ones adjacent to it. The two new registrations:

```ts
server.tool(
  'setup_ollama',
  'Configure Ollama as the local generation LLM. Discovery mode (no model) returns the recommended-models markdown. Commit mode (with model) validates the model is pulled and writes ollama-config.json.',
  {
    baseUrl: z.string().optional().describe('Ollama base URL. Default http://localhost:11434.'),
    model: z.string().optional().describe('Ollama model ID. Omit for discovery mode.'),
  },
  async (input) => {
    const result = await setupOllama(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  'set_active_llm_provider',
  'Set the active generation LLM provider. Must be anthropic or ollama. Refuses to set a provider whose config file is absent.',
  {
    provider: z.enum(['anthropic', 'ollama']).describe('anthropic or ollama'),
  },
  async (input) => {
    const result = await setActiveLlmProvider(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);
```

If the existing `setup_anthropic` registration uses a different wrapper helper (e.g., a `wrapTool` utility), match that pattern instead of the raw `server.tool(...)` shape shown here. Read the surrounding code first to confirm.

- [ ] **Step 3: Build to verify TypeScript compiles**

Run: `npm run build --workspace command-and-control-mcp`
Expected: tsc exits 0.

- [ ] **Step 4: Verify all existing tests still pass**

Run: `npm test --workspace command-and-control-mcp`
Expected: PASS — including all new Phase 2 tests and unchanged existing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(cc): register setup_ollama + set_active_llm_provider MCP tools (#89)"
```

---

## Phase 3 — Wire Call Sites Through the Resolver

### Task 3.1: Brainstorm — route through `resolveActiveLlmClient`

**Files:**
- Modify: `packages/command-and-control/src/tools/brainstorm/llm_client.ts`
- Modify: `packages/command-and-control/tests/tools/workflows/brainstorm_interactive.test.ts`

- [ ] **Step 1: Add a test that confirms the default code path uses the resolver**

Append to `packages/command-and-control/tests/tools/workflows/brainstorm_interactive.test.ts` inside the main describe block (place the new test alongside existing ones):

```ts
  it('uses resolveActiveLlmClient when no LlmClient hook is supplied', async () => {
    const ccHome = mkdtempSync(join(tmpdir(), 'cc-home-brainstorm-'));
    const originalHome = process.env.CC_HOME;
    process.env.CC_HOME = ccHome;
    try {
      writeFileSync(join(ccHome, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
      writeFileSync(join(ccHome, 'llm-provider.json'), JSON.stringify({ provider: 'anthropic' }));

      const { resolveActiveLlmClient } = await import('../../../src/llm/resolve.js');
      const client = resolveActiveLlmClient();
      expect(client).toBeDefined();
    } finally {
      rmSync(ccHome, { recursive: true, force: true });
      if (originalHome === undefined) delete process.env.CC_HOME;
      else process.env.CC_HOME = originalHome;
    }
  });
```

You may need to add imports at the top of the test file:

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
```

- [ ] **Step 2: Run the test to verify it passes for the resolver alone**

Run: `npm test --workspace command-and-control-mcp -- brainstorm_interactive.test.ts`
Expected: existing tests pass; the new test confirms `resolveActiveLlmClient` returns a client when both configs are seeded.

- [ ] **Step 3: Modify `brainstorm/llm_client.ts` to route through the resolver by default**

Open `packages/command-and-control/src/tools/brainstorm/llm_client.ts`. Replace the entire file with:

```ts
// Compat shim — real implementation lives in @canvas-toolchain/shared-llm.
// Existing imports of `LlmClient`, `LlmResponse`, `AnthropicLlmClient`, `AnthropicConfig`
// continue to work. New construction routes through resolveActiveLlmClient so the
// brainstorm flow honors the active provider (anthropic or ollama).
export type { LlmClient, LlmResponse, AnthropicConfig } from '@canvas-toolchain/shared-llm';
export { AnthropicLlmClient as SharedAnthropicLlmClient } from '@canvas-toolchain/shared-llm';

import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { resolveActiveLlmClient } from '../../llm/resolve.js';

/** Backward-compat wrapper that resolves the active provider on construction.
 *  Existing call sites that did `new AnthropicLlmClient()` (no args) now transparently
 *  use whichever provider the user has selected via set_active_llm_provider. */
export class AnthropicLlmClient implements LlmClient {
  private readonly inner: LlmClient;
  constructor() {
    this.inner = resolveActiveLlmClient();
  }
  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts?: { model?: string; maxTokens?: number },
  ) {
    return this.inner.complete(systemPrompt, userPrompt, opts);
  }
}
```

The class name `AnthropicLlmClient` is preserved for backward compatibility with existing callers — but its behavior is now provider-agnostic. Renaming the class to something neutral (e.g., `ActiveLlmClient`) is a follow-up cleanup, not in scope for this issue.

- [ ] **Step 4: Run brainstorm tests to verify they still pass**

Run: `npm test --workspace command-and-control-mcp -- brainstorm`
Expected: PASS — all brainstorm tests including the new one. Existing tests inject a fake client via the hooks pattern, so they don't depend on the resolver.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/brainstorm/llm_client.ts packages/command-and-control/tests/tools/workflows/brainstorm_interactive.test.ts
git commit -m "feat(cc): brainstorm routes through resolveActiveLlmClient by default (#89)"
```

---

### Task 3.2: Rubric — route through `resolveActiveLlmClient`

**Files:**
- Modify: `packages/command-and-control/src/tools/rubric/llm_client.ts`
- Modify: `packages/command-and-control/tests/tools/workflows/draft_student_rubric.test.ts`

- [ ] **Step 1: Add a resolver-path test to the rubric test file**

Append to `packages/command-and-control/tests/tools/workflows/draft_student_rubric.test.ts` inside the main describe block:

```ts
  it('uses resolveActiveLlmClient when no LlmClient hook is supplied', async () => {
    const ccHome = mkdtempSync(join(tmpdir(), 'cc-home-rubric-'));
    const originalHome = process.env.CC_HOME;
    process.env.CC_HOME = ccHome;
    try {
      writeFileSync(join(ccHome, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
      writeFileSync(join(ccHome, 'llm-provider.json'), JSON.stringify({ provider: 'anthropic' }));

      const { resolveActiveLlmClient } = await import('../../../src/llm/resolve.js');
      const client = resolveActiveLlmClient();
      expect(client).toBeDefined();
    } finally {
      rmSync(ccHome, { recursive: true, force: true });
      if (originalHome === undefined) delete process.env.CC_HOME;
      else process.env.CC_HOME = originalHome;
    }
  });
```

Add imports at the top if missing:

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test --workspace command-and-control-mcp -- draft_student_rubric.test.ts`
Expected: existing tests pass + new resolver test passes.

- [ ] **Step 3: Modify `rubric/llm_client.ts` to use the resolver**

Open `packages/command-and-control/src/tools/rubric/llm_client.ts`. Replace its entire contents with:

```ts
// Compat shim — real implementation lives in @canvas-toolchain/shared-llm.
// Existing imports of `LlmClient`, `LlmResponse`, `AnthropicLlmClient`, `AnthropicConfig`
// continue to work. New construction routes through resolveActiveLlmClient so the
// rubric flow honors the active provider (anthropic or ollama).
export type { LlmClient, LlmResponse, AnthropicConfig } from '@canvas-toolchain/shared-llm';
export { AnthropicLlmClient as SharedAnthropicLlmClient } from '@canvas-toolchain/shared-llm';

import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { resolveActiveLlmClient } from '../../llm/resolve.js';

/** Backward-compat wrapper that resolves the active provider on construction. */
export class AnthropicLlmClient implements LlmClient {
  private readonly inner: LlmClient;
  constructor() {
    this.inner = resolveActiveLlmClient();
  }
  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts?: { model?: string; maxTokens?: number },
  ) {
    return this.inner.complete(systemPrompt, userPrompt, opts);
  }
}
```

- [ ] **Step 4: Run rubric tests to verify they still pass**

Run: `npm test --workspace command-and-control-mcp -- rubric`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/rubric/llm_client.ts packages/command-and-control/tests/tools/workflows/draft_student_rubric.test.ts
git commit -m "feat(cc): rubric routes through resolveActiveLlmClient by default (#89)"
```

---

### Task 3.3: Answers bot — route through `resolveActiveLlmClient`

**Files:**
- Modify: `packages/command-and-control/src/tools/answers/retrieval/answer.ts`
- Modify: `packages/command-and-control/tests/answers/retrieval/answer.test.ts`

- [ ] **Step 1: Add a resolver-path test to the answers test file**

Append to `packages/command-and-control/tests/answers/retrieval/answer.test.ts` inside the main describe block:

```ts
  it('uses resolveActiveLlmClient when no LlmClient hook is supplied', async () => {
    const ccHome = mkdtempSync(join(tmpdir(), 'cc-home-answer-'));
    const originalHome = process.env.CC_HOME;
    process.env.CC_HOME = ccHome;
    try {
      writeFileSync(join(ccHome, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
      writeFileSync(join(ccHome, 'llm-provider.json'), JSON.stringify({ provider: 'anthropic' }));

      const { resolveActiveLlmClient } = await import('../../../src/llm/resolve.js');
      const client = resolveActiveLlmClient();
      expect(client).toBeDefined();
    } finally {
      rmSync(ccHome, { recursive: true, force: true });
      if (originalHome === undefined) delete process.env.CC_HOME;
      else process.env.CC_HOME = originalHome;
    }
  });
```

Add imports at the top if missing:

```ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test --workspace command-and-control-mcp -- answer.test.ts`
Expected: existing tests pass + new resolver test passes.

- [ ] **Step 3: Modify `answers/retrieval/answer.ts` to use the resolver by default**

Open `packages/command-and-control/src/tools/answers/retrieval/answer.ts`. The current default-client construction is:

```ts
const llm = hooks.llm ?? new AnthropicLlmClient(loadAnthropicConfig());
```

Replace it with:

```ts
const llm = hooks.llm ?? resolveActiveLlmClient();
```

Update the imports at the top of the file. Replace:

```ts
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../../setup_anthropic.js';
```

With:

```ts
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { resolveActiveLlmClient } from '../../../llm/resolve.js';
```

- [ ] **Step 4: Run answers tests to verify they still pass**

Run: `npm test --workspace command-and-control-mcp -- answers`
Expected: PASS — all answers tests, including the new resolver test.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/answers/retrieval/answer.ts packages/command-and-control/tests/answers/retrieval/answer.test.ts
git commit -m "feat(cc): answers bot routes through resolveActiveLlmClient by default (#89)"
```

---

## Phase 4 — Cleanup of Old `OllamaAdapter`

### Task 4.1: Verify deletion safety and remove the old single-arg `OllamaAdapter`

**Files:**
- Delete (conditional): `packages/command-and-control/src/llm/ollama_adapter.ts`
- Delete (conditional): `packages/command-and-control/src/llm/client.ts`

- [ ] **Step 1: Check for any consumers of the old interface**

Run: `rg "from ['\"]\\.\\./llm/client" packages/command-and-control/src`
Run: `rg "from ['\"]\\./client" packages/command-and-control/src/llm`
Run: `rg "from ['\"]\\.\\./llm/ollama_adapter" packages/command-and-control/src`
Run: `rg "OllamaAdapter" packages/command-and-control/src`

Expected: no matches (or only matches inside `ollama_adapter.ts` itself).

- [ ] **Step 2: Delete the old adapter (only if Step 1 found no external consumers)**

If no external consumers were found:

```bash
git rm packages/command-and-control/src/llm/ollama_adapter.ts
git rm packages/command-and-control/src/llm/client.ts
```

If external consumers WERE found in Step 1 (an unexpected outcome — neither file should have other consumers per the spec): do **not** delete. Instead:

1. Open each file.
2. Add a `@deprecated` JSDoc comment at the top: `/** @deprecated Use @canvas-toolchain/shared-llm instead. */`
3. Open a follow-up issue noting the migration is incomplete and reference this task in the issue body.
4. Skip Step 3 of this task.

- [ ] **Step 3: Build and test to verify no regression**

Run: `npm run build --workspace command-and-control-mcp`
Run: `npm test --workspace command-and-control-mcp`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(cc): remove obsolete single-arg OllamaAdapter (#89)"
```

(If you took the `@deprecated` path instead, the commit message is `chore(cc): mark single-arg OllamaAdapter as deprecated (#89)` and you would `git add` rather than `git rm` the affected files.)

---

## Phase 5 — Smoke Integration + Docs

### Task 5.1: Extend smoke integration with Ollama stub server

**Files:**
- Modify: `packages/command-and-control/scripts/smoke-integration.ts`

- [ ] **Step 1: Read the existing smoke script to find the right insertion point**

Read `packages/command-and-control/scripts/smoke-integration.ts`. Locate the existing answers-bot smoke step (added in #61). The Ollama step belongs after it.

- [ ] **Step 2: Add the Ollama path step**

Append to `packages/command-and-control/scripts/smoke-integration.ts`, after the existing answers-bot smoke step:

```ts
// ── Step: Answers bot via Ollama path (stub server)
// Validates that the resolver routes through OllamaLlmClient end-to-end.
import { createServer, type Server } from 'node:http';
import { setActiveLlmProvider } from '../src/tools/set_active_llm_provider.js';

async function smokeAnswersOllama(courseDir: string, sampleChunks: unknown[]) {
  console.log('› Smoke: answers bot via Ollama (stub server) …');

  const server: Server = await new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'qwen2.5:14b' }] }));
        return;
      }
      if (req.url === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            response: 'Stub Ollama answer citing source [1].',
            done: true,
            prompt_eval_count: 5,
            eval_count: 8,
          }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('Could not bind smoke stub server');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // Seed configs through the real tools so we exercise the real write path.
    const ollamaSetup = await (await import('../src/tools/setup_ollama.js')).setupOllama({ baseUrl, model: 'qwen2.5:14b' });
    if (ollamaSetup.mode !== 'commit' || !('ok' in ollamaSetup) || !ollamaSetup.ok) {
      throw new Error(`setup_ollama failed in smoke: ${JSON.stringify(ollamaSetup)}`);
    }
    const switchResult = await setActiveLlmProvider({ provider: 'ollama' });
    if (!switchResult.ok) throw new Error(`set_active_llm_provider failed: ${JSON.stringify(switchResult)}`);

    const { generateAnswer } = await import('../src/tools/answers/retrieval/answer.js');
    const result = await generateAnswer('What is supplied?', sampleChunks as never);
    if (!result.answer.includes('Stub Ollama answer')) {
      throw new Error(`Unexpected smoke answer: ${result.answer}`);
    }
    console.log('  ✓ Answers bot returned canned Ollama response');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
```

Then wire it in by calling `await smokeAnswersOllama(courseDir, sampleChunks)` after the existing Anthropic-path answers smoke call. Re-use whatever `courseDir` and `sampleChunks` variables the existing smoke step uses — read the script to see the actual variable names.

If the existing smoke step already sets `CC_HOME` to a temp dir for hermetic config writes, the Ollama step inherits it. If it doesn't, wrap the Ollama step in a `try/finally` that sets `process.env.CC_HOME` to a `mkdtempSync` directory and restores it on exit.

- [ ] **Step 3: Run the smoke script**

Run: `npm run smoke:integration --workspace command-and-control-mcp`
Expected: completes with `✓ Answers bot returned canned Ollama response` in the output.

- [ ] **Step 4: Commit**

```bash
git add packages/command-and-control/scripts/smoke-integration.ts
git commit -m "test(cc): smoke integration covers answers-bot via Ollama stub (#89)"
```

---

### Task 5.2: Author `docs/recommended-models.md` with three populated tiers

**Files:**
- Create: `docs/recommended-models.md`

- [ ] **Step 1: Create the canonical recommendations page**

Create `docs/recommended-models.md`:

```markdown
# Recommended Models for Canvas Toolchain

This page is fetched by the toolchain at setup time. The toolchain does NOT
parse it — it returns the contents verbatim to the user, who picks a model
ID and re-runs `setup_ollama --model <id>`.

To update: edit this file directly. Changes propagate within 24 h (cache
TTL) for every installed copy of canvas-toolchain.

---

## General-Purpose Models — by VRAM Tier

For canvas-toolchain's built-in LLM features (brainstorming, rubric, answers
bot), pick **one** model that fits your hardware tier.

### Tier: 32 GB (RTX 5090, A6000)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:32b` | [Ollama](https://ollama.com/library/qwen2.5:32b) · [HF](https://huggingface.co/Qwen/Qwen2.5-32B-Instruct) | Strongest generalist at this tier — top reasoning and instruction-following | ~20 GB |

### Tier: 24 GB (RTX 4090, RTX 3090)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:14b` | [Ollama](https://ollama.com/library/qwen2.5:14b) · [HF](https://huggingface.co/Qwen/Qwen2.5-14B-Instruct) | Strong reasoning at moderate VRAM; good citation discipline for the answers bot | ~10 GB |

### Tier: 16 GB (RTX 4080, base M-series Mac)

<!-- Open a PR with your tested model -->

### Tier: 6 GB

| Model | URL | Why | VRAM |
|---|---|---|---|
| `qwen2.5:3b` | [Ollama](https://ollama.com/library/qwen2.5:3b) · [HF](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct) | Fast on modest laptops; adequate for brainstorm and rubric rewriting | ~3 GB |

---

## Task-Specialized Models

Not wired into canvas-toolchain's built-in features. Install if you have
specific workflows where a finetune beats a generalist.

### Git Commit Messages

| Model | URL | Why | VRAM |
|---|---|---|---|
| `tavernari/git-commit-message` | [Ollama](https://ollama.com/tavernari/git-commit-message) | Finetuned for Conventional Commits | ~4 GB |

### OCR (Document Parsing)

| Model | URL | Why | VRAM |
|---|---|---|---|
| `deepseek-ocr` | [HF](https://huggingface.co/deepseek-ai) | Strong OCR for slide PDFs and scanned course materials | ~6 GB |

### Whisper (Lecture Audio Transcription)

Used by sub-project 3 (Panopto Whisper comparison) when it ships.

| Model | URL | Why | VRAM |
|---|---|---|---|
| `whisper.cpp small.en` | [HF](https://huggingface.co/openai/whisper-small) | Best speed / quality balance for English-only courses | ~2 GB |
```

- [ ] **Step 2: Commit**

```bash
git add docs/recommended-models.md
git commit -m "docs: recommended-models page — 3 populated tiers + task-specialized (#89)"
```

---

### Task 5.3: Update `CLAUDE.md` with new tools and workflow

**Files:**
- Modify: `packages/command-and-control/CLAUDE.md`

- [ ] **Step 1: Add the new tools to the "Implemented" list**

Open `packages/command-and-control/CLAUDE.md`. In the `## Current Integration State` → `Implemented:` bullet list, add:

```markdown
- `setup_ollama` MCP tool — atomic 0o600 write to `~/.command-and-control/ollama-config.json`. Discovery mode (no `model`) returns the recommended-models markdown; commit mode validates the model is pulled and writes the config.
- `set_active_llm_provider` MCP tool — atomic 0o600 write to `~/.command-and-control/llm-provider.json`. Switches generation between Anthropic and Ollama; refuses to set a provider whose config is absent.
- `@canvas-toolchain/shared-llm` gains `OllamaLlmClient`, `resolveLlmClient`, `LlmProviderError`, and `fetchRecommendedModels`. All three generation call sites (brainstorm, rubric, answers) route through the C&C `resolveActiveLlmClient` shim.
```

- [ ] **Step 2: Add a "Provider switching workflow" subsection**

In `packages/command-and-control/CLAUDE.md`, after the `## Current Integration State` section, insert:

```markdown
## Provider Switching Workflow

Generation-time LLM provider (brainstorm, rubric, answers bot) is selectable. Two providers supported in v1: Anthropic (cloud) and Ollama (local).

```text
Anthropic-only setup:
  setup_anthropic → set_active_llm_provider({ provider: 'anthropic' })

Ollama-only setup:
  setup_ollama (no model) → returns recommended-models.md verbatim
  setup_ollama({ model: '<chosen>' })  → validates + writes ollama-config.json
  set_active_llm_provider({ provider: 'ollama' })

Switching later (both configs present):
  set_active_llm_provider({ provider: 'anthropic' | 'ollama' })
```

Provider failures (Ollama down, Anthropic key revoked, etc.) surface as structured `{ error, message, fix }` results — no silent cross-provider fallback. See `packages/command-and-control/docs/superpowers/specs/2026-06-05-ollama-generation-fallback-design.md` for the full error code catalog.
```

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/CLAUDE.md
git commit -m "docs(cc): CLAUDE.md — provider switching workflow + new tools (#89)"
```

---

## Phase 6 — Final Verification + Issue Close

### Task 6.1: Full monorepo regression

**Files:** none modified.

- [ ] **Step 1: Build every package**

Run: `npm run build --workspaces`
Expected: every package's tsc exits 0.

- [ ] **Step 2: Run every package's tests**

Run: `npm test --workspaces`
Expected: every package's vitest exits 0. Total test count should equal `baseline + ~50` from Task 0.1's notes.

- [ ] **Step 3: Run the full smoke integration**

Run: `npm run smoke:integration --workspace command-and-control-mcp`
Expected: smoke completes including the Anthropic-path answers step AND the new Ollama-stub step.

- [ ] **Step 4: Verify acceptance criteria from the spec**

For each of the 8 acceptance criteria in the spec (section "Acceptance Criteria"), verify the criterion holds:

1. **End-to-end with Ollama as primary, Anthropic absent** — confirmed by Task 5.1 smoke step.
2. **End-to-end with Anthropic as primary, Ollama absent** — confirmed by existing Anthropic-path tests passing unchanged.
3. **Provider switch is one MCP call** — confirmed by Task 2.3 tests.
4. **Discovery mode works offline** — confirmed by Task 2.2 fallback test.
5. **Failure modes return structured errors** — confirmed by Tasks 1.2, 1.3, 1.4, 2.2, 2.3, 2.4 error tests.
6. **Smoke integration passes the Ollama path** — confirmed by Task 5.1.
7. **All existing tests still pass** — confirmed by Step 2 above.
8. **Documentation** — confirmed by Tasks 5.2 (recommended-models.md with 3 populated tiers + 16 GB placeholder + Whisper sub-section) and 5.3 (CLAUDE.md updated).

If any criterion fails: do not proceed. Open a follow-up task to fix the gap, do NOT close the issue.

### Task 6.2: Close issue #89 with ship documentation

**Files:** none modified.

- [ ] **Step 1: Confirm all commits are pushed**

Run: `git push origin main`
Expected: push succeeds. (If branch protection blocks direct push to main, open a PR instead and merge it via the normal flow.)

- [ ] **Step 2: Add a closing comment to #89**

Run:

```bash
gh issue comment 89 --repo Ryfter/canvas-toolchain --body "$(cat <<'EOF'
## Shipped

All 8 acceptance criteria met. Summary:

- `@canvas-toolchain/shared-llm` gained `OllamaLlmClient`, `resolveLlmClient`, `LlmProviderError`, and `fetchRecommendedModels`.
- Two new C&C MCP tools: `setup_ollama` (discovery + commit modes) and `set_active_llm_provider`.
- Three generation call sites (brainstorm, rubric, answers bot) now route through `resolveActiveLlmClient`. Hard-fail on provider errors; no silent cross-provider fallback.
- `docs/recommended-models.md` ships with 6 GB / 24 GB / 32 GB tiers populated and 16 GB as a "PR welcome" placeholder.
- Smoke integration exercises both the Anthropic and Ollama paths.

Per the spec's out-of-scope list, deferred to follow-up issues:
- Streaming responses
- Per-feature model selection
- Cross-provider auto-fallback
- New providers beyond Anthropic/Ollama
- Token/cost tracking per provider

Spec: \`packages/command-and-control/docs/superpowers/specs/2026-06-05-ollama-generation-fallback-design.md\`
Plan: \`packages/command-and-control/docs/superpowers/plans/2026-06-05-ollama-generation-fallback.md\`
EOF
)"
```

- [ ] **Step 3: Close the issue**

Run: `gh issue close 89 --repo Ryfter/canvas-toolchain --reason "completed"`

---

## Summary

| Phase | Tasks | New tests | Files created | Files modified |
|---|---|---|---|---|
| 0 | 1 baseline check | 0 | 0 | 0 |
| 1 | 6 shared-llm modules | ~22 | 6 (incl. fixtures) | 2 |
| 2 | 5 C&C config + tools | ~23 | 7 | 1 |
| 3 | 3 call-site wirings | 3 | 0 | 6 |
| 4 | 1 cleanup | 0 | 0 (deletes 2) | 0 |
| 5 | 3 smoke + docs | 0 | 1 (`docs/recommended-models.md`) | 2 |
| 6 | 2 verification + close | 0 | 0 | 0 |
| **Total** | **21 tasks** | **~48 new tests** | **14 new files** | **11 modified files** |
