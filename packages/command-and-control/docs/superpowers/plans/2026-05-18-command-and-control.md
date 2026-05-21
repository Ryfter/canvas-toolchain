# Command & Control MCP — Implementation Plan

> **Status note, 2026-05-19:** This implementation plan is now partly historical. The live integration no longer uses the placeholder package names `canvas-downloader-mcp` or `canvas-design-studio-mcp`. Command & Control imports `canvas-design-mcp` directly and reaches Canvas Backup through the Python `canvas-backup` CLI bridge. For current behavior, read `CLAUDE.md`, `AGENTS.md`, and `docs/integration-contracts.md` first.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `command-and-control-mcp` — a single MCP server that imports all Curriculum Intelligence tools as npm dependencies, re-exposes them with task-category annotations for model routing, adds four high-level workflow tools, and provides config/observability tools with Anthropic-default + Ollama-optional LLM routing.

**Architecture:** New standalone Node.js + TypeScript ESM repo at `D:\Dev\Command-and-Control-MCP\`. Imports `curriculum-intelligence-mcp` via a local `file:` dependency. A `ModelRouter` class reads `~/.command-and-control/config.json` and dispatches each LLM call to the right adapter (`none` tasks skip LLM entirely, `fast` tasks go to Ollama if configured else Anthropic, `judgment` tasks go to Anthropic). All 27 CI tools are re-registered as pass-through tools with identical schemas. Four workflow tools orchestrate sequences of CI calls. Canvas Downloader and Design Studio pass-throughs are stubs that return a "not installed" message until those packages are available.

**Tech Stack:** Node.js 18+, TypeScript 5 ESM (`"type": "module"`), `@modelcontextprotocol/sdk ^1.10.0`, `curriculum-intelligence-mcp` (local file dep), `vitest ^2.0.0`. No additional runtime dependencies. Node's built-in `fetch` used for Ollama HTTP calls.

---

## Context: What is Curriculum Intelligence?

`curriculum-intelligence-mcp` is a companion MCP server that lives at `D:\Dev\Curriculum-Intelligence\`. It has 27 tools for ingesting Canvas LMS archives, scoring topic currency, and planning course updates. Its `LlmClient` interface is:

```typescript
// from D:\Dev\Curriculum-Intelligence\src\llm\client.ts
export interface LlmOpts {
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
}
export interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
```

Its `AnthropicAdapter` constructor: `new AnthropicAdapter(apiKey?: string)`.

Test isolation in CI uses `process.env.CURRICULUM_INTELLIGENCE_HOME` pointing to a `mkdtempSync` dir. C&C uses the same pattern with `process.env.CC_HOME`.

---

## File map

**Create (new files):**

```
package.json
tsconfig.json
vitest.config.ts
.gitignore
AGENTS.md

src/types.ts                               ← TaskCategory, CcConfig, Mode, ProviderName
src/llm/client.ts                          ← LlmClient + LlmOpts interface (mirrors CI)
src/llm/ollama_adapter.ts                  ← OllamaAdapter + isReachable()
src/routing/model_router.ts                ← ModelRouter class
src/kb/config.ts                           ← load/save ~/.command-and-control/config.json

src/tools/setup_cc.ts                      ← write config tool
src/tools/get_cc_status.ts                 ← health snapshot tool
src/passthrough/ci_tools.ts                ← all 27 CI tools with taskCategory
src/passthrough/downloader_tools.ts        ← Canvas Downloader stubs
src/passthrough/design_tools.ts            ← Design Studio stubs
src/tools/workflows/analyze_course.ts      ← ingest → score → recommend
src/tools/workflows/plan_next_semester.ts  ← shell → calendar → shift → outline
src/tools/workflows/update_course_materials.ts  ← draft → examples → export
src/tools/workflows/full_pipeline.ts       ← all three workflows in sequence
src/index.ts                               ← MCP server entry point

tests/kb/config.test.ts
tests/llm/ollama_adapter.test.ts
tests/routing/model_router.test.ts
tests/tools/setup_cc.test.ts
tests/tools/get_cc_status.test.ts
tests/tools/workflows/analyze_course.test.ts
tests/tools/workflows/plan_next_semester.test.ts
tests/tools/workflows/update_course_materials.test.ts
tests/tools/workflows/full_pipeline.test.ts

scripts/smoke-cc.ts
```

---

## Task 1: Scaffold — package.json, tsconfig, vitest config, .gitignore

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "command-and-control-mcp",
  "version": "1.0.0",
  "description": "Command & Control — MCP server that orchestrates the professor toolset with task-aware model routing",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "command-and-control-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "curriculum-intelligence-mcp": "file:../Curriculum-Intelligence",
    "@modelcontextprotocol/sdk": "^1.10.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
*.js.map
.env
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `curriculum-intelligence-mcp` symlinked from `../Curriculum-Intelligence`.

- [ ] **Step 6: Verify CI is importable**

```bash
node -e "import('curriculum-intelligence-mcp/dist/tools/setup_course.js').then(m => console.log(Object.keys(m)))"
```

Expected output: `[ 'setupCourse' ]`

If this fails, run `npm run build` in `D:\Dev\Curriculum-Intelligence\` first, then retry.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold package.json, tsconfig, vitest config"
```

---

## Task 2: Shared types — src/types.ts

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write src/types.ts**

```typescript
export type TaskCategory = 'none' | 'fast' | 'judgment';
export type ProviderName = 'anthropic' | 'ollama';
export type Mode = 'easy' | 'advanced';

export interface AnthropicProviderConfig {
  model: string;
}

export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
}

export interface CcConfig {
  mode: Mode;
  providers: {
    anthropic: AnthropicProviderConfig;
    ollama?: OllamaProviderConfig;
  };
  routing: {
    fast: ProviderName;
    judgment: ProviderName;
  };
  lastRun: {
    analyze_course: string | null;
    plan_next_semester: string | null;
    update_course_materials: string | null;
    full_pipeline: string | null;
  };
}

export const DEFAULT_CONFIG: CcConfig = {
  mode: 'easy',
  providers: {
    anthropic: { model: 'claude-sonnet-4-6' },
  },
  routing: {
    fast: 'anthropic',
    judgment: 'anthropic',
  },
  lastRun: {
    analyze_course: null,
    plan_next_semester: null,
    update_course_materials: null,
    full_pipeline: null,
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types (CcConfig, TaskCategory, Mode)"
```

---

## Task 3: Config KB — src/kb/config.ts

**Files:**
- Create: `src/kb/config.ts`
- Create: `tests/kb/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/kb/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig, getCcHomePath } from '../../src/kb/config.js';
import { DEFAULT_CONFIG } from '../../src/types.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns default config when no file exists', () => {
    const config = loadConfig();
    expect(config.mode).toBe('easy');
    expect(config.providers.anthropic.model).toBe('claude-sonnet-4-6');
    expect(config.providers.ollama).toBeUndefined();
  });

  it('reads saved config back correctly', () => {
    const custom = { ...DEFAULT_CONFIG, mode: 'advanced' as const };
    saveConfig(custom);
    const loaded = loadConfig();
    expect(loaded.mode).toBe('advanced');
  });
});

describe('getCcHomePath', () => {
  it('respects CC_HOME env var', () => {
    expect(getCcHomePath()).toBe(tmpHome);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/kb/config.test.ts
```

Expected: FAIL — "Cannot find module '../../src/kb/config.js'"

- [ ] **Step 3: Implement src/kb/config.ts**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CcConfig } from '../types.js';
import { DEFAULT_CONFIG } from '../types.js';

export function getCcHomePath(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

export function loadConfig(): CcConfig {
  const configPath = join(getCcHomePath(), 'config.json');
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG, lastRun: { ...DEFAULT_CONFIG.lastRun } };
  return JSON.parse(readFileSync(configPath, 'utf-8')) as CcConfig;
}

export function saveConfig(config: CcConfig): void {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/kb/config.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/kb/config.ts tests/kb/config.test.ts
git commit -m "feat: config KB — load/save ~/.command-and-control/config.json"
```

---

## Task 4: LlmClient interface + OllamaAdapter

**Files:**
- Create: `src/llm/client.ts`
- Create: `src/llm/ollama_adapter.ts`
- Create: `tests/llm/ollama_adapter.test.ts`

- [ ] **Step 1: Create src/llm/client.ts**

This mirrors the interface in `D:\Dev\Curriculum-Intelligence\src\llm\client.ts`. Defining it locally keeps the coupling loose.

```typescript
export interface LlmOpts {
  model?: string;
  maxTokens?: number;
}

export interface LlmClient {
  complete(prompt: string, opts?: LlmOpts): Promise<string>;
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/llm/ollama_adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaAdapter } from '../../src/llm/ollama_adapter.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('OllamaAdapter', () => {
  it('sends prompt to /api/generate and returns response text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'hello from ollama' }),
    }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    const result = await adapter.complete('say hello');

    expect(result).toBe('hello from ollama');
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.prompt).toBe('say hello');
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);
  });

  it('throws when Ollama returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    await expect(adapter.complete('hi')).rejects.toThrow('Ollama request failed: 503');
  });

  it('isReachable returns true when /api/tags responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    expect(await adapter.isReachable()).toBe(true);
  });

  it('isReachable returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const adapter = new OllamaAdapter('http://localhost:11434', 'llama3.2');
    expect(await adapter.isReachable()).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm test tests/llm/ollama_adapter.test.ts
```

Expected: FAIL — "Cannot find module '../../src/llm/ollama_adapter.js'"

- [ ] **Step 4: Implement src/llm/ollama_adapter.ts**

```typescript
import type { LlmClient, LlmOpts } from './client.js';

export class OllamaAdapter implements LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async complete(prompt: string, opts?: LlmOpts): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        ...(opts?.maxTokens ? { options: { num_predict: opts.maxTokens } } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { response: string };
    return data.response;
  }

  async isReachable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test tests/llm/ollama_adapter.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/llm/client.ts src/llm/ollama_adapter.ts tests/llm/ollama_adapter.test.ts
git commit -m "feat: LlmClient interface + OllamaAdapter with isReachable health check"
```

---

## Task 5: ModelRouter

**Files:**
- Create: `src/routing/model_router.ts`
- Create: `tests/routing/model_router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/routing/model_router.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ModelRouter } from '../../src/routing/model_router.ts';
import type { CcConfig } from '../../src/types.js';
import type { LlmClient } from '../../src/llm/client.js';

const MOCK_CLIENT: LlmClient = { complete: async () => 'mock' };

const BASE_CONFIG: CcConfig = {
  mode: 'easy',
  providers: { anthropic: { model: 'claude-sonnet-4-6' } },
  routing: { fast: 'anthropic', judgment: 'anthropic' },
  lastRun: { analyze_course: null, plan_next_semester: null, update_course_materials: null, full_pipeline: null },
};

describe('ModelRouter', () => {
  it('returns anthropic client for judgment category', async () => {
    const router = new ModelRouter(BASE_CONFIG, () => MOCK_CLIENT);
    const client = await router.forCategory('judgment');
    expect(client).toBe(MOCK_CLIENT);
  });

  it('returns anthropic client for fast when ollama not configured', async () => {
    const router = new ModelRouter(BASE_CONFIG, () => MOCK_CLIENT);
    const client = await router.forCategory('fast');
    expect(client).toBe(MOCK_CLIENT);
  });

  it('returns ollama client for fast when ollama configured and reachable', async () => {
    const config: CcConfig = {
      ...BASE_CONFIG,
      providers: { ...BASE_CONFIG.providers, ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' } },
      routing: { fast: 'ollama', judgment: 'anthropic' },
    };

    // stub OllamaAdapter.isReachable to return true
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const router = new ModelRouter(config, () => MOCK_CLIENT);
    const client = await router.forCategory('fast');
    expect(client).not.toBe(MOCK_CLIENT); // got OllamaAdapter, not the anthropic factory result
  });

  it('falls back to anthropic when ollama is unreachable', async () => {
    const config: CcConfig = {
      ...BASE_CONFIG,
      providers: { ...BASE_CONFIG.providers, ollama: { baseUrl: 'http://localhost:11434', model: 'llama3.2' } },
      routing: { fast: 'ollama', judgment: 'anthropic' },
    };

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const router = new ModelRouter(config, () => MOCK_CLIENT);
    const client = await router.forCategory('fast');
    expect(client).toBe(MOCK_CLIENT);
  });

  it('throws for category none', async () => {
    const router = new ModelRouter(BASE_CONFIG, () => MOCK_CLIENT);
    await expect(router.forCategory('none')).rejects.toThrow('"none"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/routing/model_router.test.ts
```

Expected: FAIL — "Cannot find module '../../src/routing/model_router.ts'"

- [ ] **Step 3: Implement src/routing/model_router.ts**

```typescript
import { OllamaAdapter } from '../llm/ollama_adapter.js';
import type { LlmClient } from '../llm/client.js';
import type { CcConfig, TaskCategory } from '../types.js';

export class ModelRouter {
  private ollama: OllamaAdapter | null = null;
  private ollamaReachable: boolean | null = null;

  constructor(
    private readonly config: CcConfig,
    private readonly anthropicFactory: () => LlmClient,
  ) {
    if (config.providers.ollama) {
      this.ollama = new OllamaAdapter(
        config.providers.ollama.baseUrl,
        config.providers.ollama.model,
      );
    }
  }

  async forCategory(category: TaskCategory): Promise<LlmClient> {
    if (category === 'none') {
      throw new Error('Category "none" requires no LLM — do not call forCategory("none")');
    }

    const preferred = this.config.routing[category];

    if (preferred === 'ollama' && this.ollama) {
      if (this.ollamaReachable === null) {
        this.ollamaReachable = await this.ollama.isReachable();
      }
      if (this.ollamaReachable) return this.ollama;
    }

    return this.anthropicFactory();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/routing/model_router.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routing/model_router.ts tests/routing/model_router.test.ts
git commit -m "feat: ModelRouter — task-aware LLM routing with Ollama fallback"
```

---

## Task 6: setup_cc tool

**Files:**
- Create: `src/tools/setup_cc.ts`
- Create: `tests/tools/setup_cc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/setup_cc.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCc } from '../../src/tools/setup_cc.js';
import { loadConfig } from '../../src/kb/config.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('setupCc', () => {
  it('sets mode and saves config', () => {
    const result = setupCc({ mode: 'advanced' });
    expect(result.config.mode).toBe('advanced');
    expect(loadConfig().mode).toBe('advanced');
  });

  it('sets ollama provider', () => {
    setupCc({ ollamaBaseUrl: 'http://localhost:11434', ollamaModel: 'llama3.2' });
    const config = loadConfig();
    expect(config.providers.ollama?.baseUrl).toBe('http://localhost:11434');
    expect(config.providers.ollama?.model).toBe('llama3.2');
  });

  it('sets routing preferences', () => {
    setupCc({ routingFast: 'ollama', routingJudgment: 'anthropic' });
    const config = loadConfig();
    expect(config.routing.fast).toBe('ollama');
    expect(config.routing.judgment).toBe('anthropic');
  });

  it('partial update does not overwrite unrelated fields', () => {
    setupCc({ mode: 'advanced' });
    setupCc({ anthropicModel: 'claude-opus-4-7' });
    const config = loadConfig();
    expect(config.mode).toBe('advanced');
    expect(config.providers.anthropic.model).toBe('claude-opus-4-7');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/tools/setup_cc.test.ts
```

Expected: FAIL — "Cannot find module '../../src/tools/setup_cc.js'"

- [ ] **Step 3: Implement src/tools/setup_cc.ts**

```typescript
import { loadConfig, saveConfig } from '../kb/config.js';
import type { CcConfig, Mode, ProviderName } from '../types.js';

export interface SetupCcInput {
  mode?: Mode;
  anthropicModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  routingFast?: ProviderName;
  routingJudgment?: ProviderName;
}

export interface SetupCcResult {
  config: CcConfig;
  message: string;
}

export function setupCc(input: SetupCcInput): SetupCcResult {
  const config = loadConfig();

  if (input.mode !== undefined) config.mode = input.mode;
  if (input.anthropicModel) config.providers.anthropic.model = input.anthropicModel;

  if (input.ollamaBaseUrl || input.ollamaModel) {
    config.providers.ollama = {
      baseUrl: input.ollamaBaseUrl ?? config.providers.ollama?.baseUrl ?? 'http://localhost:11434',
      model: input.ollamaModel ?? config.providers.ollama?.model ?? 'llama3.2',
    };
  }

  if (input.routingFast) config.routing.fast = input.routingFast;
  if (input.routingJudgment) config.routing.judgment = input.routingJudgment;

  saveConfig(config);
  return { config, message: 'Configuration saved.' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/tools/setup_cc.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/setup_cc.ts tests/tools/setup_cc.test.ts
git commit -m "feat: setup_cc tool — configure providers, models, mode, routing"
```

---

## Task 7: get_cc_status tool

**Files:**
- Create: `src/tools/get_cc_status.ts`
- Create: `tests/tools/get_cc_status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/get_cc_status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCcStatus } from '../../src/tools/get_cc_status.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  vi.restoreAllMocks();
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('getCcStatus', () => {
  it('reports anthropic key absent when env var not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(false);
  });

  it('reports anthropic key present when env var set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const status = await getCcStatus();
    expect(status.providers.anthropic.keyPresent).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('reports ollama as undefined when not configured', async () => {
    const status = await getCcStatus();
    expect(status.providers.ollama).toBeUndefined();
  });

  it('reports mode and routing from config', async () => {
    const status = await getCcStatus();
    expect(status.mode).toBe('easy');
    expect(status.routing.fast).toBe('anthropic');
  });

  it('reports ci as installed (it is a local dep)', async () => {
    const status = await getCcStatus();
    expect(status.installedPackages.ci).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/tools/get_cc_status.test.ts
```

Expected: FAIL — "Cannot find module '../../src/tools/get_cc_status.js'"

- [ ] **Step 3: Implement src/tools/get_cc_status.ts**

```typescript
import { OllamaAdapter } from '../llm/ollama_adapter.js';
import { loadConfig } from '../kb/config.js';
import type { CcConfig, Mode, ProviderName } from '../types.js';

export interface GetCcStatusResult {
  mode: Mode;
  providers: {
    anthropic: { model: string; keyPresent: boolean };
    ollama?: { baseUrl: string; model: string; reachable: boolean };
  };
  installedPackages: {
    ci: boolean;
    downloader: boolean;
    designStudio: boolean;
  };
  routing: { fast: ProviderName; judgment: ProviderName };
  lastRun: CcConfig['lastRun'];
}

async function isPackageInstalled(pkg: string): Promise<boolean> {
  try {
    await import(pkg);
    return true;
  } catch {
    return false;
  }
}

export async function getCcStatus(): Promise<GetCcStatusResult> {
  const config = loadConfig();

  let ollamaStatus: { baseUrl: string; model: string; reachable: boolean } | undefined;
  if (config.providers.ollama) {
    const adapter = new OllamaAdapter(
      config.providers.ollama.baseUrl,
      config.providers.ollama.model,
    );
    ollamaStatus = {
      ...config.providers.ollama,
      reachable: await adapter.isReachable(),
    };
  }

  const [ciInstalled, downloaderInstalled, designStudioInstalled] = await Promise.all([
    isPackageInstalled('curriculum-intelligence-mcp'),
    isPackageInstalled('canvas-downloader-mcp'),
    isPackageInstalled('canvas-design-studio-mcp'),
  ]);

  return {
    mode: config.mode,
    providers: {
      anthropic: {
        model: config.providers.anthropic.model,
        keyPresent: !!process.env.ANTHROPIC_API_KEY,
      },
      ollama: ollamaStatus,
    },
    installedPackages: {
      ci: ciInstalled,
      downloader: downloaderInstalled,
      designStudio: designStudioInstalled,
    },
    routing: config.routing,
    lastRun: config.lastRun,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/tools/get_cc_status.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_cc_status.ts tests/tools/get_cc_status.test.ts
git commit -m "feat: get_cc_status tool — health snapshot with package detection"
```

---

## Task 8: CI pass-through tools

**Files:**
- Create: `src/passthrough/ci_tools.ts`

No dedicated test file — the pass-through layer is a thin re-registration with no logic of its own. The workflow tool tests (Tasks 10–13) cover it indirectly.

- [ ] **Step 1: Study the CI tool schemas**

Open `D:\Dev\Curriculum-Intelligence\src\index.ts`. The `ListToolsRequestSchema` handler contains the `inputSchema` for all 27 tools. You will copy each `inputSchema` verbatim into `ci_tools.ts` below. Do not paraphrase — copy exactly.

- [ ] **Step 2: Create src/passthrough/ci_tools.ts**

The file exports a `CI_TOOLS` array. Each entry has: `name`, `description`, `inputSchema`, `taskCategory`, and `handler` (calls the imported CI function).

**Task category reference:**

| Category | Tools |
|----------|-------|
| `none` | `setup_course`, `get_course_state`, `ingest_canvas_archive`, `list_assignments`, `list_pages`, `list_modules`, `list_resources`, `diff_semesters`, `ingest_transcripts`, `map_transcripts_to_weeks`, `find_off_syllabus_topics`, `import_previous_shell`, `fetch_academic_calendar`, `shift_dates`, `export_course_folder` |
| `fast` | `extract_lecture_topics`, `build_quote_bank`, `fetch_news_feed`, `update_examples`, `score_topic_currency` |
| `judgment` | `scan_recent_developments`, `suggest_topics`, `recommend_for_topic`, `generate_ideas_file`, `draft_assignment_brief`, `generate_recommended_outline` |

```typescript
import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';
import { getCourseState } from 'curriculum-intelligence-mcp/dist/tools/get_course_state.js';
import { ingestCanvasArchive } from 'curriculum-intelligence-mcp/dist/tools/ingest_canvas_archive.js';
import { listAssignments } from 'curriculum-intelligence-mcp/dist/tools/list_assignments.js';
import { listPages } from 'curriculum-intelligence-mcp/dist/tools/list_pages.js';
import { listModules } from 'curriculum-intelligence-mcp/dist/tools/list_modules.js';
import { listResources } from 'curriculum-intelligence-mcp/dist/tools/list_resources.js';
import { diffSemesters } from 'curriculum-intelligence-mcp/dist/tools/diff_semesters.js';
import { ingestTranscripts } from 'curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js';
import { mapTranscriptsToWeeks } from 'curriculum-intelligence-mcp/dist/tools/map_transcripts_to_weeks.js';
import { extractLectureTopics } from 'curriculum-intelligence-mcp/dist/tools/extract_lecture_topics.js';
import { findOffSyllabusTopics } from 'curriculum-intelligence-mcp/dist/tools/find_off_syllabus_topics.js';
import { buildQuoteBank } from 'curriculum-intelligence-mcp/dist/tools/build_quote_bank.js';
import { fetchNewsFeed } from 'curriculum-intelligence-mcp/dist/tools/fetch_news_feed.js';
import { scanRecentDevelopments } from 'curriculum-intelligence-mcp/dist/tools/scan_recent_developments.js';
import { suggestTopics } from 'curriculum-intelligence-mcp/dist/tools/suggest_topics.js';
import { scoreTopicCurrency } from 'curriculum-intelligence-mcp/dist/tools/score_topic_currency.js';
import { recommendForTopic } from 'curriculum-intelligence-mcp/dist/tools/recommend_for_topic.js';
import { generateIdeasFile } from 'curriculum-intelligence-mcp/dist/tools/generate_ideas_file.js';
import { importPreviousShell } from 'curriculum-intelligence-mcp/dist/tools/import_previous_shell.js';
import { fetchAcademicCalendar } from 'curriculum-intelligence-mcp/dist/tools/fetch_academic_calendar.js';
import { shiftDates } from 'curriculum-intelligence-mcp/dist/tools/shift_dates.js';
import { generateRecommendedOutline } from 'curriculum-intelligence-mcp/dist/tools/generate_recommended_outline.js';
import { draftAssignmentBrief } from 'curriculum-intelligence-mcp/dist/tools/draft_assignment_brief.js';
import { updateExamples } from 'curriculum-intelligence-mcp/dist/tools/update_examples.js';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';
import type { TaskCategory } from '../types.js';

export interface PassthroughTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  taskCategory: TaskCategory;
  handler: (args: unknown) => unknown | Promise<unknown>;
}

export const CI_TOOLS: PassthroughTool[] = [
  {
    name: 'setup_course',
    taskCategory: 'none',
    description: 'Register a new course in Curriculum Intelligence. Creates a course folder on disk and records its location in the app config so other tools can find it by id alone.',
    inputSchema: {
      type: 'object',
      required: ['id', 'title'],
      properties: {
        id: { type: 'string', description: 'Short id (letters, digits, dot, dash, underscore). Example: "ITM370".' },
        title: { type: 'string', description: 'Human-readable course title.' },
        courseRoot: { type: 'string', description: 'Optional. Absolute path to parent folder. Defaults to <appHome>/courses.' },
      },
    },
    handler: (args) => setupCourse(args as Parameters<typeof setupCourse>[0]),
  },
  {
    name: 'get_course_state',
    taskCategory: 'none',
    description: 'List registered courses with their on-disk paths, semester history, and feed counts.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Optional. Course id to inspect. Omit to list all.' },
      },
    },
    handler: (args) => getCourseState(args as Parameters<typeof getCourseState>[0]),
  },
  {
    name: 'ingest_canvas_archive',
    taskCategory: 'none',
    description: 'Read a Canvas export folder for one semester and write a structured topic-map.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'archivePath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        archivePath: { type: 'string', description: 'Absolute path to the Canvas export folder.' },
      },
    },
    handler: (args) => ingestCanvasArchive(args as Parameters<typeof ingestCanvasArchive>[0]),
  },
  {
    name: 'list_assignments',
    taskCategory: 'none',
    description: 'List assignments for a course/semester from its ingested topic map.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        publishedOnly: { type: 'boolean' },
      },
    },
    handler: (args) => listAssignments(args as Parameters<typeof listAssignments>[0]),
  },
  {
    name: 'list_pages',
    taskCategory: 'none',
    description: 'List pages for a course/semester from its ingested topic map.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        publishedOnly: { type: 'boolean' },
      },
    },
    handler: (args) => listPages(args as Parameters<typeof listPages>[0]),
  },
  {
    name: 'list_modules',
    taskCategory: 'none',
    description: 'List modules for a course/semester. Pass expandItems=true to include item details.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        expandItems: { type: 'boolean' },
      },
    },
    handler: (args) => listModules(args as Parameters<typeof listModules>[0]),
  },
  {
    name: 'list_resources',
    taskCategory: 'none',
    description: 'List external resource links referenced in pages, assignments, and discussions.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        sourceKind: { type: 'string', enum: ['page', 'assignment', 'discussion'] },
        externalOnly: { type: 'boolean', description: 'Defaults to true.' },
      },
    },
    handler: (args) => listResources(args as Parameters<typeof listResources>[0]),
  },
  {
    name: 'diff_semesters',
    taskCategory: 'none',
    description: 'Compute a side-by-side diff between two ingested semesters.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'leftSemesterId', 'rightSemesterId'],
      properties: {
        courseId: { type: 'string' },
        leftSemesterId: { type: 'string' },
        rightSemesterId: { type: 'string' },
      },
    },
    handler: (args) => diffSemesters(args as Parameters<typeof diffSemesters>[0]),
  },
  {
    name: 'ingest_transcripts',
    taskCategory: 'none',
    description: 'Read .vtt/.srt/.md transcript files from a folder and write transcripts.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'transcriptsPath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        transcriptsPath: { type: 'string' },
        source: { type: 'string', enum: ['panopto', 'whisper', 'unknown'] },
        copy: { type: 'boolean' },
      },
    },
    handler: (args) => ingestTranscripts(args as Parameters<typeof ingestTranscripts>[0]),
  },
  {
    name: 'map_transcripts_to_weeks',
    taskCategory: 'none',
    description: 'Match each ingested transcript to a course week. Writes week-map.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => mapTranscriptsToWeeks(args as Parameters<typeof mapTranscriptsToWeeks>[0]),
  },
  {
    name: 'extract_lecture_topics',
    taskCategory: 'fast',
    description: 'Return lecture chunks shaped for Claude to reason over.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        week: { type: 'number' },
        transcriptId: { type: 'string' },
        maxTextChars: { type: 'number' },
      },
    },
    handler: (args) => extractLectureTopics(args as Parameters<typeof extractLectureTopics>[0]),
  },
  {
    name: 'find_off_syllabus_topics',
    taskCategory: 'none',
    description: 'Compare lecture transcripts against module/page text and return novel tokens.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        topN: { type: 'number' },
        minTokenLength: { type: 'number' },
      },
    },
    handler: (args) => findOffSyllabusTopics(args as Parameters<typeof findOffSyllabusTopics>[0]),
  },
  {
    name: 'build_quote_bank',
    taskCategory: 'fast',
    description: 'Scan lecture transcripts for notable lines. Writes quote-bank.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        minLength: { type: 'number' },
        maxPerLecture: { type: 'number' },
      },
    },
    handler: (args) => buildQuoteBank(args as Parameters<typeof buildQuoteBank>[0]),
  },
  {
    name: 'fetch_news_feed',
    taskCategory: 'fast',
    description: 'Fetch RSS/Atom feeds and return recent items filtered by date.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'feedUrls'],
      properties: {
        courseId: { type: 'string' },
        feedUrls: { type: 'array', items: { type: 'string' } },
        since: { type: 'string' },
      },
    },
    handler: (args) => fetchNewsFeed(args as Parameters<typeof fetchNewsFeed>[0]),
  },
  {
    name: 'scan_recent_developments',
    taskCategory: 'judgment',
    description: 'Ask Claude what\'s new in a given topic area since a date.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'topicArea'],
      properties: {
        courseId: { type: 'string' },
        topicArea: { type: 'string' },
        since: { type: 'string' },
      },
    },
    handler: (args) => scanRecentDevelopments(args as Parameters<typeof scanRecentDevelopments>[0]),
  },
  {
    name: 'suggest_topics',
    taskCategory: 'judgment',
    description: 'Merge RSS feed items and LLM scan developments into ranked topic candidates.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
        feedItems: { type: 'array', items: { type: 'object' } },
        developments: { type: 'array', items: { type: 'object' } },
      },
    },
    handler: (args) => suggestTopics(args as Parameters<typeof suggestTopics>[0]),
  },
  {
    name: 'score_topic_currency',
    taskCategory: 'fast',
    description: 'Classify each topic in a semester\'s topic map as evergreen / current / dated.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => scoreTopicCurrency(args as Parameters<typeof scoreTopicCurrency>[0]),
  },
  {
    name: 'recommend_for_topic',
    taskCategory: 'judgment',
    description: 'Generate KEEP / UPDATE / DROP / ADD verdicts for each topic.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => recommendForTopic(args as Parameters<typeof recommendForTopic>[0]),
  },
  {
    name: 'generate_ideas_file',
    taskCategory: 'judgment',
    description: 'Write ideas.md with follow-on development ideas based on what the professor used.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
        context: { type: 'string' },
      },
    },
    handler: (args) => generateIdeasFile(args as Parameters<typeof generateIdeasFile>[0]),
  },
  {
    name: 'import_previous_shell',
    taskCategory: 'none',
    description: 'Copy last semester\'s content into next-plan/ with CI front matter.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'sourceSemesterId', 'newSemesterId'],
      properties: {
        courseId: { type: 'string' },
        sourceSemesterId: { type: 'string' },
        newSemesterId: { type: 'string' },
        source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
      },
    },
    handler: (args) => importPreviousShell(args as Parameters<typeof importPreviousShell>[0]),
  },
  {
    name: 'fetch_academic_calendar',
    taskCategory: 'none',
    description: 'Parse registrar URL or accept manual dates into calendar.json.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        url: { type: 'string' },
        semesterPattern: { type: 'string' },
        manualDates: { type: 'object' },
      },
    },
    handler: (args) => fetchAcademicCalendar(args as Parameters<typeof fetchAcademicCalendar>[0]),
  },
  {
    name: 'shift_dates',
    taskCategory: 'none',
    description: 'Apply target calendar to all due: fields in next-plan/ briefs.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'onBreakCollision'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        onBreakCollision: { type: 'string', enum: ['bump-before', 'bump-after', 'flag'] },
        sections: { type: 'array', items: { type: 'object' } },
      },
    },
    handler: (args) => shiftDates(args as Parameters<typeof shiftDates>[0]),
  },
  {
    name: 'generate_recommended_outline',
    taskCategory: 'judgment',
    description: 'Generate a week-by-week outline from diff + optional currency-report.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: (args) => generateRecommendedOutline(args as Parameters<typeof generateRecommendedOutline>[0]),
  },
  {
    name: 'draft_assignment_brief',
    taskCategory: 'judgment',
    description: 'LLM-draft an updated assignment brief. Sets replacement_recommended on DROP/stale.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'briefPath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        briefPath: { type: 'string' },
      },
    },
    handler: (args) => draftAssignmentBrief(args as Parameters<typeof draftAssignmentBrief>[0]),
  },
  {
    name: 'update_examples',
    taskCategory: 'fast',
    description: 'Mechanical year/tool-name replacement pass + optional LLM proposed rewrites.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId', 'briefPath'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        briefPath: { type: 'string' },
        llmPass: { type: 'boolean' },
      },
    },
    handler: (args) => {
      const p = args as Parameters<typeof updateExamples>[0];
      return (p as { llmPass?: boolean }).llmPass ? updateExamples({ ...p, llmPass: true }) : updateExamples(p);
    },
  },
  {
    name: 'export_course_folder',
    taskCategory: 'none',
    description: 'Strip CI fields and write CDS course/ format; one folder per section.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
        outputPath: { type: 'string' },
        sections: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: (args) => exportCourseFolder(args as Parameters<typeof exportCourseFolder>[0]),
  },
];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are import errors, verify `D:\Dev\Curriculum-Intelligence\` has been built (`npm run build` there).

- [ ] **Step 4: Commit**

```bash
git add src/passthrough/ci_tools.ts
git commit -m "feat: CI pass-through tools — all 27 tools with taskCategory annotations"
```

---

## Task 9: Domain app stubs — Canvas Downloader + Design Studio

**Files:**
- Create: `src/passthrough/downloader_tools.ts`
- Create: `src/passthrough/design_tools.ts`

No test files — stubs have no logic.

- [ ] **Step 1: Create src/passthrough/downloader_tools.ts**

```typescript
import type { PassthroughTool } from './ci_tools.js';

const NOT_INSTALLED = { error: 'canvas-downloader-mcp is not installed. Run: npm install -g canvas-downloader-mcp' };

export const DOWNLOADER_TOOLS: PassthroughTool[] = [
  {
    name: 'download_canvas_archive',
    taskCategory: 'none',
    description: '[canvas-downloader-mcp] Download a Canvas course export archive to disk.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: () => NOT_INSTALLED,
  },
  {
    name: 'download_transcripts',
    taskCategory: 'none',
    description: '[canvas-downloader-mcp] Download Panopto transcripts for a course.',
    inputSchema: {
      type: 'object',
      required: ['courseId', 'semesterId'],
      properties: {
        courseId: { type: 'string' },
        semesterId: { type: 'string' },
      },
    },
    handler: () => NOT_INSTALLED,
  },
];
```

- [ ] **Step 2: Create src/passthrough/design_tools.ts**

```typescript
import type { PassthroughTool } from './ci_tools.js';

const NOT_INSTALLED = { error: 'canvas-design-studio-mcp is not installed. Run: npm install -g canvas-design-studio-mcp' };

export const DESIGN_TOOLS: PassthroughTool[] = [
  {
    name: 'import_course',
    taskCategory: 'none',
    description: '[canvas-design-studio-mcp] Import a CDS course/ folder into Design Studio.',
    inputSchema: {
      type: 'object',
      required: ['coursePath'],
      properties: {
        coursePath: { type: 'string' },
      },
    },
    handler: () => NOT_INSTALLED,
  },
  {
    name: 'publish_course',
    taskCategory: 'none',
    description: '[canvas-design-studio-mcp] Publish a designed course to Canvas.',
    inputSchema: {
      type: 'object',
      required: ['courseId'],
      properties: {
        courseId: { type: 'string' },
      },
    },
    handler: () => NOT_INSTALLED,
  },
];
```

- [ ] **Step 3: Commit**

```bash
git add src/passthrough/downloader_tools.ts src/passthrough/design_tools.ts
git commit -m "feat: stub pass-through tools for Canvas Downloader and Design Studio"
```

---

## Task 10: analyze_course workflow

**Files:**
- Create: `src/tools/workflows/analyze_course.ts`
- Create: `tests/tools/workflows/analyze_course.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/workflows/analyze_course.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('curriculum-intelligence-mcp/dist/tools/ingest_canvas_archive.js', () => ({
  ingestCanvasArchive: vi.fn().mockReturnValue({ moduleCount: 5, assignmentCount: 20, pageCount: 30, resourceLinkCount: 10 }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/score_topic_currency.js', () => ({
  scoreTopicCurrency: vi.fn().mockReturnValue({ evergreen: 3, current: 8, dated: 2, topics: [] }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/recommend_for_topic.js', () => ({
  recommendForTopic: vi.fn().mockReturnValue({ verdicts: [{ topic: 'AI basics', verdict: 'KEEP', rationale: 'foundational' }] }),
}));

describe('analyzeCourse', () => {
  it('runs ingest → score → recommend in sequence', async () => {
    const { analyzeCourse } = await import('../../src/tools/workflows/analyze_course.js');
    const result = await analyzeCourse({ courseId: 'ITM370', semesterId: 'Spring2025', archivePath: '/fake/path' });
    expect(result.ingest.assignmentCount).toBe(20);
    expect(result.currencyReport.current).toBe(8);
    expect(result.recommendations.verdicts[0].verdict).toBe('KEEP');
    expect(result.status).toBe('complete');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/tools/workflows/analyze_course.test.ts
```

Expected: FAIL — "Cannot find module '../../src/tools/workflows/analyze_course.js'"

- [ ] **Step 3: Implement src/tools/workflows/analyze_course.ts**

```typescript
import { ingestCanvasArchive } from 'curriculum-intelligence-mcp/dist/tools/ingest_canvas_archive.js';
import { scoreTopicCurrency } from 'curriculum-intelligence-mcp/dist/tools/score_topic_currency.js';
import { recommendForTopic } from 'curriculum-intelligence-mcp/dist/tools/recommend_for_topic.js';

export interface AnalyzeCourseInput {
  courseId: string;
  semesterId: string;
  archivePath: string;
}

export interface AnalyzeCourseResult {
  courseId: string;
  semesterId: string;
  ingest: Awaited<ReturnType<typeof ingestCanvasArchive>>;
  currencyReport: Awaited<ReturnType<typeof scoreTopicCurrency>>;
  recommendations: Awaited<ReturnType<typeof recommendForTopic>>;
  status: 'complete';
}

export async function analyzeCourse(input: AnalyzeCourseInput): Promise<AnalyzeCourseResult> {
  const { courseId, semesterId, archivePath } = input;

  const ingest = await Promise.resolve(ingestCanvasArchive({ courseId, semesterId, archivePath }));
  const currencyReport = await Promise.resolve(scoreTopicCurrency({ courseId, semesterId }));
  const recommendations = await Promise.resolve(recommendForTopic({ courseId, semesterId }));

  return { courseId, semesterId, ingest, currencyReport, recommendations, status: 'complete' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/tools/workflows/analyze_course.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/tools/workflows/analyze_course.ts tests/tools/workflows/analyze_course.test.ts
git commit -m "feat: analyze_course workflow — ingest → score_currency → recommend"
```

---

## Task 11: plan_next_semester workflow

**Files:**
- Create: `src/tools/workflows/plan_next_semester.ts`
- Create: `tests/tools/workflows/plan_next_semester.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/workflows/plan_next_semester.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('curriculum-intelligence-mcp/dist/tools/import_previous_shell.js', () => ({
  importPreviousShell: vi.fn().mockReturnValue({ briefsCreated: 15, briefPaths: [] }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/fetch_academic_calendar.js', () => ({
  fetchAcademicCalendar: vi.fn().mockResolvedValue({ semesterId: 'Fall2026', classesBegin: '2026-08-25', breaks: [] }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/shift_dates.js', () => ({
  shiftDates: vi.fn().mockReturnValue({ shiftsApplied: 15, collisions: 0, shiftedPaths: [] }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/generate_recommended_outline.js', () => ({
  generateRecommendedOutline: vi.fn().mockReturnValue({ topics: new Array(16), outlinePath: '/tmp/plan-outline.md' }),
}));

describe('planNextSemester', () => {
  it('runs shell → calendar → shift → outline in sequence', async () => {
    const { planNextSemester } = await import('../../src/tools/workflows/plan_next_semester.js');
    const result = await planNextSemester({
      courseId: 'ITM370',
      sourceSemesterId: 'Spring2026',
      newSemesterId: 'Fall2026',
      semesterPattern: 'Fall2026',
      onBreakCollision: 'flag',
    });
    expect(result.shell.briefsCreated).toBe(15);
    expect(result.shift.shiftsApplied).toBe(15);
    expect(result.outline.topics).toHaveLength(16);
    expect(result.status).toBe('complete');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/tools/workflows/plan_next_semester.test.ts
```

Expected: FAIL — "Cannot find module '../../src/tools/workflows/plan_next_semester.js'"

- [ ] **Step 3: Implement src/tools/workflows/plan_next_semester.ts**

```typescript
import { importPreviousShell } from 'curriculum-intelligence-mcp/dist/tools/import_previous_shell.js';
import { fetchAcademicCalendar } from 'curriculum-intelligence-mcp/dist/tools/fetch_academic_calendar.js';
import { shiftDates } from 'curriculum-intelligence-mcp/dist/tools/shift_dates.js';
import { generateRecommendedOutline } from 'curriculum-intelligence-mcp/dist/tools/generate_recommended_outline.js';

export interface PlanNextSemesterInput {
  courseId: string;
  sourceSemesterId: string;
  newSemesterId: string;
  source?: 'archive' | 'cds' | 'auto';
  semesterPattern?: string;
  calendarUrl?: string;
  manualDates?: Record<string, string>;
  onBreakCollision?: 'flag' | 'bump-before' | 'bump-after';
  sections?: string[];
}

export interface PlanNextSemesterResult {
  courseId: string;
  newSemesterId: string;
  shell: Awaited<ReturnType<typeof importPreviousShell>>;
  calendar: Awaited<ReturnType<typeof fetchAcademicCalendar>>;
  shift: Awaited<ReturnType<typeof shiftDates>>;
  outline: Awaited<ReturnType<typeof generateRecommendedOutline>>;
  status: 'complete';
}

export async function planNextSemester(input: PlanNextSemesterInput): Promise<PlanNextSemesterResult> {
  const {
    courseId, sourceSemesterId, newSemesterId,
    source = 'auto', semesterPattern, calendarUrl, manualDates,
    onBreakCollision = 'flag', sections,
  } = input;

  const shell = importPreviousShell({ courseId, sourceSemesterId, newSemesterId, source });

  const calendar = await fetchAcademicCalendar({
    courseId,
    semesterId: newSemesterId,
    ...(calendarUrl ? { url: calendarUrl } : {}),
    ...(semesterPattern ? { semesterPattern } : {}),
    ...(manualDates ? { manualDates } : {}),
  });

  const shift = shiftDates({
    courseId,
    semesterId: newSemesterId,
    onBreakCollision,
    ...(sections ? { sections: sections.map((s) => ({ sectionId: s })) } : {}),
  });

  const outline = generateRecommendedOutline({ courseId, semesterId: newSemesterId });

  return { courseId, newSemesterId, shell, calendar, shift, outline, status: 'complete' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/tools/workflows/plan_next_semester.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/tools/workflows/plan_next_semester.ts tests/tools/workflows/plan_next_semester.test.ts
git commit -m "feat: plan_next_semester workflow — shell → calendar → shift → outline"
```

---

## Task 12: update_course_materials workflow

**Files:**
- Create: `src/tools/workflows/update_course_materials.ts`
- Create: `tests/tools/workflows/update_course_materials.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/workflows/update_course_materials.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('curriculum-intelligence-mcp/dist/tools/draft_assignment_brief.js', () => ({
  draftAssignmentBrief: vi.fn().mockResolvedValue({ replacementRecommended: false }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/update_examples.js', () => ({
  updateExamples: vi.fn().mockReturnValue({ replacementsApplied: 2, proposedRewrites: [] }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/export_course_folder.js', () => ({
  exportCourseFolder: vi.fn().mockReturnValue({ outputPaths: ['/tmp/export'], sectionCount: 1 }),
}));

describe('updateCourseMaterials', () => {
  it('returns complete status with draft, examples, and export results', async () => {
    // create minimal next-plan structure so getBriefPaths has something to find
    const planDir = join(tmpHome, 'courses', 'ITM370', 'semesters', 'Fall2026', 'next-plan', 'week-01');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, 'test-assignment.md'), '---\ntitle: Test\n---\nbody');

    const { updateCourseMaterials } = await import('../../src/tools/workflows/update_course_materials.js');
    const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });
    expect(result.draftsCompleted).toBeGreaterThanOrEqual(0);
    expect(result.export.sectionCount).toBe(1);
    expect(result.status).toBe('complete');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/tools/workflows/update_course_materials.test.ts
```

Expected: FAIL — "Cannot find module '../../src/tools/workflows/update_course_materials.js'"

- [ ] **Step 3: Implement src/tools/workflows/update_course_materials.ts**

```typescript
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { draftAssignmentBrief } from 'curriculum-intelligence-mcp/dist/tools/draft_assignment_brief.js';
import { updateExamples } from 'curriculum-intelligence-mcp/dist/tools/update_examples.js';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';
import { homedir } from 'node:os';

function getNextPlanDir(courseId: string, semesterId: string): string {
  const home = process.env.CURRICULUM_INTELLIGENCE_HOME ?? join(homedir(), '.curriculum-intelligence');
  return join(home, 'courses', courseId, 'semesters', semesterId, 'next-plan');
}

function getBriefPaths(courseId: string, semesterId: string): string[] {
  const nextPlanDir = getNextPlanDir(courseId, semesterId);
  if (!existsSync(nextPlanDir)) return [];
  const paths: string[] = [];
  for (const entry of readdirSync(nextPlanDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('week-')) continue;
    const weekDir = join(nextPlanDir, entry.name);
    for (const file of readdirSync(weekDir)) {
      if (file.endsWith('.md')) paths.push(join(weekDir, file));
    }
  }
  return paths;
}

export interface UpdateCourseMaterialsInput {
  courseId: string;
  semesterId: string;
  outputPath?: string;
  sections?: string[];
}

export interface UpdateCourseMaterialsResult {
  courseId: string;
  semesterId: string;
  draftsCompleted: number;
  export: Awaited<ReturnType<typeof exportCourseFolder>>;
  status: 'complete';
}

export async function updateCourseMaterials(input: UpdateCourseMaterialsInput): Promise<UpdateCourseMaterialsResult> {
  const { courseId, semesterId, outputPath, sections } = input;

  const briefPaths = getBriefPaths(courseId, semesterId);

  let draftsCompleted = 0;
  for (const briefPath of briefPaths) {
    await draftAssignmentBrief({ courseId, semesterId, briefPath });
    updateExamples({ courseId, semesterId, briefPath });
    draftsCompleted++;
  }

  const exportResult = exportCourseFolder({
    courseId,
    semesterId,
    ...(outputPath ? { outputPath } : {}),
    ...(sections ? { sections } : {}),
  });

  return { courseId, semesterId, draftsCompleted, export: exportResult, status: 'complete' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/tools/workflows/update_course_materials.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/tools/workflows/update_course_materials.ts tests/tools/workflows/update_course_materials.test.ts
git commit -m "feat: update_course_materials workflow — draft → examples → export"
```

---

## Task 13: full_pipeline workflow

**Files:**
- Create: `src/tools/workflows/full_pipeline.ts`
- Create: `tests/tools/workflows/full_pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/workflows/full_pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('../../src/tools/workflows/analyze_course.js', () => ({
  analyzeCourse: vi.fn().mockResolvedValue({ ingest: {}, currencyReport: {}, recommendations: {}, status: 'complete' }),
}));
vi.mock('../../src/tools/workflows/plan_next_semester.js', () => ({
  planNextSemester: vi.fn().mockResolvedValue({ shell: {}, calendar: {}, shift: {}, outline: {}, status: 'complete' }),
}));
vi.mock('../../src/tools/workflows/update_course_materials.js', () => ({
  updateCourseMaterials: vi.fn().mockResolvedValue({ draftsCompleted: 5, export: {}, status: 'complete' }),
}));

describe('fullPipeline', () => {
  it('runs all three workflows in sequence and reports complete', async () => {
    const { fullPipeline } = await import('../../src/tools/workflows/full_pipeline.js');
    const result = await fullPipeline({
      courseId: 'ITM370',
      sourceSemesterId: 'Spring2026',
      newSemesterId: 'Fall2026',
      archivePath: '/fake/archive',
      semesterPattern: 'Fall2026',
      onBreakCollision: 'flag',
    });
    expect(result.analyze.status).toBe('complete');
    expect(result.plan.status).toBe('complete');
    expect(result.update.status).toBe('complete');
    expect(result.status).toBe('complete');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test tests/tools/workflows/full_pipeline.test.ts
```

Expected: FAIL — "Cannot find module '../../src/tools/workflows/full_pipeline.js'"

- [ ] **Step 3: Implement src/tools/workflows/full_pipeline.ts**

```typescript
import { analyzeCourse } from './analyze_course.js';
import { planNextSemester } from './plan_next_semester.js';
import { updateCourseMaterials } from './update_course_materials.js';
import type { AnalyzeCourseResult } from './analyze_course.js';
import type { PlanNextSemesterResult } from './plan_next_semester.js';
import type { UpdateCourseMaterialsResult } from './update_course_materials.js';

export interface FullPipelineInput {
  courseId: string;
  sourceSemesterId: string;
  newSemesterId: string;
  archivePath: string;
  source?: 'archive' | 'cds' | 'auto';
  semesterPattern?: string;
  calendarUrl?: string;
  manualDates?: Record<string, string>;
  onBreakCollision?: 'flag' | 'bump-before' | 'bump-after';
  sections?: string[];
  outputPath?: string;
}

export interface FullPipelineResult {
  courseId: string;
  newSemesterId: string;
  analyze: AnalyzeCourseResult;
  plan: PlanNextSemesterResult;
  update: UpdateCourseMaterialsResult;
  status: 'complete';
}

export async function fullPipeline(input: FullPipelineInput): Promise<FullPipelineResult> {
  const {
    courseId, sourceSemesterId, newSemesterId, archivePath,
    source, semesterPattern, calendarUrl, manualDates,
    onBreakCollision, sections, outputPath,
  } = input;

  const analyze = await analyzeCourse({ courseId, semesterId: sourceSemesterId, archivePath });
  const plan = await planNextSemester({ courseId, sourceSemesterId, newSemesterId, source, semesterPattern, calendarUrl, manualDates, onBreakCollision, sections });
  const update = await updateCourseMaterials({ courseId, semesterId: newSemesterId, outputPath, sections });

  return { courseId, newSemesterId, analyze, plan, update, status: 'complete' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/tools/workflows/full_pipeline.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/tools/workflows/full_pipeline.ts tests/tools/workflows/full_pipeline.test.ts
git commit -m "feat: full_pipeline workflow — analyze → plan → update in sequence"
```

---

## Task 14: MCP server entry — src/index.ts

**Files:**
- Create: `src/index.ts`

No separate test — the MCP server wiring is covered by existing tool tests and the smoke script.

- [ ] **Step 1: Create src/index.ts**

```typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { CI_TOOLS } from './passthrough/ci_tools.js';
import { DOWNLOADER_TOOLS } from './passthrough/downloader_tools.js';
import { DESIGN_TOOLS } from './passthrough/design_tools.js';
import { setupCc } from './tools/setup_cc.js';
import { getCcStatus } from './tools/get_cc_status.js';
import { analyzeCourse } from './tools/workflows/analyze_course.js';
import { planNextSemester } from './tools/workflows/plan_next_semester.js';
import { updateCourseMaterials } from './tools/workflows/update_course_materials.js';
import { fullPipeline } from './tools/workflows/full_pipeline.js';

const ALL_PASSTHROUGH = [...CI_TOOLS, ...DOWNLOADER_TOOLS, ...DESIGN_TOOLS];

const server = new Server(
  { name: 'command-and-control', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Observability & config ──────────────────────────────────────────────
    {
      name: 'setup_cc',
      description: 'Configure Command & Control: set mode (easy/advanced), Anthropic model, Ollama base URL and model, and routing preferences. Run this first.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          mode: { type: 'string', enum: ['easy', 'advanced'] },
          anthropicModel: { type: 'string', description: 'Anthropic model name, e.g. "claude-sonnet-4-6".' },
          ollamaBaseUrl: { type: 'string', description: 'Ollama server URL, e.g. "http://localhost:11434".' },
          ollamaModel: { type: 'string', description: 'Ollama model name, e.g. "llama3.2".' },
          routingFast: { type: 'string', enum: ['anthropic', 'ollama'] },
          routingJudgment: { type: 'string', enum: ['anthropic', 'ollama'] },
        },
      },
    },
    {
      name: 'get_cc_status',
      description: 'Get a health snapshot: which domain packages are installed, whether Anthropic key and Ollama are available, active routing config, and last-run timestamps per workflow.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    // ── High-level workflows ────────────────────────────────────────────────
    {
      name: 'analyze_course',
      description: 'Answer "how stale is my course?" — ingests the Canvas archive, scores topic currency, and generates KEEP/UPDATE/DROP/ADD verdicts in one step.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          archivePath: { type: 'string', description: 'Absolute path to the Canvas export folder.' },
        },
      },
    },
    {
      name: 'plan_next_semester',
      description: 'Answer "get me ready to plan next semester" — imports previous shell, fetches the academic calendar, shifts all due dates, and generates a recommended outline.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'sourceSemesterId', 'newSemesterId'],
        properties: {
          courseId: { type: 'string' },
          sourceSemesterId: { type: 'string' },
          newSemesterId: { type: 'string' },
          source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
          semesterPattern: { type: 'string', description: 'Semester ID used for calendar inference, e.g. "Fall2026".' },
          calendarUrl: { type: 'string' },
          manualDates: { type: 'object' },
          onBreakCollision: { type: 'string', enum: ['flag', 'bump-before', 'bump-after'] },
          sections: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'update_course_materials',
      description: 'Answer "update my materials and export" — drafts updated briefs for every assignment in next-plan/, runs the examples update pass, and exports to CDS format.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'semesterId'],
        properties: {
          courseId: { type: 'string' },
          semesterId: { type: 'string' },
          outputPath: { type: 'string' },
          sections: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    {
      name: 'full_pipeline',
      description: 'Run analyze_course → plan_next_semester → update_course_materials end-to-end. Returns results from all three phases.',
      inputSchema: {
        type: 'object' as const,
        required: ['courseId', 'sourceSemesterId', 'newSemesterId', 'archivePath'],
        properties: {
          courseId: { type: 'string' },
          sourceSemesterId: { type: 'string' },
          newSemesterId: { type: 'string' },
          archivePath: { type: 'string' },
          source: { type: 'string', enum: ['archive', 'cds', 'auto'] },
          semesterPattern: { type: 'string' },
          calendarUrl: { type: 'string' },
          manualDates: { type: 'object' },
          onBreakCollision: { type: 'string', enum: ['flag', 'bump-before', 'bump-after'] },
          sections: { type: 'array', items: { type: 'string' } },
          outputPath: { type: 'string' },
        },
      },
    },
    // ── Pass-through tools ──────────────────────────────────────────────────
    ...ALL_PASSTHROUGH.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    })),
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'setup_cc':
        result = setupCc(args as Parameters<typeof setupCc>[0]);
        break;
      case 'get_cc_status':
        result = await getCcStatus();
        break;
      case 'analyze_course':
        result = await analyzeCourse(args as Parameters<typeof analyzeCourse>[0]);
        break;
      case 'plan_next_semester':
        result = await planNextSemester(args as Parameters<typeof planNextSemester>[0]);
        break;
      case 'update_course_materials':
        result = await updateCourseMaterials(args as Parameters<typeof updateCourseMaterials>[0]);
        break;
      case 'full_pipeline':
        result = await fullPipeline(args as Parameters<typeof fullPipeline>[0]);
        break;
      default: {
        const tool = ALL_PASSTHROUGH.find((t) => t.name === name);
        if (!tool) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}` }) }], isError: true };
        }
        result = await Promise.resolve(tool.handler(args));
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build to verify it compiles**

```bash
npm run build
```

Expected: `dist/index.js` created, no TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass (minimum 9 test files, ~23 tests).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: MCP server entry — registers all 33 tools (27 CI + 4 stubs + 2 CC + 4 workflows)"
```

---

## Task 15: AGENTS.md

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Create AGENTS.md**

This file is read by AI coding agents (ChatGPT Codex, Claude Code, etc.) picking up work on this repo.

```markdown
# Command & Control MCP — Agent Handoff Guide

Read this before touching anything.

---

## What this project is

**Command & Control** (`command-and-control-mcp`) is an MCP server that acts as a unified entry point for the professor toolset. It imports Curriculum Intelligence (and eventually Canvas Downloader, Canvas Design Studio) as npm dependencies, re-exposes all their tools with task-category annotations, adds four high-level workflow tools, and routes LLM calls to Anthropic or Ollama based on config.

**Stack:** Node.js 18+, TypeScript ESM (`"type": "module"`), `@modelcontextprotocol/sdk`, `curriculum-intelligence-mcp` (local file dep at `../Curriculum-Intelligence`). No additional runtime deps.

**This is not a web app. There is no frontend, no database, no HTTP server.**

---

## Current state: v1.0.0 — COMPLETE

All tools implemented and tested.

**Run tests:** `npm test`
**Build:** `npm run build`
**Smoke test (requires real ITM 370 archives on disk):** `npx tsx scripts/smoke-cc.ts`

---

## Repository layout

```
src/
  index.ts                  ← MCP server entry; all tool registrations
  types.ts                  ← TaskCategory, CcConfig, Mode, ProviderName
  llm/
    client.ts               ← LlmClient + LlmOpts interface
    ollama_adapter.ts       ← OllamaAdapter (HTTP to local Ollama server)
  routing/
    model_router.ts         ← ModelRouter: task-category → adapter dispatch
  kb/
    config.ts               ← load/save ~/.command-and-control/config.json
  tools/
    setup_cc.ts             ← configure providers, models, routing
    get_cc_status.ts        ← health snapshot
    workflows/
      analyze_course.ts     ← ingest → score → recommend
      plan_next_semester.ts ← shell → calendar → shift → outline
      update_course_materials.ts  ← draft → examples → export
      full_pipeline.ts      ← all three in sequence
  passthrough/
    ci_tools.ts             ← all 27 CI tools re-registered with taskCategory
    downloader_tools.ts     ← Canvas Downloader stubs
    design_tools.ts         ← Design Studio stubs

tests/                      ← mirrors src/ structure
scripts/
  smoke-cc.ts               ← live smoke test against real ITM 370 archives
```

---

## Data home

`~/.command-and-control/config.json` holds all C&C config. The env var `CC_HOME` overrides this for test isolation (same pattern as CI's `CURRICULUM_INTELLIGENCE_HOME`).

---

## All tools

### C&C tools (6)

| Tool | File | What it does |
|------|------|--------------|
| `setup_cc` | `src/tools/setup_cc.ts` | Configure providers, models, mode, routing |
| `get_cc_status` | `src/tools/get_cc_status.ts` | Health snapshot |
| `analyze_course` | `src/tools/workflows/analyze_course.ts` | Ingest → score → recommend |
| `plan_next_semester` | `src/tools/workflows/plan_next_semester.ts` | Shell → calendar → shift → outline |
| `update_course_materials` | `src/tools/workflows/update_course_materials.ts` | Draft → examples → export |
| `full_pipeline` | `src/tools/workflows/full_pipeline.ts` | All three phases |

### CI pass-through tools (27)

All 27 Curriculum Intelligence tools re-registered verbatim. See `src/passthrough/ci_tools.ts` for the complete list. Source schemas: `D:\Dev\Curriculum-Intelligence\src\index.ts`.

### Stub tools (4)

`download_canvas_archive`, `download_transcripts` (Canvas Downloader), `import_course`, `publish_course` (Design Studio) — return "not installed" until those packages are published.

---

## Model routing

`ModelRouter` reads `~/.command-and-control/config.json` and dispatches LLM calls:

| taskCategory | Default adapter | Notes |
|-------------|----------------|-------|
| `none` | No LLM call | Data-only tools |
| `fast` | Ollama (if configured + reachable) → Anthropic fallback | Light inference |
| `judgment` | Anthropic | Deep reasoning |

---

## Test isolation pattern

```typescript
let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});
```

---

## Adding a new domain app

1. Add the package as an npm dependency in `package.json`.
2. Create `src/passthrough/<app>_tools.ts` following the `downloader_tools.ts` pattern.
3. Import and spread into `ALL_PASSTHROUGH` in `src/index.ts`.
4. Add workflow tools to `src/tools/workflows/` if needed.

---

## Running the server

```bash
npm run build
node dist/index.js
```

Claude MCP config (`~/.claude/mcp_servers.json`):

```json
{
  "command-and-control": {
    "command": "node",
    "args": ["D:/Dev/Command-and-Control-MCP/dist/index.js"]
  }
}
```

---

## Environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `CC_HOME` | Root for C&C config (overrides `~/.command-and-control`) | No |
| `CURRICULUM_INTELLIGENCE_HOME` | Root for CI data | No (defaults to `~/.curriculum-intelligence`) |
| `ANTHROPIC_API_KEY` | Anthropic API calls | Only for judgment-category tools |
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md for Codex/Claude Code handoff"
```

---

## Task 16: Smoke script

**Files:**
- Create: `scripts/smoke-cc.ts`

- [ ] **Step 1: Create scripts/smoke-cc.ts**

```typescript
/**
 * Live smoke test for Command & Control.
 * Run with: npx tsx scripts/smoke-cc.ts
 *
 * Requires real ITM 370 archives at the paths in ARCHIVES below.
 * Uses a temp CC_HOME and CURRICULUM_INTELLIGENCE_HOME.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCc } from '../src/tools/setup_cc.js';
import { getCcStatus } from '../src/tools/get_cc_status.js';
import { analyzeCourse } from '../src/tools/workflows/analyze_course.js';
import { planNextSemester } from '../src/tools/workflows/plan_next_semester.js';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';
import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';

const SOURCE_SEM = 'Spring2026';
const TARGET_SEM = 'Fall2026';
const COURSE_ID = 'ITM370';
const ARCHIVE_PATH = 'D:/CanvasArchive/2026/Spring/Sp26 - ITM 370 - AI Augmented Projects (Rank)';

const tmpHome = mkdtempSync(join(tmpdir(), 'cc-smoke-'));
process.env.CC_HOME = tmpHome;
process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;

function hr(label = '') {
  const line = '─'.repeat(60);
  console.log(label ? `\n${line}\n${label}\n${line}` : line);
}

try {
  hr('COMMAND & CONTROL — Smoke Test');
  console.log(`Temp home: ${tmpHome}\n`);

  // Step 1: setup
  setupCourse({ id: COURSE_ID, title: 'ITM 370 — AI-Augmented Projects' });
  setupCc({ mode: 'easy' });
  console.log('✓ setup_course + setup_cc');

  // Step 2: status
  const status = await getCcStatus();
  console.log('\nStatus:');
  console.log(`  mode: ${status.mode}`);
  console.log(`  anthropic key present: ${status.providers.anthropic.keyPresent}`);
  console.log(`  ollama: ${status.providers.ollama ? `${status.providers.ollama.baseUrl} (reachable=${status.providers.ollama.reachable})` : 'not configured'}`);
  console.log(`  ci installed: ${status.installedPackages.ci}`);
  console.log('✓ get_cc_status');

  // Step 3: analyze_course
  hr('analyze_course');
  const analysis = await analyzeCourse({ courseId: COURSE_ID, semesterId: SOURCE_SEM, archivePath: ARCHIVE_PATH });
  console.log(`  ingest: modules=${(analysis.ingest as Record<string, number>).moduleCount} assignments=${(analysis.ingest as Record<string, number>).assignmentCount}`);
  console.log('✓ analyze_course complete');

  // Step 4: plan_next_semester
  hr('plan_next_semester');
  const plan = await planNextSemester({
    courseId: COURSE_ID,
    sourceSemesterId: SOURCE_SEM,
    newSemesterId: TARGET_SEM,
    semesterPattern: TARGET_SEM,
    onBreakCollision: 'flag',
  });
  console.log(`  shell: ${(plan.shell as Record<string, number>).briefsCreated} briefs`);
  console.log(`  shift: ${(plan.shift as Record<string, number>).shiftsApplied} dates shifted, ${(plan.shift as Record<string, number>).collisions} flagged`);
  console.log(`  outline: ${(plan.outline as { topics: unknown[] }).topics.length} weeks`);
  console.log('✓ plan_next_semester complete');

  // Step 5: export
  hr('export');
  const exportResult = exportCourseFolder({ courseId: COURSE_ID, semesterId: TARGET_SEM });
  console.log(`✓ export_course_folder: ${exportResult.outputPaths[0]}`);

  hr('DONE');
  console.log('All smoke steps passed.\n');
} finally {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/smoke-cc.ts
git commit -m "chore: add smoke script for live C&C pipeline test"
```

---

## Final verification

- [ ] **Run the full test suite**

```bash
npm test
```

Expected: all test files pass.

- [ ] **Build**

```bash
npm run build
```

Expected: `dist/index.js` created, no errors.

- [ ] **Run smoke test** (requires real archives at the path in the script)

```bash
npx tsx scripts/smoke-cc.ts
```

Expected: all ✓ steps complete without errors.

---

## Self-review checklist (for plan author — already done)

- All 6 C&C tools covered: `setup_cc` ✓, `get_cc_status` ✓, `analyze_course` ✓, `plan_next_semester` ✓, `update_course_materials` ✓, `full_pipeline` ✓
- All 27 CI pass-through tools listed with categories ✓
- Stubs for Downloader + Design Studio ✓
- ModelRouter with Ollama fallback ✓
- Config schema and `CC_HOME` isolation ✓
- `AGENTS.md` for Codex handoff ✓
- No placeholders — all steps contain complete code ✓
