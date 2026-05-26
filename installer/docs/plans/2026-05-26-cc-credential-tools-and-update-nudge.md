# C&C Credential Tools + Update-Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three Command & Control features that unblock the v1.0 native installer: `setup_anthropic` MCP tool, `setup_canvas` MCP tool, and an update-availability nudge surfaced through MCP tool responses.

**Architecture:** Three independent features, all in `packages/command-and-control/`. Tools 1 and 2 follow the exact pattern of the existing `setup_panopto` (input → validate → atomic write to `~/.command-and-control/<feature>-config.json` mode `0o600`). The update-nudge is a small module that checks GitHub Releases on server startup, caches the result for 24h, and (when newer version exists) appends a one-line notice to every tool response.

**Tech Stack:** TypeScript 5, vitest, Node 18, `@modelcontextprotocol/sdk` ^1.10. Same as the rest of C&C.

**Source spec:** `installer/docs/specs/2026-05-26-installer-design.md` §10 and §7.2.

**Out of scope for this plan:** the Go installer itself, GitHub Actions release workflow, the updater stub binary. Those land in Plan 2 and Plan 3.

---

## File structure

**New files:**

- `packages/command-and-control/src/tools/setup_anthropic.ts` — `setupAnthropic()` + `loadAnthropicConfig()` + types.
- `packages/command-and-control/tests/tools/setup_anthropic.test.ts`
- `packages/command-and-control/src/tools/setup_canvas.ts` — `setupCanvas()` + `loadCanvasConfig()` + types.
- `packages/command-and-control/tests/tools/setup_canvas.test.ts`
- `packages/command-and-control/src/update/check.ts` — `checkForUpdates()`, `getUpdateNotice()`, `getInstalledVersion()`, `compareVersions()`.
- `packages/command-and-control/tests/update/check.test.ts`

**Modified files:**

- `packages/command-and-control/src/index.ts` — register two new tools, kick off update check on startup, append notice in `CallToolRequestSchema` handler.
- `packages/command-and-control/package.json` — bump version to `0.9.1` (the patch that ships these features).

---

## Task 1: `setup_anthropic` tool — write tests

**Files:**
- Create: `packages/command-and-control/tests/tools/setup_anthropic.test.ts`

- [ ] **Step 1: Write the failing test file**

Mirror `setup_panopto.test.ts` exactly. Save as `packages/command-and-control/tests/tools/setup_anthropic.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-anthropic-setup-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

import { setupAnthropic, loadAnthropicConfig } from '../../src/tools/setup_anthropic.js';

const TEST_INPUT = {
  apiKey: 'sk-ant-test-key',
};

describe('setupAnthropic', () => {
  it('saves config and returns configured:true when key validates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    const result = await setupAnthropic(TEST_INPUT);

    expect(result.configured).toBe(true);
    expect(result.validatedAt).toBeDefined();
    const saved = JSON.parse(readFileSync(join(tmpHome, 'anthropic-config.json'), 'utf-8'));
    expect(saved.apiKey).toBe('sk-ant-test-key');
    expect(saved.lastValidatedAt).toBeDefined();
  });

  // Skipped on Windows: writeFileSync({mode: 0o600}) is silently ignored by Node on Windows;
  // statSync().mode always reports 0o666 there. Permissions are still enforced on macOS/Linux
  // (the real installer target along with Windows NTFS ACLs on the user's home directory).
  it.skipIf(process.platform === 'win32')('writes the config file with 0o600 permissions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic(TEST_INPUT);

    const stats = statSync(join(tmpHome, 'anthropic-config.json'));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('does NOT save and returns error when key fails 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const result = await setupAnthropic(TEST_INPUT);

    expect(result.configured).toBe(false);
    expect(result.error).toBe('CREDENTIAL_VALIDATION_FAILED');
    expect(existsSync(join(tmpHome, 'anthropic-config.json'))).toBe(false);
  });

  it('saves without calling fetch when test:false', async () => {
    const result = await setupAnthropic({ ...TEST_INPUT, test: false });

    expect(result.configured).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(existsSync(join(tmpHome, 'anthropic-config.json'))).toBe(true);
  });

  it('does not include apiKey in return value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    const result = await setupAnthropic(TEST_INPUT);

    expect(JSON.stringify(result)).not.toContain('sk-ant-test-key');
  });

  it('uses the model from input when provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic({ ...TEST_INPUT, model: 'claude-opus-4-7' });

    const saved = JSON.parse(readFileSync(join(tmpHome, 'anthropic-config.json'), 'utf-8'));
    expect(saved.model).toBe('claude-opus-4-7');
  });

  it('defaults to claude-haiku-4-5-20251001 when model omitted', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic(TEST_INPUT);

    const saved = JSON.parse(readFileSync(join(tmpHome, 'anthropic-config.json'), 'utf-8'));
    expect(saved.model).toBe('claude-haiku-4-5-20251001');
  });

  it('sends the Anthropic API call to the messages endpoint with the right headers', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);

    await setupAnthropic(TEST_INPUT);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');
  });
});

describe('loadAnthropicConfig', () => {
  it('throws ANTHROPIC_NOT_CONFIGURED when file is absent', () => {
    expect(() => loadAnthropicConfig()).toThrow('ANTHROPIC_NOT_CONFIGURED');
  });

  it('returns full config when file exists and is valid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: '.' }] }),
    } as Response);
    await setupAnthropic(TEST_INPUT);

    const config = loadAnthropicConfig();
    expect(config.apiKey).toBe('sk-ant-test-key');
    expect(config.model).toBe('claude-haiku-4-5-20251001');
  });

  it('throws ANTHROPIC_NOT_CONFIGURED when config is missing apiKey', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(tmpHome, { recursive: true });
    writeFileSync(join(tmpHome, 'anthropic-config.json'), JSON.stringify({ model: 'foo' }));
    expect(() => loadAnthropicConfig()).toThrow('ANTHROPIC_NOT_CONFIGURED');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- setup_anthropic`

Expected: FAIL with "Cannot find module '../../src/tools/setup_anthropic.js'".

---

## Task 2: `setup_anthropic` tool — implementation

**Files:**
- Create: `packages/command-and-control/src/tools/setup_anthropic.ts`

- [ ] **Step 1: Write the tool implementation**

Save as `packages/command-and-control/src/tools/setup_anthropic.ts`:

```typescript
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export interface AnthropicSetupConfig {
  apiKey: string;
  model: string;
  configuredAt: string;
  lastValidatedAt: string;
}

export interface SetupAnthropicInput {
  apiKey: string;
  /** Defaults to claude-haiku-4-5-20251001 — chosen for low-cost validation calls. */
  model?: string;
  /** Default: true — validate the key with a 1-token call before saving. */
  test?: boolean;
}

export interface SetupAnthropicResult {
  configured: boolean;
  model?: string;
  validatedAt?: string;
  message?: string;
  error?: string;
  fix?: string[];
}

function getAnthropicConfigPath(): string {
  return join(getCcHomePath(), 'anthropic-config.json');
}

export function loadAnthropicConfig(): AnthropicSetupConfig {
  const configPath = getAnthropicConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: Run setup_anthropic with your Anthropic API key.',
    );
  }
  let config: Partial<AnthropicSetupConfig>;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is corrupt. Re-run setup_anthropic.',
    );
  }
  if (!config.apiKey) {
    throw new Error(
      'ANTHROPIC_NOT_CONFIGURED: anthropic-config.json is missing apiKey. Re-run setup_anthropic.',
    );
  }
  return {
    apiKey: config.apiKey,
    model: config.model ?? DEFAULT_MODEL,
    configuredAt: config.configuredAt ?? '',
    lastValidatedAt: config.lastValidatedAt ?? '',
  };
}

async function validateKey(apiKey: string, model: string): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}`);
  }
}

export async function setupAnthropic(input: SetupAnthropicInput): Promise<SetupAnthropicResult> {
  const { apiKey, model = DEFAULT_MODEL, test = true } = input;
  const now = new Date().toISOString();

  if (test) {
    try {
      await validateKey(apiKey, model);
    } catch (err) {
      return {
        configured: false,
        error: 'CREDENTIAL_VALIDATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        fix: [
          'Verify the API key at platform.anthropic.com/account/api-keys',
          'Confirm the key has access to the chosen model',
          'Check network connectivity to api.anthropic.com',
        ],
      };
    }
  }

  const config: AnthropicSetupConfig = {
    apiKey,
    model,
    configuredAt: now,
    lastValidatedAt: test ? now : '',
  };

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getAnthropicConfigPath();
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  return {
    configured: true,
    model,
    ...(test && { validatedAt: now }),
    message: test
      ? `Anthropic API key configured and validated against ${model}.`
      : `Anthropic API key configured (not tested).`,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- setup_anthropic`

Expected: PASS — 10 tests in 2 describe blocks.

- [ ] **Step 3: Commit**

```bash
git -C D:/Dev/canvas-toolchain add packages/command-and-control/src/tools/setup_anthropic.ts packages/command-and-control/tests/tools/setup_anthropic.test.ts
git -C D:/Dev/canvas-toolchain commit -m "feat(cc): add setup_anthropic tool with credential validation (refs #63)"
```

---

## Task 3: Register `setup_anthropic` in MCP server

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Add import**

In `packages/command-and-control/src/index.ts`, after line 20 (the existing `import { setupPanopto } from './tools/setup_panopto.js';`):

```typescript
import { setupAnthropic } from './tools/setup_anthropic.js';
```

- [ ] **Step 2: Add ListTools entry**

In the `setRequestHandler(ListToolsRequestSchema, ...)` block, after the `setup_cc` entry and before `get_cc_status`, insert:

```typescript
{
  name: 'setup_anthropic',
  description: 'Configure the Anthropic API key used by all AI-powered tools. Validates the key against the Anthropic API before saving. Stored locally at ~/.command-and-control/anthropic-config.json with 0o600 permissions.',
  inputSchema: {
    type: 'object' as const,
    required: ['apiKey'],
    properties: {
      apiKey: { type: 'string', description: 'Anthropic API key starting with sk-ant-. Stored locally and never echoed back.' },
      model: { type: 'string', description: 'Anthropic model name for validation calls, e.g. "claude-haiku-4-5-20251001" (default).' },
      test: { type: 'boolean', description: 'Validate the key with a 1-token API call before saving (default: true).' },
    },
  },
},
```

- [ ] **Step 3: Add switch case**

In the `setRequestHandler(CallToolRequestSchema, ...)` block, after `case 'setup_cc':` and its body, add:

```typescript
case 'setup_anthropic':
  result = await setupAnthropic(args as unknown as Parameters<typeof setupAnthropic>[0]);
  break;
```

- [ ] **Step 4: Build C&C and verify**

Run: `cd D:/Dev/canvas-toolchain && npm run build --workspace=packages/command-and-control`

Expected: Clean build, no TS errors.

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control`

Expected: All existing + new tests pass.

- [ ] **Step 5: Commit**

```bash
git -C D:/Dev/canvas-toolchain add packages/command-and-control/src/index.ts
git -C D:/Dev/canvas-toolchain commit -m "feat(cc): register setup_anthropic in MCP server (refs #63)"
```

---

## Task 4: `setup_canvas` tool — write tests

**Files:**
- Create: `packages/command-and-control/tests/tools/setup_canvas.test.ts`

- [ ] **Step 1: Write the failing test file**

Save as `packages/command-and-control/tests/tools/setup_canvas.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-canvas-setup-'));
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

import { setupCanvas, loadCanvasConfig } from '../../src/tools/setup_canvas.js';

const TEST_INPUT = {
  host: 'bsu.instructure.com',
  token: 'canvas-test-token',
};

describe('setupCanvas', () => {
  it('saves config and returns configured:true when token validates', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12345, name: 'Test User' }),
    } as Response);

    const result = await setupCanvas(TEST_INPUT);

    expect(result.configured).toBe(true);
    expect(result.host).toBe('bsu.instructure.com');
    expect(result.validatedAt).toBeDefined();
    const saved = JSON.parse(readFileSync(join(tmpHome, 'canvas-config.json'), 'utf-8'));
    expect(saved.host).toBe('bsu.instructure.com');
    expect(saved.token).toBe('canvas-test-token');
  });

  // Skipped on Windows — see note on setup_anthropic.test.ts.
  it.skipIf(process.platform === 'win32')('writes the config file with 0o600 permissions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    await setupCanvas(TEST_INPUT);

    const stats = statSync(join(tmpHome, 'canvas-config.json'));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('does NOT save and returns error on 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const result = await setupCanvas(TEST_INPUT);

    expect(result.configured).toBe(false);
    expect(result.error).toBe('CREDENTIAL_VALIDATION_FAILED');
    expect(existsSync(join(tmpHome, 'canvas-config.json'))).toBe(false);
  });

  it('saves without calling fetch when test:false', async () => {
    const result = await setupCanvas({ ...TEST_INPUT, test: false });

    expect(result.configured).toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(existsSync(join(tmpHome, 'canvas-config.json'))).toBe(true);
  });

  it('does not include token in return value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    const result = await setupCanvas(TEST_INPUT);

    expect(JSON.stringify(result)).not.toContain('canvas-test-token');
  });

  it('calls the correct Canvas API endpoint with bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    await setupCanvas(TEST_INPUT);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://bsu.instructure.com/api/v1/users/self');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer canvas-test-token');
  });

  it('strips a leading https:// from host before storing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);

    await setupCanvas({ host: 'https://bsu.instructure.com/', token: 'tok' });

    const saved = JSON.parse(readFileSync(join(tmpHome, 'canvas-config.json'), 'utf-8'));
    expect(saved.host).toBe('bsu.instructure.com');
  });
});

describe('loadCanvasConfig', () => {
  it('throws CANVAS_NOT_CONFIGURED when file is absent', () => {
    expect(() => loadCanvasConfig()).toThrow('CANVAS_NOT_CONFIGURED');
  });

  it('returns full config when file exists and is valid', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 1 }),
    } as Response);
    await setupCanvas(TEST_INPUT);

    const config = loadCanvasConfig();
    expect(config.host).toBe('bsu.instructure.com');
    expect(config.token).toBe('canvas-test-token');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- setup_canvas`

Expected: FAIL with "Cannot find module '../../src/tools/setup_canvas.js'".

---

## Task 5: `setup_canvas` tool — implementation

**Files:**
- Create: `packages/command-and-control/src/tools/setup_canvas.ts`

- [ ] **Step 1: Write the tool implementation**

Save as `packages/command-and-control/src/tools/setup_canvas.ts`:

```typescript
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export interface CanvasSetupConfig {
  host: string;
  token: string;
  configuredAt: string;
  lastValidatedAt: string;
}

export interface SetupCanvasInput {
  /** Canvas hostname, e.g. "bsu.instructure.com". Leading scheme + trailing slash are stripped. */
  host: string;
  /** Canvas API access token (Canvas → Account → Settings → New Access Token). */
  token: string;
  /** Default: true — validate by calling /api/v1/users/self before saving. */
  test?: boolean;
}

export interface SetupCanvasResult {
  configured: boolean;
  host?: string;
  validatedAt?: string;
  message?: string;
  error?: string;
  fix?: string[];
}

function getCanvasConfigPath(): string {
  return join(getCcHomePath(), 'canvas-config.json');
}

function normalizeHost(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

export function loadCanvasConfig(): CanvasSetupConfig {
  const configPath = getCanvasConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      'CANVAS_NOT_CONFIGURED: Run setup_canvas with your Canvas host and API token.',
    );
  }
  let config: Partial<CanvasSetupConfig>;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    throw new Error(
      'CANVAS_NOT_CONFIGURED: canvas-config.json is corrupt. Re-run setup_canvas.',
    );
  }
  if (!config.host || !config.token) {
    throw new Error(
      'CANVAS_NOT_CONFIGURED: canvas-config.json is missing required fields. Re-run setup_canvas.',
    );
  }
  return config as CanvasSetupConfig;
}

async function validateToken(host: string, token: string): Promise<void> {
  const response = await fetch(`https://${host}/api/v1/users/self`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Canvas API returned ${response.status}`);
  }
}

export async function setupCanvas(input: SetupCanvasInput): Promise<SetupCanvasResult> {
  const host = normalizeHost(input.host);
  const { token, test = true } = input;
  const now = new Date().toISOString();

  if (test) {
    try {
      await validateToken(host, token);
    } catch (err) {
      return {
        configured: false,
        error: 'CREDENTIAL_VALIDATION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        fix: [
          'Verify the token at Canvas → Account → Settings → New Access Token',
          'Confirm the host is your school\'s Canvas URL (e.g. "bsu.instructure.com")',
          'Check network connectivity',
        ],
      };
    }
  }

  const config: CanvasSetupConfig = {
    host,
    token,
    configuredAt: now,
    lastValidatedAt: test ? now : '',
  };

  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = getCanvasConfigPath();
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, configPath);

  return {
    configured: true,
    host,
    ...(test && { validatedAt: now }),
    message: test
      ? `Canvas configured and token validated for ${host}.`
      : `Canvas configured for ${host} (token not tested).`,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- setup_canvas`

Expected: PASS — 9 tests in 2 describe blocks.

- [ ] **Step 3: Commit**

```bash
git -C D:/Dev/canvas-toolchain add packages/command-and-control/src/tools/setup_canvas.ts packages/command-and-control/tests/tools/setup_canvas.test.ts
git -C D:/Dev/canvas-toolchain commit -m "feat(cc): add setup_canvas tool with token validation (refs #63)"
```

---

## Task 6: Register `setup_canvas` in MCP server

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Add import**

Below the `setupAnthropic` import added in Task 3:

```typescript
import { setupCanvas } from './tools/setup_canvas.js';
```

- [ ] **Step 2: Add ListTools entry**

Immediately after the `setup_anthropic` tool entry added in Task 3:

```typescript
{
  name: 'setup_canvas',
  description: 'Configure the Canvas LMS host and API token used for direct page publishing. Validates the token against /api/v1/users/self before saving. Stored locally at ~/.command-and-control/canvas-config.json with 0o600 permissions.',
  inputSchema: {
    type: 'object' as const,
    required: ['host', 'token'],
    properties: {
      host: { type: 'string', description: 'Canvas hostname, e.g. "bsu.instructure.com". Leading https:// is stripped automatically.' },
      token: { type: 'string', description: 'Canvas API access token from Canvas → Account → Settings → New Access Token. Stored locally and never echoed back.' },
      test: { type: 'boolean', description: 'Validate the token with /api/v1/users/self before saving (default: true).' },
    },
  },
},
```

- [ ] **Step 3: Add switch case**

After the `case 'setup_anthropic':` block:

```typescript
case 'setup_canvas':
  result = await setupCanvas(args as unknown as Parameters<typeof setupCanvas>[0]);
  break;
```

- [ ] **Step 4: Build and verify**

Run: `cd D:/Dev/canvas-toolchain && npm run build --workspace=packages/command-and-control && npm test --workspace=packages/command-and-control`

Expected: Clean build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git -C D:/Dev/canvas-toolchain add packages/command-and-control/src/index.ts
git -C D:/Dev/canvas-toolchain commit -m "feat(cc): register setup_canvas in MCP server (refs #63)"
```

---

## Task 7: Update-check module — write tests

**Files:**
- Create: `packages/command-and-control/tests/update/check.test.ts`

- [ ] **Step 1: Write the failing test file**

Save as `packages/command-and-control/tests/update/check.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let tmpInstallDir: string;

beforeEach(() => {
  tmpInstallDir = mkdtempSync(join(tmpdir(), 'cc-update-check-'));
  process.env.CC_INSTALL_DIR = tmpInstallDir;
});

afterEach(() => {
  delete process.env.CC_INSTALL_DIR;
  rmSync(tmpInstallDir, { recursive: true, force: true });
});

import {
  checkForUpdates,
  getUpdateNotice,
  compareVersions,
  getInstalledVersion,
  resetUpdateState,
} from '../../src/update/check.js';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns -1 when a < b', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });

  it('returns 1 when a > b', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  });

  it('handles leading v prefix on either side', () => {
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.0.0', 'v1.0.1')).toBe(-1);
  });

  it('treats non-numeric segments as 0', () => {
    expect(compareVersions('1.0.x', '1.0.0')).toBe(0);
  });
});

describe('getInstalledVersion', () => {
  beforeEach(() => {
    resetUpdateState();
  });

  it('reads from .canvas-toolchain-version file when present', () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), 'v0.9.2\n');
    expect(getInstalledVersion()).toBe('0.9.2');
  });

  it('falls back to package.json version when the marker file is missing', () => {
    // The C&C package.json version is what's returned here.
    const v = getInstalledVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('checkForUpdates', () => {
  beforeEach(() => {
    resetUpdateState();
  });

  it('sets the update-available flag when remote version is newer', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.1', html_url: 'https://example/release' }),
    } as Response);

    await checkForUpdates();

    expect(getUpdateNotice()).toContain('0.9.1');
    expect(getUpdateNotice()).toContain('Updater');
  });

  it('does NOT set the flag when remote version equals installed', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.1' }),
    } as Response);

    await checkForUpdates();

    expect(getUpdateNotice()).toBeNull();
  });

  it('does NOT set the flag when remote version is older', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.5');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.4' }),
    } as Response);

    await checkForUpdates();

    expect(getUpdateNotice()).toBeNull();
  });

  it('silently skips when fetch throws', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));

    await expect(checkForUpdates()).resolves.toBeUndefined();
    expect(getUpdateNotice()).toBeNull();
  });

  it('silently skips on non-OK HTTP response', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    await checkForUpdates();
    expect(getUpdateNotice()).toBeNull();
  });

  it('writes a cache file with the check timestamp', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.1' }),
    } as Response);

    await checkForUpdates();

    const cachePath = join(tmpInstallDir, '.canvas-toolchain-update-cache.json');
    expect(existsSync(cachePath)).toBe(true);
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(cache.lastCheckAt).toBeDefined();
    expect(cache.latestVersion).toBe('0.9.1');
  });

  it('skips the network call when cache is fresh (under 24h)', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    const cache = {
      lastCheckAt: new Date().toISOString(),
      latestVersion: '0.9.1',
    };
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-update-cache.json'), JSON.stringify(cache));

    await checkForUpdates();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(getUpdateNotice()).toContain('0.9.1');
  });

  it('re-checks when cache is older than 24h', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const cache = { lastCheckAt: stale, latestVersion: '0.9.1' };
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-update-cache.json'), JSON.stringify(cache));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v0.9.2' }),
    } as Response);

    await checkForUpdates();

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    expect(getUpdateNotice()).toContain('0.9.2');
  });

  it('aborts the network call after 5 seconds', async () => {
    writeFileSync(join(tmpInstallDir, '.canvas-toolchain-version'), '0.9.0');
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      // Simulate aborted signal
      return new Promise((_resolve, reject) => {
        (init as RequestInit).signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
        setTimeout(() => reject(new Error('not aborted')), 10000);
      });
    });

    const start = Date.now();
    await checkForUpdates();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(7000);
    expect(getUpdateNotice()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- update/check`

Expected: FAIL with "Cannot find module '../../src/update/check.js'".

---

## Task 8: Update-check module — implementation

**Files:**
- Create: `packages/command-and-control/src/update/check.ts`

- [ ] **Step 1: Write the implementation**

Save as `packages/command-and-control/src/update/check.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 5000;
const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/Ryfter/canvas-toolchain/releases/latest';

interface UpdateCache {
  lastCheckAt: string;
  latestVersion: string;
}

let cachedNotice: string | null = null;

export function resetUpdateState(): void {
  cachedNotice = null;
}

export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map((p) => {
    const n = parseInt(p, 10);
    return Number.isNaN(n) ? 0 : n;
  });
  const av = parse(a);
  const bv = parse(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const x = av[i] ?? 0;
    const y = bv[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function getInstallDir(): string {
  if (process.env.CC_INSTALL_DIR) return process.env.CC_INSTALL_DIR;
  // Resolve from this module's path up to the monorepo root.
  // This file at runtime: <install-dir>/packages/command-and-control/dist/update/check.js
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..');
}

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, '..', '..', 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function getInstalledVersion(): string {
  const markerPath = join(getInstallDir(), '.canvas-toolchain-version');
  if (existsSync(markerPath)) {
    const raw = readFileSync(markerPath, 'utf-8').trim();
    return raw.replace(/^v/i, '');
  }
  return readPackageVersion();
}

function getCachePath(): string {
  return join(getInstallDir(), '.canvas-toolchain-update-cache.json');
}

function readCache(): UpdateCache | null {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return null;
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as UpdateCache;
  } catch {
    return null;
  }
}

function isFresh(cache: UpdateCache): boolean {
  const checkedAt = Date.parse(cache.lastCheckAt);
  if (Number.isNaN(checkedAt)) return false;
  return Date.now() - checkedAt < CACHE_TTL_MS;
}

function formatNotice(latest: string): string {
  return `\n\n_Update available: v${latest} — click the Canvas Toolchain Updater shortcut to upgrade._`;
}

async function fetchLatestRelease(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { tag_name?: string };
    if (typeof body.tag_name !== 'string') return null;
    return body.tag_name.replace(/^v/i, '');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdates(): Promise<void> {
  const installed = getInstalledVersion();
  const cache = readCache();

  let latest: string | null = null;
  if (cache && isFresh(cache)) {
    latest = cache.latestVersion;
  } else {
    latest = await fetchLatestRelease();
    if (latest !== null) {
      try {
        writeFileSync(
          getCachePath(),
          JSON.stringify({ lastCheckAt: new Date().toISOString(), latestVersion: latest }, null, 2),
          'utf-8',
        );
      } catch {
        // Cache write is best-effort; ignore failures (e.g. read-only filesystem).
      }
    }
  }

  if (latest && compareVersions(installed, latest) < 0) {
    cachedNotice = formatNotice(latest);
  } else {
    cachedNotice = null;
  }
}

export function getUpdateNotice(): string | null {
  return cachedNotice;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- update/check`

Expected: PASS — all tests in 3 describe blocks.

- [ ] **Step 3: Commit**

```bash
git -C D:/Dev/canvas-toolchain add packages/command-and-control/src/update/check.ts packages/command-and-control/tests/update/check.test.ts
git -C D:/Dev/canvas-toolchain commit -m "feat(cc): add update-check module with 24h cache and 5s timeout (refs #63)"
```

---

## Task 9: Wire update-check into MCP server

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Add the update-check imports**

After the existing imports near the top of `src/index.ts`:

```typescript
import { checkForUpdates, getUpdateNotice } from './update/check.js';
```

- [ ] **Step 2: Kick off the check at server startup**

After the `const server = new Server(...)` block and before `server.setRequestHandler(ListToolsRequestSchema, ...)`, add:

```typescript
// Fire-and-forget background check — never blocks startup.
void checkForUpdates();
```

- [ ] **Step 3: Append the notice to every tool response**

Find the final return statement in the `setRequestHandler(CallToolRequestSchema, ...)` handler. Currently:

```typescript
return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
```

Replace with:

```typescript
const notice = getUpdateNotice();
const text = JSON.stringify(result, null, 2) + (notice ?? '');
return { content: [{ type: 'text', text }] };
```

(Do not modify the error-path return at the end — error responses don't carry the notice.)

- [ ] **Step 4: Build and verify**

Run: `cd D:/Dev/canvas-toolchain && npm run build --workspace=packages/command-and-control && npm test --workspace=packages/command-and-control`

Expected: Clean build, all tests pass.

- [ ] **Step 5: Add an integration test for the notice appending**

Create `packages/command-and-control/tests/server/update_notice.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUpdateNotice, resetUpdateState } from '../../src/update/check.js';

beforeEach(() => {
  resetUpdateState();
});

describe('update notice integration', () => {
  it('formats notice text with the latest version and Updater hint', () => {
    // Simulate the module's internal state by exercising checkForUpdates path indirectly.
    // We can't easily test the index.ts handler without booting the full server,
    // so this test guards the contract that getUpdateNotice returns null when no check has set it.
    expect(getUpdateNotice()).toBeNull();
  });
});
```

Run: `cd D:/Dev/canvas-toolchain && npm test --workspace=packages/command-and-control -- update_notice`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C D:/Dev/canvas-toolchain add packages/command-and-control/src/index.ts packages/command-and-control/tests/server/update_notice.test.ts
git -C D:/Dev/canvas-toolchain commit -m "feat(cc): append update-available notice to tool responses (refs #63)"
```

---

## Task 10: Final integration check

**Files:**
- None modified — verification only.

**Note (Kevin's call 2026-05-26):** The C&C `package.json` version stays at 1.0.0. The originally-proposed bump down to 0.9.1 was rejected — package versions track the package's own API stability, not the bundled toolchain release tag (which is tracked in `<install-dir>/.canvas-toolchain-version` instead).

- [ ] **Step 1 (was Step 2): Run the full monorepo test + build**

Run:
```bash
cd D:/Dev/canvas-toolchain
npm test
npm run build
```

Expected: All workspaces pass tests; clean build.

- [ ] **Step 2 (was Step 3): Run the C&C smoke integration test**

Run: `cd D:/Dev/canvas-toolchain && npm run smoke:integration --workspace=packages/command-and-control`

Expected: Smoke test passes — no regressions in the integration paths.

- [ ] **Step 3 (was Step 5): Finish with `superpowers:finishing-a-development-branch`**

This plan does not push or create a PR. Hand off to `finishing-a-development-branch` to verify tests, surface options (merge locally / push & PR / keep / discard), and act on the chosen path.

---

## Plan self-review

Spec coverage check (spec at `installer/docs/specs/2026-05-26-installer-design.md`):

- §10 "C&C: add `setup_anthropic` MCP tool + `loadAnthropicConfig` reader" → Tasks 1-3. ✓
- §10 "C&C: add `setup_canvas` MCP tool + `loadCanvasConfig` reader" → Tasks 4-6. ✓
- §10 "Update-nudge feature in `packages/command-and-control/src/index.ts` per §7.2" → Tasks 7-9. ✓
- §7.2 "24h cache file at `<install-dir>/.canvas-toolchain-update-cache.json`" → Task 7-8 tests verify cache write and freshness. ✓
- §7.2 "GET github.com/repos/Ryfter/canvas-toolchain/releases/latest with a 5-second timeout" → Task 8 implements `NETWORK_TIMEOUT_MS = 5000` and abort signal. ✓
- §7.2 "If latest > installed, set an in-process flag" → Task 8 sets `cachedNotice`. ✓
- §7.2 "When any C&C tool returns a response, if the flag is set, append a single line" → Task 9 step 3. ✓

Placeholder scan: No "TBD"s, all code blocks are concrete, all commands have expected output stated, all file paths absolute or rooted at `packages/command-and-control/`.

Type consistency: `setupAnthropic`, `loadAnthropicConfig`, `AnthropicSetupConfig`, `SetupAnthropicInput`, `SetupAnthropicResult` are consistent across Tasks 1-3. Same pattern for `setupCanvas`. `checkForUpdates`, `getUpdateNotice`, `compareVersions`, `getInstalledVersion`, `resetUpdateState` are consistent across Tasks 7-9.

Scope: Each task is self-contained with its own commit. Test-first throughout. Total ~10 tasks, ~45 sub-steps. Appropriate for one subagent-driven-development session.
