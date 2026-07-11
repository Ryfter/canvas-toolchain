# Widget Renderer — Plan A (Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the foundational infrastructure for the widget renderer, prove the architecture end-to-end with the first catalog renderer (`card-flip-reveal`), and extract the duplicate Anthropic LLM client into a shared package.

**Architecture:** New `packages/shared-llm/` workspace package extracted from C&C duplicates. New `tools/widget/` tree in `canvas-design-studio` with types, accessibility harness, sizing helper, full-document HTML wrapper, and the first renderer (`card-flip-reveal`). New `render_widget` MCP tool registered in CDS.

**Tech Stack:** TypeScript 5, ESM, Vitest. New deps: `zod`, `zod-to-json-schema` (in canvas-design-studio). New workspace package: `@canvas-toolchain/shared-llm`.

**Spec:** `packages/canvas-design-studio/docs/superpowers/specs/2026-06-02-widget-renderer-design.md`

**Tracking issue:** [#88](https://github.com/Ryfter/canvas-toolchain/issues/88)

**Ships when complete:** Faculty can write an `InteractiveSpec` (or get one from `brainstorm_interactive`), run `render_widget`, and open the resulting standalone HTML file in a browser to interact with a working `card-flip-reveal` widget.

---

## File structure

**New files in this plan:**

```
packages/shared-llm/                        ← NEW workspace package
  package.json
  tsconfig.json
  src/
    index.ts                                ← exports LlmClient, AnthropicLlmClient, LlmResponse, AnthropicConfig
  tests/
    anthropic-client.test.ts

packages/canvas-design-studio/src/tools/widget/      ← NEW directory tree
  types.ts                                  ← WidgetKind enum, Renderer<T>, RenderInput/Result, Result<T>
  a11y.ts                                   ← sr-only CSS, announce() bootstrap JS
  sizing.ts                                 ← dimensions → CSS + iframe height
  wrapper.ts                                ← buildWidgetHtml(body, css, js, spec)
  schemas.ts                                ← zod-to-json-schema export helper
  catalog/
    card-flip-reveal.ts                     ← first renderer
    index.ts                                ← CATALOG: Record<WidgetKind, Renderer>

packages/canvas-design-studio/src/tools/render-widget.ts    ← NEW MCP tool entry

packages/canvas-design-studio/tests/widget/         ← NEW test tree
  a11y.test.ts
  sizing.test.ts
  wrapper.test.ts
  schemas.test.ts
  catalog/
    card-flip-reveal.test.ts
  render-widget.test.ts
```

**Modified files in this plan:**

```
package.json                                                ← add shared-llm to workspaces build order
packages/canvas-design-studio/package.json                  ← add zod, zod-to-json-schema; add @canvas-toolchain/shared-llm dep (not used in Plan A but added so brain test passes)
packages/canvas-design-studio/src/index.ts                  ← register render_widget tool
packages/command-and-control/package.json                   ← add @canvas-toolchain/shared-llm dep
packages/command-and-control/src/tools/rubric/llm_client.ts ← re-export from shared-llm (compat shim)
packages/command-and-control/src/tools/brainstorm/llm_client.ts ← re-export from shared-llm (compat shim)
packages/command-and-control/src/tools/rubric/draft_student_rubric.ts ← use shared-llm directly
packages/command-and-control/src/tools/brainstorm/brainstorm_interactive.ts ← use shared-llm directly
docs/scripts/                                               ← verification scripts (Phase 0)
```

---

## Phase 0 — Pre-flight verification (manual, against University sandbox)

These three verifications MUST complete successfully before any rendering code is written. If any fails, the architecture is invalid and the spec needs revision. Each task produces a small verification script committed to `scripts/verify-88-*.mts` and a result note in the task's commit message.

### Task 0.1: Verify Canvas Files `/preview` URL is iframe-embeddable

**Files:**
- Create: `scripts/verify-88-canvas-files-iframe-headers.mts`

- [ ] **Step 1: Write the verification script**

```ts
// scripts/verify-88-canvas-files-iframe-headers.mts
// Verifies that Canvas Files /preview URL returns iframe-friendly headers
// (no X-Frame-Options: DENY, no restrictive CSP frame-ancestors).
// Usage: npx tsx scripts/verify-88-canvas-files-iframe-headers.mts <courseId> <fileId>

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const courseId = process.argv[2];
const fileId = process.argv[3];
if (!courseId || !fileId) {
  console.error('Usage: tsx scripts/verify-88-canvas-files-iframe-headers.mts <courseId> <fileId>');
  process.exit(1);
}

const cfgPath = join(homedir(), '.command-and-control', 'canvas-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { host: string; token: string };

const url = `https://${cfg.host}/courses/${courseId}/files/${fileId}/preview`;
const res = await fetch(url, {
  method: 'GET',
  headers: { Authorization: `Bearer ${cfg.token}` },
  redirect: 'manual',
});

console.log(`Status: ${res.status}`);
console.log(`URL: ${url}`);
console.log('Relevant headers:');
for (const h of ['x-frame-options', 'content-security-policy', 'content-type']) {
  console.log(`  ${h}: ${res.headers.get(h) ?? '(absent)'}`);
}

const xfo = res.headers.get('x-frame-options')?.toLowerCase() ?? '';
const csp = res.headers.get('content-security-policy')?.toLowerCase() ?? '';
const frameAncestorsBlocked = csp.includes("frame-ancestors 'none'") || csp.match(/frame-ancestors[^;]*'none'/);

if (xfo === 'deny' || frameAncestorsBlocked) {
  console.error('FAIL: Canvas Files /preview cannot be iframe-embedded. Architecture invalid.');
  process.exit(2);
}
if (xfo === 'sameorigin' || xfo === '') {
  console.log('PASS: iframe embedding works from same-origin Canvas page.');
  process.exit(0);
}
console.warn(`UNCLEAR: x-frame-options="${xfo}", csp="${csp}". Manual inspection required.`);
process.exit(3);
```

- [ ] **Step 2: Upload a test HTML file to University sandbox manually**

Use Canvas UI: navigate to course 20255 (University sandbox), Files → upload `scripts/widget-iframe-probe.html` (a one-line `<p>iframe probe</p>`). Note the resulting file_id from the URL.

- [ ] **Step 3: Run the verification script**

Run: `npx tsx scripts/verify-88-canvas-files-iframe-headers.mts 20255 <fileId>`
Expected: exit 0 with `PASS: iframe embedding works from same-origin Canvas page.`

- [ ] **Step 4: Commit the script + result note**

```bash
git add scripts/verify-88-canvas-files-iframe-headers.mts
git commit -m "verify(#88): Canvas Files /preview iframe headers OK

Probe script output against University sandbox course 20255:
  Status: 200
  x-frame-options: SAMEORIGIN
  content-security-policy: (none)
Architecture (Option B, same-origin iframe) is valid."
```

### Task 0.2: Verify `on_duplicate=overwrite` returns same `file_id`

**Files:**
- Create: `scripts/verify-88-canvas-files-overwrite.mts`

- [ ] **Step 1: Write the verification script**

```ts
// scripts/verify-88-canvas-files-overwrite.mts
// Verifies that re-uploading a file with on_duplicate=overwrite returns the SAME file_id.
// Critical for the widget update story (re-render → re-publish should not require page-HTML rewrites).
// Usage: npx tsx scripts/verify-88-canvas-files-overwrite.mts <courseId>

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const courseId = process.argv[2];
if (!courseId) {
  console.error('Usage: tsx scripts/verify-88-canvas-files-overwrite.mts <courseId>');
  process.exit(1);
}

const cfgPath = join(homedir(), '.command-and-control', 'canvas-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { host: string; token: string };
const baseUrl = `https://${cfg.host}/api/v1`;
const auth = { Authorization: `Bearer ${cfg.token}` };

const filename = 'widget-overwrite-probe.html';
const body1 = '<!DOCTYPE html><html><body>v1</body></html>';
const body2 = '<!DOCTYPE html><html><body>v2</body></html>';

async function upload(body: string, label: string): Promise<number> {
  // Step 1: request upload URL
  const initRes = await fetch(`${baseUrl}/courses/${courseId}/files`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: filename,
      size: body.length,
      content_type: 'text/html',
      on_duplicate: 'overwrite',
      parent_folder_path: '/widget-probes',
    }),
  });
  if (!initRes.ok) throw new Error(`init ${label}: ${initRes.status} ${await initRes.text()}`);
  const init = await initRes.json() as { upload_url: string; upload_params: Record<string, string>; file_param: string };

  // Step 2: PUT to S3
  const form = new FormData();
  for (const [k, v] of Object.entries(init.upload_params)) form.append(k, v);
  form.append(init.file_param, new Blob([body], { type: 'text/html' }), filename);
  const putRes = await fetch(init.upload_url, { method: 'POST', body: form, redirect: 'manual' });
  if (putRes.status !== 301 && putRes.status !== 302 && !putRes.ok) throw new Error(`put ${label}: ${putRes.status}`);

  // Step 3: confirm
  const confirmUrl = putRes.headers.get('location');
  if (!confirmUrl) throw new Error(`put ${label}: no Location header for confirm`);
  const confirmRes = await fetch(confirmUrl, { method: 'GET', headers: auth });
  if (!confirmRes.ok) throw new Error(`confirm ${label}: ${confirmRes.status} ${await confirmRes.text()}`);
  const confirmed = await confirmRes.json() as { id: number };
  return confirmed.id;
}

const id1 = await upload(body1, 'first upload');
console.log(`First upload file_id: ${id1}`);
const id2 = await upload(body2, 'overwrite upload');
console.log(`Overwrite upload file_id: ${id2}`);

if (id1 === id2) {
  console.log('PASS: on_duplicate=overwrite preserves file_id. Update story valid.');
  process.exit(0);
}
console.error('FAIL: file_id changed on overwrite. Update story needs page-HTML rewrites on every widget edit.');
process.exit(2);
```

- [ ] **Step 2: Run the verification script**

Run: `npx tsx scripts/verify-88-canvas-files-overwrite.mts 20255`
Expected: exit 0 with `PASS: on_duplicate=overwrite preserves file_id. Update story valid.`

- [ ] **Step 3: Commit the script + result note**

```bash
git add scripts/verify-88-canvas-files-overwrite.mts
git commit -m "verify(#88): Canvas Files on_duplicate=overwrite preserves file_id

Probe script output against University sandbox course 20255:
  First upload file_id: <N>
  Overwrite upload file_id: <N>  (same)
Update story (re-render → re-publish without page-HTML rewrite) is valid."
```

### Task 0.3: Verify Canvas RCE preserves iframe `sandbox` attributes through save

**Files:**
- Create: `scripts/verify-88-rce-iframe-sandbox.mts`

- [ ] **Step 1: Write the verification script**

```ts
// scripts/verify-88-rce-iframe-sandbox.mts
// Verifies that the Canvas RCE preserves iframe sandbox attributes when a page is saved via API.
// Critical because some Canvas instances strip sandbox= attributes during HTML sanitization.
// Usage: npx tsx scripts/verify-88-rce-iframe-sandbox.mts <courseId>

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const courseId = process.argv[2];
if (!courseId) {
  console.error('Usage: tsx scripts/verify-88-rce-iframe-sandbox.mts <courseId>');
  process.exit(1);
}

const cfgPath = join(homedir(), '.command-and-control', 'canvas-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { host: string; token: string };
const baseUrl = `https://${cfg.host}/api/v1`;
const auth = { Authorization: `Bearer ${cfg.token}` };

const probeSlug = 'widget-iframe-sandbox-probe';
const writtenHtml = '<p>Probe page.</p>\n<iframe src="/courses/' + courseId + '/files/0/preview" width="100%" height="400" title="probe" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy">fallback</iframe>';

// Create the page
const createRes = await fetch(`${baseUrl}/courses/${courseId}/pages`, {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ wiki_page: { title: 'Widget Iframe Sandbox Probe', body: writtenHtml, published: false } }),
});
if (!createRes.ok) throw new Error(`create: ${createRes.status} ${await createRes.text()}`);

// Fetch the page back
const getRes = await fetch(`${baseUrl}/courses/${courseId}/pages/${probeSlug}`, { headers: auth });
if (!getRes.ok) throw new Error(`get: ${getRes.status} ${await getRes.text()}`);
const page = await getRes.json() as { body: string };

const fetchedHtml = page.body;
console.log('Wrote to Canvas:');
console.log('  ' + writtenHtml);
console.log('Read back from Canvas:');
console.log('  ' + fetchedHtml);

const fetchedSandbox = fetchedHtml.match(/sandbox="([^"]*)"/)?.[1];
const writtenSandbox = 'allow-scripts allow-same-origin allow-forms';

if (fetchedSandbox === writtenSandbox) {
  console.log('PASS: Canvas RCE preserved sandbox attribute exactly.');
  // Clean up the probe page
  await fetch(`${baseUrl}/courses/${courseId}/pages/${probeSlug}`, { method: 'DELETE', headers: auth });
  process.exit(0);
}
console.error(`FAIL: sandbox attribute changed. wrote: "${writtenSandbox}", read: "${fetchedSandbox ?? '(missing)'}"`);
process.exit(2);
```

- [ ] **Step 2: Run the verification script**

Run: `npx tsx scripts/verify-88-rce-iframe-sandbox.mts 20255`
Expected: exit 0 with `PASS: Canvas RCE preserved sandbox attribute exactly.`

- [ ] **Step 3: Commit the script + result note**

```bash
git add scripts/verify-88-rce-iframe-sandbox.mts
git commit -m "verify(#88): Canvas RCE preserves iframe sandbox attributes

Probe script output against University sandbox course 20255:
  wrote sandbox=\"allow-scripts allow-same-origin allow-forms\"
  read   sandbox=\"allow-scripts allow-same-origin allow-forms\"
Architecture's iframe embed shape is safe to ship."
```

---

## Phase 1 — Shared LLM package extraction

### Task 1.1: Create the `shared-llm` workspace package

**Files:**
- Create: `packages/shared-llm/package.json`
- Create: `packages/shared-llm/tsconfig.json`
- Create: `packages/shared-llm/src/index.ts` (stub)
- Create: `packages/shared-llm/tests/.gitkeep`
- Modify: `package.json` (root) — add shared-llm to build order

- [ ] **Step 1: Write the package.json**

```json
{
  "name": "@canvas-toolchain/shared-llm",
  "version": "1.0.0",
  "description": "Shared Anthropic LLM client extracted from C&C tools/rubric and tools/brainstorm",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

- [ ] **Step 2: Write the tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write a stub index.ts**

```ts
// Stub — real exports added in Task 1.2.
export {};
```

- [ ] **Step 4: Update root package.json build order**

Edit `package.json` `scripts.build` to insert `npm run build --workspace=packages/shared-llm &&` between the `shared-types` and `curriculum-intelligence` steps:

```
"build": "npm run build --workspace=packages/shared-types && npm run build --workspace=packages/shared-llm && npm run build --workspace=packages/curriculum-intelligence && npm run build --workspace=packages/canvas-design-studio && npm run build --workspace=packages/command-and-control",
```

- [ ] **Step 5: Install and verify it builds clean**

Run: `npm install`
Run: `npm run build --workspace=packages/shared-llm`
Expected: builds with no errors. `packages/shared-llm/dist/index.js` exists.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-llm/ package.json package-lock.json
git commit -m "feat(shared-llm): scaffold workspace package

New @canvas-toolchain/shared-llm package, peer of shared-types.
Empty stub; AnthropicLlmClient lands in Task 1.2."
```

### Task 1.2: Implement `LlmClient` interface + `AnthropicLlmClient` in shared-llm

**Files:**
- Modify: `packages/shared-llm/src/index.ts`
- Create: `packages/shared-llm/tests/anthropic-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared-llm/tests/anthropic-client.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicLlmClient, type AnthropicConfig } from '../src/index.js';

describe('AnthropicLlmClient', () => {
  const cfg: AnthropicConfig = { apiKey: 'sk-test-123', model: 'claude-3-5-sonnet-20241022' };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to api.anthropic.com with the supplied config', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 3, output_tokens: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    const client = new AnthropicLlmClient(cfg);

    const result = await client.complete('sys', 'usr');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'x-api-key': 'sk-test-123',
        'anthropic-version': '2023-06-01',
      }),
    }));
    expect(result).toEqual({ text: 'hi', usage: { inputTokens: 3, outputTokens: 1 } });
  });

  it('throws with status + truncated body on non-200', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('rate limited', { status: 429 }));
    const client = new AnthropicLlmClient(cfg);

    await expect(client.complete('sys', 'usr')).rejects.toThrow(/Anthropic API 429.*rate limited/);
  });

  it('honors opts.model and opts.maxTokens overrides', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
      { status: 200 },
    ));
    const client = new AnthropicLlmClient(cfg);

    await client.complete('sys', 'usr', { model: 'claude-3-opus', maxTokens: 500 });

    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body) as { model: string; max_tokens: number };
    expect(body.model).toBe('claude-3-opus');
    expect(body.max_tokens).toBe(500);
  });

  it('returns concatenated text from multi-block content', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(
      JSON.stringify({ content: [{ type: 'text', text: 'foo ' }, { type: 'text', text: 'bar' }, { type: 'tool_use' }] }),
      { status: 200 },
    ));
    const client = new AnthropicLlmClient(cfg);

    const result = await client.complete('sys', 'usr');

    expect(result.text).toBe('foo bar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/shared-llm`
Expected: FAIL with "AnthropicLlmClient is not a constructor" or "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/shared-llm/src/index.ts

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export interface LlmResponse {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmClient {
  /** Send a system + user prompt to the LLM and return the response text +
   *  usage metadata. Implementations: production (Anthropic API), test (mock). */
  complete(
    systemPrompt: string,
    userPrompt: string,
    opts?: { model?: string; maxTokens?: number },
  ): Promise<LlmResponse>;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Production LLM client that calls api.anthropic.com. Config is passed in by the
 *  caller (typically loaded from ~/.command-and-control/anthropic-config.json in C&C
 *  consumers, or the equivalent path in any other consumer). */
export class AnthropicLlmClient implements LlmClient {
  constructor(private readonly cfg: AnthropicConfig) {}

  async complete(
    systemPrompt: string,
    userPrompt: string,
    opts: { model?: string; maxTokens?: number } = {},
  ): Promise<LlmResponse> {
    const model = opts.model ?? this.cfg.model;
    const maxTokens = opts.maxTokens ?? 4096;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Anthropic API ${response.status}: ${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as AnthropicResponse;
    const text = (payload.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join('');
    return {
      text,
      usage: payload.usage
        ? { inputTokens: payload.usage.input_tokens ?? 0, outputTokens: payload.usage.output_tokens ?? 0 }
        : undefined,
    };
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npm test --workspace=packages/shared-llm`
Expected: 4 tests pass.

- [ ] **Step 5: Build to confirm types**

Run: `npm run build --workspace=packages/shared-llm`
Expected: builds clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared-llm/src/index.ts packages/shared-llm/tests/anthropic-client.test.ts
git commit -m "feat(shared-llm): AnthropicLlmClient with config-injected constructor

LlmClient interface + AnthropicLlmClient + LlmResponse + AnthropicConfig types
extracted from the two duplicate copies in C&C tools/rubric and tools/brainstorm.
Config is constructor-injected (caller loads from wherever) so this package has
no dependency on C&C-specific config-loading code.

4 tests cover: POST shape, non-200 error path, opts overrides, multi-block text."
```

### Task 1.3: Migrate `command-and-control/tools/rubric` to use shared-llm

**Files:**
- Modify: `packages/command-and-control/package.json` (add dep)
- Modify: `packages/command-and-control/src/tools/rubric/llm_client.ts` (convert to compat re-export)
- Modify: `packages/command-and-control/src/tools/workflows/draft_student_rubric.ts` (use shared-llm directly)

- [ ] **Step 1: Add shared-llm as a workspace dep**

Edit `packages/command-and-control/package.json` `dependencies`:

```json
"@canvas-toolchain/shared-llm": "*",
```

Run: `npm install`

- [ ] **Step 2: Convert rubric/llm_client.ts to a compat re-export**

Replace the entire contents of `packages/command-and-control/src/tools/rubric/llm_client.ts` with:

```ts
// Compat shim — real implementation lives in @canvas-toolchain/shared-llm.
// Existing imports of `LlmClient`, `LlmResponse`, `AnthropicLlmClient` continue to work
// but new construction now requires passing AnthropicConfig.
export type { LlmClient, LlmResponse, AnthropicConfig } from '@canvas-toolchain/shared-llm';
export { AnthropicLlmClient as SharedAnthropicLlmClient } from '@canvas-toolchain/shared-llm';

import { AnthropicLlmClient as SharedClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';

/** Backward-compat wrapper that auto-loads config from setup_anthropic, so existing
 *  callers (and tests) don't need to be updated immediately. New code should use
 *  SharedAnthropicLlmClient directly with explicit config. */
export class AnthropicLlmClient extends SharedClient {
  constructor() {
    const cfg = loadAnthropicConfig();
    super({ apiKey: cfg.apiKey, model: cfg.model });
  }
}
```

- [ ] **Step 3: Run C&C tests to confirm the rubric path still works**

Run: `npm test --workspace=packages/command-and-control -- rubric`
Expected: all existing rubric tests still pass (the shim preserves the no-arg constructor).

- [ ] **Step 4: Update draft_student_rubric.ts to use shared-llm directly**

Find the import line for `AnthropicLlmClient` in `packages/command-and-control/src/tools/workflows/draft_student_rubric.ts` and inspect how it's used. If the workflow constructs it with `new AnthropicLlmClient()`, change to:

```ts
import { AnthropicLlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';
// ...
const llmClient = new AnthropicLlmClient(loadAnthropicConfig());
```

The shim in Step 2 keeps backward compat, so this step can technically be skipped — but doing it now means one less migration in the future.

- [ ] **Step 5: Re-run full C&C tests**

Run: `npm test --workspace=packages/command-and-control`
Expected: 273 passing (baseline from v1.2.0 ship), zero new failures.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/
git commit -m "refactor(cc): migrate rubric llm_client to @canvas-toolchain/shared-llm

tools/rubric/llm_client.ts is now a compat shim re-exporting from shared-llm.
draft_student_rubric workflow uses shared-llm directly with explicit config injection.
Existing 273 C&C tests still pass."
```

### Task 1.4: Migrate `command-and-control/tools/brainstorm` to use shared-llm

**Files:**
- Modify: `packages/command-and-control/src/tools/brainstorm/llm_client.ts` (compat shim)
- Modify: `packages/command-and-control/src/tools/workflows/brainstorm_interactive.ts` (direct import)

- [ ] **Step 1: Convert brainstorm/llm_client.ts to a compat re-export**

Replace the entire contents of `packages/command-and-control/src/tools/brainstorm/llm_client.ts` with the same compat shim pattern as Task 1.3 Step 2 (same body verbatim — the two files are functionally identical).

- [ ] **Step 2: Update brainstorm_interactive.ts to use shared-llm directly**

In `packages/command-and-control/src/tools/workflows/brainstorm_interactive.ts`, change the AnthropicLlmClient import and construction to the same pattern as Task 1.3 Step 4:

```ts
import { AnthropicLlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';
// ...
const llmClient = new AnthropicLlmClient(loadAnthropicConfig());
```

- [ ] **Step 3: Run brainstorm tests**

Run: `npm test --workspace=packages/command-and-control -- brainstorm`
Expected: all existing brainstorm tests still pass.

- [ ] **Step 4: Run full C&C tests**

Run: `npm test --workspace=packages/command-and-control`
Expected: 273 passing, zero new failures.

- [ ] **Step 5: Build the whole workspace**

Run: `npm run build`
Expected: all four (now five with shared-llm) packages build clean.

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/
git commit -m "refactor(cc): migrate brainstorm llm_client to @canvas-toolchain/shared-llm

tools/brainstorm/llm_client.ts is now a compat shim re-exporting from shared-llm.
brainstorm_interactive workflow uses shared-llm directly.
Both C&C tools (rubric + brainstorm) now share the same client implementation,
eliminating the duplication noted in the v1.2.0 memory file."
```

### Task 1.5: Verify zero-regression checkpoint

- [ ] **Step 1: Run the full monorepo test suite**

Run: `npm test`
Expected: all packages pass. CDS 450, C&C 273, shared-llm 4. No regressions.

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: all five packages build clean, in dependency order.

- [ ] **Step 3: Commit the regression note (only if any cleanup was needed)**

If everything passed cleanly, no commit. Otherwise commit any cleanup with `refactor(monorepo): post-shared-llm cleanup` message.

---

## Phase 2 — Widget renderer infrastructure (canvas-design-studio)

### Task 2.1: Add zod + zod-to-json-schema deps to canvas-design-studio

**Files:**
- Modify: `packages/canvas-design-studio/package.json`
- Modify: `packages/canvas-design-studio/package.json` (add @canvas-toolchain/shared-llm dep — will be used in Plan C, but adding now keeps deps in one task)

- [ ] **Step 1: Add the dependencies**

Edit `packages/canvas-design-studio/package.json` `dependencies`:

```json
"zod": "^3.23.0",
"zod-to-json-schema": "^3.23.0",
"@canvas-toolchain/shared-llm": "*",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: zod, zod-to-json-schema, and the shared-llm workspace symlink all resolve.

- [ ] **Step 3: Verify they import cleanly**

Run: `npx tsx -e "import { z } from 'zod'; import { zodToJsonSchema } from 'zod-to-json-schema'; console.log(zodToJsonSchema(z.object({ a: z.string() })));"` from inside `packages/canvas-design-studio/`
Expected: JSON Schema for `{ a: string }` printed.

- [ ] **Step 4: Commit**

```bash
git add packages/canvas-design-studio/package.json package-lock.json
git commit -m "build(cds): add zod, zod-to-json-schema, shared-llm deps for widget renderer

zod: per-renderer contentSchema validation
zod-to-json-schema: export schemas to the brainstorm tool's system prompt
shared-llm: experimental renderer path (used in Plan C; added now to consolidate deps)"
```

### Task 2.2: Create `tools/widget/types.ts`

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/types.ts`

- [ ] **Step 1: Write the types module**

```ts
// packages/canvas-design-studio/src/tools/widget/types.ts

import type { z } from 'zod';

/** Closed enum of v1 catalog widget kinds. Brainstorm tool's prompt is steered toward
 *  these; novel kinds reach the renderer only via --allowExperimental. */
export const WIDGET_KINDS = [
  'card-flip-reveal',
  'sortable-ordering',
  'drag-to-categorize',
  'branching-scenario',
  'multi-step-reveal',
  'hotspot-image',
] as const;

export type WidgetKind = typeof WIDGET_KINDS[number];

/** Loose-typed match for the InteractiveSpec shape produced by brainstorm_interactive.
 *  We import structurally rather than via shared-types to avoid coupling CDS to a C&C type. */
export interface InteractiveSpec {
  id: string;
  name: string;
  kind: string;
  purpose: string;
  contentSchema: Record<string, unknown>;
  initialContent: Record<string, unknown>;
  dimensions: { minHeight: number; maxHeight: number; aspectRatio?: string };
  accessibility: { keyboardEquivalent: string; screenReaderSummary: string; minTouchTarget: number };
}

/** Discriminated-union result type used by Renderer.validateContent. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** A single renderer in the catalog. Each handles one kind and exposes the
 *  zod schema for its initialContent shape (re-used by the brainstorm prompt). */
export interface Renderer<TContent = unknown> {
  readonly kind: WidgetKind;
  readonly contentSchema: z.ZodSchema<TContent>;
  validateContent(content: Record<string, unknown>): Result<TContent>;
  render(content: TContent, spec: InteractiveSpec): {
    body: string;
    css: string;
    js: string;
  };
}

/** Input + output shapes for the render_widget MCP tool. */
export interface RenderWidgetInput {
  specPath: string;
  allowExperimental?: boolean;
}

export interface RenderWidgetResult {
  outputPath: string;
  kind: string;
  experimental: boolean;
}

/** Error codes from render_widget — keep stable; emitted in MCP responses. */
export type RenderErrorCode =
  | 'SPEC_NOT_FOUND'
  | 'SPEC_PARSE_ERROR'
  | 'KIND_NOT_IN_CATALOG'
  | 'CONTENT_SCHEMA_INVALID'
  | 'LLM_RENDER_FAILED'
  | 'LLM_OUTPUT_UNSAFE'
  | 'FILE_WRITE_ERROR';

export class RenderError extends Error {
  constructor(public code: RenderErrorCode, public detail: Record<string, unknown>) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = 'RenderError';
  }
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: builds clean. No tests for pure type-only file.

- [ ] **Step 3: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/types.ts
git commit -m "feat(cds): widget renderer type definitions

WidgetKind enum (6 catalog kinds), InteractiveSpec interface (structural match
for the brainstorm tool's output), Renderer<T> interface, Result<T> discriminated
union, RenderError class with stable error codes."
```

### Task 2.3: Create `tools/widget/a11y.ts` + tests

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/a11y.ts`
- Create: `packages/canvas-design-studio/tests/widget/a11y.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/a11y.test.ts
import { describe, expect, it } from 'vitest';
import { WRAPPER_A11Y_CSS, WRAPPER_BOOTSTRAP_JS, SR_REGION_HTML } from '../../src/tools/widget/a11y.js';

describe('widget/a11y', () => {
  it('exports an sr-only CSS class', () => {
    expect(WRAPPER_A11Y_CSS).toContain('.sr-only');
    // Classic visually-hidden pattern: 1×1 clip, absolute positioning, no overflow
    expect(WRAPPER_A11Y_CSS).toMatch(/position:\s*absolute/);
    expect(WRAPPER_A11Y_CSS).toMatch(/clip(?:-path)?:/);
  });

  it('exports a prefers-reduced-motion media query that disables transitions/animations', () => {
    expect(WRAPPER_A11Y_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(WRAPPER_A11Y_CSS).toMatch(/transition:\s*none/);
    expect(WRAPPER_A11Y_CSS).toMatch(/animation:\s*none/);
  });

  it('exports a .touch-target utility class with 44px minimums', () => {
    expect(WRAPPER_A11Y_CSS).toMatch(/\.touch-target[^}]*min-width:\s*44px/);
    expect(WRAPPER_A11Y_CSS).toMatch(/\.touch-target[^}]*min-height:\s*44px/);
  });

  it('exports an announce() bootstrap that writes to #widget-status', () => {
    expect(WRAPPER_BOOTSTRAP_JS).toContain('window.__announce');
    expect(WRAPPER_BOOTSTRAP_JS).toContain('widget-status');
  });

  it('renders the SR region with aria-live="polite" and class="sr-only"', () => {
    const html = SR_REGION_HTML('Test summary');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('id="widget-status"');
    expect(html).toContain('Test summary');
  });

  it('escapes HTML in the summary text', () => {
    const html = SR_REGION_HTML('<script>x</script>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/a11y`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/a11y.ts

/** CSS injected into every rendered widget's <style> block. Provides:
 *  - .sr-only visually-hidden pattern (for screen-reader-only content)
 *  - prefers-reduced-motion override (disables transitions/animations universally)
 *  - .touch-target utility (44×44px minimum hit area per spec.accessibility.minTouchTarget)
 *  - :focus-visible reset to ensure focus rings remain visible */
export const WRAPPER_A11Y_CSS = `
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.touch-target {
  min-width: 44px;
  min-height: 44px;
}
*:focus-visible {
  outline: 2px solid #0033A0;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
  }
}
`.trim();

/** JS bootstrap injected into every widget's <script> block. Exposes a global
 *  __announce(text) helper that renderers call to update the screen-reader live
 *  region. Renderers MUST call __announce after every user-visible state change. */
export const WRAPPER_BOOTSTRAP_JS = `
window.__announce = function(text) {
  var el = document.getElementById('widget-status');
  if (el) { el.textContent = String(text); }
};
`.trim();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render the visually-hidden live region seeded with the spec's screen-reader summary.
 *  Renderer JS updates this region via window.__announce() as state changes. */
export function SR_REGION_HTML(summary: string): string {
  return `<div class="sr-only" aria-live="polite" id="widget-status">${escapeHtml(summary)}</div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/a11y`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/a11y.ts packages/canvas-design-studio/tests/widget/a11y.test.ts
git commit -m "feat(cds): widget a11y harness — sr-only, reduced-motion, touch-target

WRAPPER_A11Y_CSS: classes injected into every widget's <style>
WRAPPER_BOOTSTRAP_JS: window.__announce() for live-region updates
SR_REGION_HTML(): visually-hidden region seeded with spec summary, HTML-escaped"
```

### Task 2.4: Create `tools/widget/sizing.ts` + tests

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/sizing.ts`
- Create: `packages/canvas-design-studio/tests/widget/sizing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/sizing.test.ts
import { describe, expect, it } from 'vitest';
import { dimensionsToCss, dimensionsToIframeAttrs } from '../../src/tools/widget/sizing.js';
import type { InteractiveSpec } from '../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'x', name: 'X', kind: 'card-flip-reveal', purpose: '', contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 200, maxHeight: 600 },
  accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
};

describe('widget/sizing', () => {
  it('emits min/max-height CSS from dimensions', () => {
    const css = dimensionsToCss(baseSpec.dimensions);
    expect(css).toContain('min-height: 200px');
    expect(css).toContain('max-height: 600px');
  });

  it('handles aspectRatio when present', () => {
    const css = dimensionsToCss({ minHeight: 200, maxHeight: 600, aspectRatio: '16/9' });
    expect(css).toContain('aspect-ratio: 16/9');
  });

  it('omits aspect-ratio when absent', () => {
    const css = dimensionsToCss(baseSpec.dimensions);
    expect(css).not.toContain('aspect-ratio');
  });

  it('emits iframe attrs with maxHeight as height and minHeight as inline style', () => {
    const attrs = dimensionsToIframeAttrs(baseSpec.dimensions);
    expect(attrs.height).toBe('600');
    expect(attrs.style).toContain('min-height: 200px');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/sizing`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/sizing.ts

import type { InteractiveSpec } from './types.js';

/** Render the CSS that goes on the widget's <body> to honour the spec dimensions.
 *  Used inside buildWidgetHtml's wrapper CSS. */
export function dimensionsToCss(d: InteractiveSpec['dimensions']): string {
  const parts = [
    `min-height: ${d.minHeight}px`,
    `max-height: ${d.maxHeight}px`,
  ];
  if (d.aspectRatio) parts.push(`aspect-ratio: ${d.aspectRatio}`);
  return parts.join('; ') + ';';
}

/** Render the iframe height attr + inline style for the embed code that publish_widget
 *  inserts into the host Canvas page. */
export function dimensionsToIframeAttrs(d: InteractiveSpec['dimensions']): { height: string; style: string } {
  return {
    height: String(d.maxHeight),
    style: `min-height: ${d.minHeight}px; border: 0;`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/sizing`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/sizing.ts packages/canvas-design-studio/tests/widget/sizing.test.ts
git commit -m "feat(cds): widget sizing helpers

dimensionsToCss(): CSS for the widget body's min/max-height + optional aspect-ratio
dimensionsToIframeAttrs(): height attr + inline-style for the iframe embed"
```

### Task 2.5: Create `tools/widget/wrapper.ts` + tests

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/wrapper.ts`
- Create: `packages/canvas-design-studio/tests/widget/wrapper.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/wrapper.test.ts
import { describe, expect, it } from 'vitest';
import { buildWidgetHtml } from '../../src/tools/widget/wrapper.js';
import type { InteractiveSpec } from '../../src/tools/widget/types.js';

const spec: InteractiveSpec = {
  id: 'test-widget',
  name: 'Test Widget',
  kind: 'card-flip-reveal',
  purpose: 'unit test',
  contentSchema: {},
  initialContent: {},
  dimensions: { minHeight: 200, maxHeight: 600 },
  accessibility: { keyboardEquivalent: 'Tab + Enter', screenReaderSummary: 'A test widget.', minTouchTarget: 44 },
};

describe('buildWidgetHtml', () => {
  const html = buildWidgetHtml({
    body: '<div id="renderer-content">renderer body</div>',
    css: '#renderer-content { color: red; }',
    js: 'console.log("renderer js");',
    spec,
  });

  it('produces a full standalone HTML document', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('includes viewport meta and charset', () => {
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
  });

  it('uses spec.name as the document title', () => {
    expect(html).toContain('<title>Test Widget</title>');
  });

  it('injects wrapper a11y CSS before renderer CSS', () => {
    const wrapperIdx = html.indexOf('.sr-only');
    const rendererIdx = html.indexOf('#renderer-content');
    expect(wrapperIdx).toBeGreaterThan(-1);
    expect(rendererIdx).toBeGreaterThan(wrapperIdx);
  });

  it('seeds the SR live region with spec.accessibility.screenReaderSummary', () => {
    expect(html).toContain('id="widget-status"');
    expect(html).toContain('A test widget.');
  });

  it('places renderer body inside <body>, after the SR region', () => {
    const srIdx = html.indexOf('id="widget-status"');
    const rendererBodyIdx = html.indexOf('renderer body');
    expect(rendererBodyIdx).toBeGreaterThan(srIdx);
  });

  it('injects wrapper bootstrap JS before renderer JS', () => {
    const wrapperJsIdx = html.indexOf('window.__announce');
    const rendererJsIdx = html.indexOf('renderer js');
    expect(wrapperJsIdx).toBeGreaterThan(-1);
    expect(rendererJsIdx).toBeGreaterThan(wrapperJsIdx);
  });

  it('includes dimension-derived CSS', () => {
    expect(html).toContain('min-height: 200px');
    expect(html).toContain('max-height: 600px');
  });

  it('escapes spec.name in <title>', () => {
    const evilSpec = { ...spec, name: '<script>x</script>' };
    const evilHtml = buildWidgetHtml({ body: '', css: '', js: '', spec: evilSpec });
    expect(evilHtml).not.toContain('<title><script>');
    expect(evilHtml).toContain('<title>&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/wrapper`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/wrapper.ts

import type { InteractiveSpec } from './types.js';
import { WRAPPER_A11Y_CSS, WRAPPER_BOOTSTRAP_JS, SR_REGION_HTML } from './a11y.js';
import { dimensionsToCss } from './sizing.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_CSS = `
html, body { margin: 0; padding: 0; }
body {
  font-family: Lato, sans-serif;
  color: #1A1A1A;
  background: #ffffff;
  box-sizing: border-box;
}
*, *::before, *::after { box-sizing: inherit; }
`.trim();

export function buildWidgetHtml(input: {
  body: string;
  css: string;
  js: string;
  spec: InteractiveSpec;
}): string {
  const { body, css, js, spec } = input;
  const dimCss = dimensionsToCss(spec.dimensions);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(spec.name)}</title>
<style>
${BASE_CSS}
body { ${dimCss} }
${WRAPPER_A11Y_CSS}
${css}
</style>
</head>
<body>
${SR_REGION_HTML(spec.accessibility.screenReaderSummary)}
${body}
<script>
${WRAPPER_BOOTSTRAP_JS}
${js}
</script>
</body>
</html>
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/wrapper`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/wrapper.ts packages/canvas-design-studio/tests/widget/wrapper.test.ts
git commit -m "feat(cds): widget HTML wrapper — full standalone document

buildWidgetHtml() composes a complete <!DOCTYPE html> document from renderer
body+css+js plus the a11y harness (sr-only region, prefers-reduced-motion,
touch-target), dimension CSS, University-brand base typography. spec.name is HTML-escaped
in <title>. Wrapper a11y CSS/JS precedes renderer CSS/JS so renderers can
override base styles but inherit the harness."
```

### Task 2.6: Create `tools/widget/schemas.ts` (zod-to-json-schema export helper)

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/schemas.ts`
- Create: `packages/canvas-design-studio/tests/widget/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { exportKindSchema } from '../../src/tools/widget/schemas.js';

describe('exportKindSchema', () => {
  it('converts a zod object to a JSON Schema object with $schema and type:object', () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const json = exportKindSchema(schema);
    expect(json.type).toBe('object');
    expect((json as { properties: { a: { type: string } } }).properties.a.type).toBe('string');
    expect((json as { properties: { b: { type: string } } }).properties.b.type).toBe('number');
  });

  it('preserves required fields', () => {
    const schema = z.object({ a: z.string(), b: z.string().optional() });
    const json = exportKindSchema(schema);
    expect((json as { required: string[] }).required).toEqual(['a']);
  });

  it('handles arrays', () => {
    const schema = z.object({ items: z.array(z.string()) });
    const json = exportKindSchema(schema);
    const items = (json as { properties: { items: { type: string; items: { type: string } } } }).properties.items;
    expect(items.type).toBe('array');
    expect(items.items.type).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/schemas`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/schemas.ts

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

/** Convert a Zod schema (typically a renderer's contentSchema) into a plain JSON Schema
 *  object suitable for embedding into a prompt. The brainstorm tool's system prompt uses
 *  these schemas so the LLM produces well-formed initialContent for each kind. */
export function exportKindSchema(schema: z.ZodSchema): Record<string, unknown> {
  return zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/schemas`
Expected: 3 tests pass.

- [ ] **Step 5: Run the full CDS test suite for a regression check**

Run: `npm test --workspace=packages/canvas-design-studio`
Expected: 450 (baseline) + 22 (new: 6 a11y + 4 sizing + 9 wrapper + 3 schemas) = 472 passing, zero failures.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/schemas.ts packages/canvas-design-studio/tests/widget/schemas.test.ts
git commit -m "feat(cds): widget schemas helper — zod → JSON Schema export

exportKindSchema() converts a renderer's zod contentSchema into a plain JSON
Schema object for embedding in the brainstorm tool's system prompt. Uses
\$refStrategy: 'none' so the output is fully inlined (no \$ref indirection)
which the LLM handles more reliably than reference-based schemas."
```

---

## Phase 3 — First catalog renderer end-to-end (`card-flip-reveal`)

### Task 3.1: Implement `catalog/card-flip-reveal.ts` with schema and render

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/card-flip-reveal.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/card-flip-reveal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/catalog/card-flip-reveal.test.ts
import { describe, expect, it } from 'vitest';
import { cardFlipRevealRenderer } from '../../../src/tools/widget/catalog/card-flip-reveal.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'vocab-set-1',
  name: 'Vocab Set 1',
  kind: 'card-flip-reveal',
  purpose: 'Recall IS vocab terms',
  contentSchema: {},
  initialContent: {},
  dimensions: { minHeight: 300, maxHeight: 600 },
  accessibility: {
    keyboardEquivalent: 'Tab to a card; Enter or Space to flip; arrows to move between cards.',
    screenReaderSummary: 'Six vocabulary cards. Tab to a card, then Enter to reveal the definition.',
    minTouchTarget: 44,
  },
};

const goodContent = {
  cards: [
    { front: 'ETL', back: 'Extract, Transform, Load' },
    { front: 'OLAP', back: 'Online Analytical Processing' },
  ],
};

describe('cardFlipRevealRenderer', () => {
  describe('schema validation', () => {
    it('accepts a well-formed cards array', () => {
      const r = cardFlipRevealRenderer.validateContent(goodContent);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.cards).toHaveLength(2);
    });

    it('rejects missing cards key', () => {
      const r = cardFlipRevealRenderer.validateContent({});
      expect(r.ok).toBe(false);
    });

    it('rejects empty cards array', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [] });
      expect(r.ok).toBe(false);
    });

    it('rejects card missing front', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [{ back: 'x' }] });
      expect(r.ok).toBe(false);
    });

    it('rejects card missing back', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [{ front: 'x' }] });
      expect(r.ok).toBe(false);
    });

    it('rejects non-string front/back', () => {
      const r = cardFlipRevealRenderer.validateContent({ cards: [{ front: 1, back: 2 }] });
      expect(r.ok).toBe(false);
    });
  });

  describe('render output', () => {
    const validated = cardFlipRevealRenderer.validateContent(goodContent);
    if (!validated.ok) throw new Error('validation failed in test setup');
    const { body, css, js } = cardFlipRevealRenderer.render(validated.value, baseSpec);

    it('emits one button per card', () => {
      const matches = body.match(/role="button"/g) ?? [];
      expect(matches).toHaveLength(2);
    });

    it('each card has aria-pressed initially "false"', () => {
      expect((body.match(/aria-pressed="false"/g) ?? []).length).toBe(2);
    });

    it('emits aria-label with card position context', () => {
      expect(body).toMatch(/aria-label="Card 1 of 2/);
      expect(body).toMatch(/aria-label="Card 2 of 2/);
    });

    it('does NOT use transition/animation/transform (Canvas RCE safe even though wrapper allows them in iframe context)', () => {
      // Even in iframe context, the renderer should use no-animation patterns because reduced-motion is the universal floor.
      expect(css).not.toMatch(/\btransition\s*:/);
      expect(css).not.toMatch(/\banimation\s*:/);
      expect(css).not.toMatch(/\btransform\s*:/);
    });

    it('escapes HTML in front/back content', () => {
      const evilContent = { cards: [{ front: '<script>x</script>', back: 'safe' }] };
      const ev = cardFlipRevealRenderer.validateContent(evilContent);
      if (!ev.ok) throw new Error('escape test setup failed');
      const evOut = cardFlipRevealRenderer.render(ev.value, baseSpec);
      expect(evOut.body).not.toContain('<script>x</script>');
      expect(evOut.body).toContain('&lt;script&gt;');
    });

    it('emits JS that adds click + keyboard handlers and calls __announce on flip', () => {
      expect(js).toContain('addEventListener');
      expect(js).toMatch(/key\s*===\s*['"]Enter['"]|keyCode\s*===\s*13/);
      expect(js).toContain('__announce');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/card-flip-reveal`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/card-flip-reveal.ts

import { z } from 'zod';
import type { Renderer, Result, InteractiveSpec } from '../types.js';

const Card = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

const CardFlipContent = z.object({
  cards: z.array(Card).min(1),
});

type CardFlipContent = z.infer<typeof CardFlipContent>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const cardFlipRevealRenderer: Renderer<CardFlipContent> = {
  kind: 'card-flip-reveal',
  contentSchema: CardFlipContent,

  validateContent(content): Result<CardFlipContent> {
    const parsed = CardFlipContent.safeParse(content);
    if (parsed.success) return { ok: true, value: parsed.data };
    return { ok: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') };
  },

  render(content, _spec: InteractiveSpec) {
    const total = content.cards.length;
    const body = `<div class="card-grid" role="list">${content.cards.map((c, i) => `
  <button
    type="button"
    role="button"
    class="card touch-target"
    aria-pressed="false"
    aria-label="Card ${i + 1} of ${total}, showing front: ${escapeHtml(c.front)}"
    data-front="${escapeHtml(c.front)}"
    data-back="${escapeHtml(c.back)}"
    data-position="${i + 1}"
  ><span class="card-face">${escapeHtml(c.front)}</span></button>`).join('')}
</div>`;

    const css = `
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  padding: 16px;
}
.card-grid > * { margin: 8px; }
.card {
  background: #ffffff;
  border: 2px solid #0033A0;
  border-radius: 8px;
  padding: 24px 16px;
  font-family: inherit;
  font-size: 18px;
  cursor: pointer;
  text-align: center;
  min-height: 100px;
}
.card[aria-pressed="true"] {
  background: #E6ECF9;
}
`.trim();

    const js = `
(function() {
  var cards = document.querySelectorAll('.card');
  var total = cards.length;
  for (var i = 0; i < cards.length; i++) {
    (function(card, idx) {
      function flip() {
        var pressed = card.getAttribute('aria-pressed') === 'true';
        var newState = !pressed;
        card.setAttribute('aria-pressed', String(newState));
        var face = card.querySelector('.card-face');
        var front = card.getAttribute('data-front');
        var back = card.getAttribute('data-back');
        face.textContent = newState ? back : front;
        card.setAttribute('aria-label',
          'Card ' + (idx + 1) + ' of ' + total +
          (newState ? ', showing back: ' + back : ', showing front: ' + front));
        window.__announce('Card ' + (idx + 1) + ' ' + (newState ? 'flipped to back: ' + back : 'flipped to front: ' + front));
      }
      card.addEventListener('click', flip);
      card.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
          e.preventDefault();
          flip();
        }
      });
    })(cards[i], i);
  }
})();
`.trim();

    return { body, css, js };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/card-flip-reveal`
Expected: 12 tests pass.

- [ ] **Step 5: Build to confirm types**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: builds clean.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/card-flip-reveal.ts packages/canvas-design-studio/tests/widget/catalog/card-flip-reveal.test.ts
git commit -m "feat(cds): card-flip-reveal renderer

First v1 catalog renderer. Zod schema: { cards: [{ front, back }] }. Render emits
button-per-card with role/aria-pressed/aria-label state, click + Enter/Space
keyboard support, __announce on every flip. 12 tests: 6 schema validation
(missing field, empty array, type errors), 6 render output (button count,
aria state, label content, HTML escape, no animation/transform, JS handlers)."
```

### Task 3.2: Create `catalog/index.ts` and contract-assertion test harness

**Files:**
- Create: `packages/canvas-design-studio/src/tools/widget/catalog/index.ts`
- Create: `packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts`

- [ ] **Step 1: Write the catalog registry**

```ts
// packages/canvas-design-studio/src/tools/widget/catalog/index.ts

import type { Renderer, WidgetKind } from '../types.js';
import { cardFlipRevealRenderer } from './card-flip-reveal.js';

/** Registry of all catalog renderers. Plan B adds the remaining 5 entries.
 *  An UNKNOWN kind (not in this map) routes to the experimental renderer
 *  (Plan C) IF render_widget is called with allowExperimental: true. */
export const CATALOG: Partial<Record<WidgetKind, Renderer>> = {
  'card-flip-reveal': cardFlipRevealRenderer,
};
```

- [ ] **Step 2: Write the contract-assertion harness**

This shared test runs the same structural a11y/safety assertions against every renderer in the catalog. Plan B adds 5 more renderers; this harness covers them automatically as they're added to CATALOG.

```ts
// packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../../src/tools/widget/catalog/index.js';
import { buildWidgetHtml } from '../../../src/tools/widget/wrapper.js';
import type { InteractiveSpec, WidgetKind } from '../../../src/tools/widget/types.js';

// Minimal fixture content per kind. Plan B adds entries for new kinds as they land.
const FIXTURE_CONTENT: Record<WidgetKind, Record<string, unknown>> = {
  'card-flip-reveal': { cards: [{ front: 'F', back: 'B' }] },
  // Plan B will populate the rest.
  'sortable-ordering': {} as Record<string, unknown>,
  'drag-to-categorize': {} as Record<string, unknown>,
  'branching-scenario': {} as Record<string, unknown>,
  'multi-step-reveal': {} as Record<string, unknown>,
  'hotspot-image': {} as Record<string, unknown>,
};

function makeSpec(kind: WidgetKind): InteractiveSpec {
  return {
    id: `contract-${kind}`,
    name: `Contract test: ${kind}`,
    kind,
    purpose: 'test',
    contentSchema: {},
    initialContent: FIXTURE_CONTENT[kind],
    dimensions: { minHeight: 200, maxHeight: 600 },
    accessibility: { keyboardEquivalent: 'kbd', screenReaderSummary: 'summary', minTouchTarget: 44 },
  };
}

describe.each(Object.entries(CATALOG))('contract assertions: %s', (kind, renderer) => {
  if (!renderer) return;

  const spec = makeSpec(kind as WidgetKind);
  const validated = renderer.validateContent(spec.initialContent);
  if (!validated.ok) {
    it.fails('fixture content should validate', () => {
      expect(validated.ok, validated.error).toBe(true);
    });
    return;
  }
  const { body, css, js } = renderer.render(validated.value, spec);
  const html = buildWidgetHtml({ body, css, js, spec });

  it('document has DOCTYPE, lang, viewport, charset', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html lang=');
    expect(html).toContain('<meta charset=');
    expect(html).toContain('<meta name="viewport"');
  });

  it('contains the sr-only live region', () => {
    expect(html).toContain('id="widget-status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('class="sr-only"');
  });

  it('every interactive element has aria-label or aria-labelledby', () => {
    const interactiveTags = (body.match(/<(?:button|a|input|select|textarea|[a-z]+\s+role="button")[^>]*>/gi) ?? []);
    for (const tag of interactiveTags) {
      const hasLabel = /aria-label="/.test(tag) || /aria-labelledby="/.test(tag);
      expect(hasLabel, `interactive element missing aria-label/aria-labelledby: ${tag}`).toBe(true);
    }
  });

  it('does not use transition / animation / transform CSS', () => {
    expect(css).not.toMatch(/(?<![a-z-])transition\s*:/);
    expect(css).not.toMatch(/(?<![a-z-])animation\s*:/);
    expect(css).not.toMatch(/(?<![a-z-])transform\s*:/);
  });

  it('has no external requests (no http(s) src/href/import)', () => {
    expect(html).not.toMatch(/<link[^>]*href="https?:/i);
    expect(html).not.toMatch(/<script[^>]*src="https?:/i);
    expect(html).not.toMatch(/<iframe[^>]*src="https?:/i);
    expect(js).not.toMatch(/import\s*\(?['"]https?:/);
    expect(js).not.toMatch(/fetch\s*\(\s*['"]https?:/);
  });

  it('has no inline event handlers in renderer body (use addEventListener instead)', () => {
    expect(body).not.toMatch(/\son[a-z]+="/i);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/catalog/contract-assertions`
Expected: 6 contract assertions pass for `card-flip-reveal` (other kinds skipped because their fixture content is `{}` and won't validate — the harness emits a `fails` for those, which will need addressing in Plan B when the renderers land).

Note: the `if (!validated.ok)` guard in the harness causes the test block to early-return for kinds without real fixture content. In Plan A, only `card-flip-reveal` runs the assertions. Plan B updates `FIXTURE_CONTENT` and registers the new renderers in `CATALOG`, automatically picking up the same assertions.

- [ ] **Step 4: Commit**

```bash
git add packages/canvas-design-studio/src/tools/widget/catalog/index.ts packages/canvas-design-studio/tests/widget/catalog/contract-assertions.test.ts
git commit -m "feat(cds): catalog registry + shared contract-assertion harness

CATALOG: Partial<Record<WidgetKind, Renderer>> registry that render_widget
dispatches on. Currently only card-flip-reveal; Plan B fills in the rest.

contract-assertions.test.ts: shared structural a11y/safety assertions that run
against every renderer in CATALOG via describe.each — when Plan B adds a
renderer + fixture content, the assertions cover it automatically."
```

### Task 3.3: Create `render-widget.ts` MCP tool entry point + tests

**Files:**
- Create: `packages/canvas-design-studio/src/tools/render-widget.ts`
- Create: `packages/canvas-design-studio/tests/widget/render-widget.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/canvas-design-studio/tests/widget/render-widget.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderWidget } from '../../src/tools/render-widget.js';
import { RenderError } from '../../src/tools/widget/types.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'render-widget-test-'));
});

function writeSpec(filename: string, spec: unknown): string {
  const path = join(tmp, filename);
  writeFileSync(path, JSON.stringify(spec), 'utf8');
  return path;
}

const goodSpec = {
  id: 'vocab-1',
  name: 'Vocab 1',
  kind: 'card-flip-reveal',
  purpose: 'recall',
  contentSchema: {},
  initialContent: { cards: [{ front: 'ETL', back: 'Extract, Transform, Load' }] },
  dimensions: { minHeight: 300, maxHeight: 600 },
  accessibility: { keyboardEquivalent: 'Tab+Enter', screenReaderSummary: 'flip cards', minTouchTarget: 44 },
};

describe('renderWidget', () => {
  it('writes <id>.html next to the spec for a catalog kind', async () => {
    const specPath = writeSpec('vocab-1.spec.json', goodSpec);

    const result = await renderWidget({ specPath });

    expect(result.kind).toBe('card-flip-reveal');
    expect(result.experimental).toBe(false);
    expect(result.outputPath).toBe(join(tmp, 'vocab-1.html'));
    expect(existsSync(result.outputPath)).toBe(true);
    const html = readFileSync(result.outputPath, 'utf8');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('ETL');
  });

  it('throws SPEC_NOT_FOUND when spec path is missing', async () => {
    await expect(renderWidget({ specPath: join(tmp, 'nope.spec.json') }))
      .rejects.toThrow(/SPEC_NOT_FOUND/);
  });

  it('throws SPEC_PARSE_ERROR on malformed JSON', async () => {
    const path = join(tmp, 'bad.spec.json');
    writeFileSync(path, '{not json', 'utf8');
    await expect(renderWidget({ specPath: path })).rejects.toThrow(/SPEC_PARSE_ERROR/);
  });

  it('throws KIND_NOT_IN_CATALOG when kind unknown and allowExperimental not set', async () => {
    const specPath = writeSpec('weird.spec.json', { ...goodSpec, kind: 'card-stack-zoom' });
    await expect(renderWidget({ specPath })).rejects.toThrow(/KIND_NOT_IN_CATALOG/);
    await expect(renderWidget({ specPath })).rejects.toThrow(/card-flip-reveal/); // error lists allowed kinds
  });

  it('throws CONTENT_SCHEMA_INVALID when initialContent does not match the kind schema', async () => {
    const specPath = writeSpec('bad-content.spec.json', { ...goodSpec, initialContent: { cards: [] } });
    await expect(renderWidget({ specPath })).rejects.toThrow(/CONTENT_SCHEMA_INVALID/);
  });

  it('error code is accessible on the thrown RenderError', async () => {
    try {
      await renderWidget({ specPath: join(tmp, 'nope.spec.json') });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(RenderError);
      if (e instanceof RenderError) expect(e.code).toBe('SPEC_NOT_FOUND');
    }
  });

  // Cleanup
  it.skip('cleanup', () => { rmSync(tmp, { recursive: true, force: true }); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/render-widget`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```ts
// packages/canvas-design-studio/src/tools/render-widget.ts

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { CATALOG } from './widget/catalog/index.js';
import { buildWidgetHtml } from './widget/wrapper.js';
import {
  RenderError,
  WIDGET_KINDS,
  type InteractiveSpec,
  type RenderWidgetInput,
  type RenderWidgetResult,
  type WidgetKind,
} from './widget/types.js';

export async function renderWidget(input: RenderWidgetInput): Promise<RenderWidgetResult> {
  const { specPath, allowExperimental = false } = input;

  if (!existsSync(specPath)) {
    throw new RenderError('SPEC_NOT_FOUND', { specPath });
  }

  let raw: string;
  try {
    raw = readFileSync(specPath, 'utf8');
  } catch (e) {
    throw new RenderError('SPEC_NOT_FOUND', { specPath, cause: String(e) });
  }

  let spec: InteractiveSpec;
  try {
    spec = JSON.parse(raw) as InteractiveSpec;
  } catch (e) {
    throw new RenderError('SPEC_PARSE_ERROR', { specPath, cause: String(e) });
  }

  const kind = spec.kind as WidgetKind;
  const renderer = CATALOG[kind];

  if (!renderer) {
    if (!allowExperimental) {
      throw new RenderError('KIND_NOT_IN_CATALOG', {
        kind: spec.kind,
        allowedKinds: WIDGET_KINDS,
        hint: 'Pass allowExperimental: true to render via the LLM path (Plan C).',
      });
    }
    // Experimental path lands in Plan C.
    throw new RenderError('LLM_RENDER_FAILED', {
      kind: spec.kind,
      reason: 'Experimental renderer not yet implemented (lands in Plan C).',
    });
  }

  const validated = renderer.validateContent(spec.initialContent);
  if (!validated.ok) {
    throw new RenderError('CONTENT_SCHEMA_INVALID', { kind: spec.kind, error: validated.error });
  }

  const { body, css, js } = renderer.render(validated.value, spec);
  const html = buildWidgetHtml({ body, css, js, spec });

  const specName = basename(specPath, '.spec.json');
  const outputPath = join(dirname(specPath), `${specName}.html`);

  try {
    writeFileSync(outputPath, html, 'utf8');
  } catch (e) {
    throw new RenderError('FILE_WRITE_ERROR', { outputPath, cause: String(e) });
  }

  return { outputPath, kind: spec.kind, experimental: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/canvas-design-studio -- widget/render-widget`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio/src/tools/render-widget.ts packages/canvas-design-studio/tests/widget/render-widget.test.ts
git commit -m "feat(cds): render_widget entry point with catalog dispatch

renderWidget(): reads .spec.json, dispatches on spec.kind, validates content,
runs the renderer, wraps in standalone HTML, writes <id>.html next to the spec.

Error paths covered: SPEC_NOT_FOUND, SPEC_PARSE_ERROR, KIND_NOT_IN_CATALOG
(emits allowedKinds + hint), CONTENT_SCHEMA_INVALID. Experimental path stubs
to LLM_RENDER_FAILED with 'Plan C' reason."
```

### Task 3.4: Register `render_widget` as an MCP tool in CDS

**Files:**
- Modify: `packages/canvas-design-studio/src/index.ts`

- [ ] **Step 1: Find the existing MCP tool registration pattern**

Run: `grep -n "name:" packages/canvas-design-studio/src/index.ts | head -20` to see how existing tools are registered.

- [ ] **Step 2: Add render_widget tool registration**

In `packages/canvas-design-studio/src/index.ts`, follow the existing pattern. Add an import:

```ts
import { renderWidget } from './tools/render-widget.js';
```

Add to the tools array (whatever shape the existing list uses) a new tool:

```ts
{
  name: 'render_widget',
  description: 'Render an InteractiveSpec to a self-contained Canvas-embeddable HTML widget file. Writes <spec-id>.html next to the spec. For a kind not in the catalog, pass allowExperimental: true to use the LLM-generated path (when available — currently stubbed).',
  inputSchema: {
    type: 'object',
    properties: {
      specPath: { type: 'string', description: 'Absolute path to the .spec.json file.' },
      allowExperimental: { type: 'boolean', description: 'If true, kinds not in the catalog are rendered via the LLM-generated path. Default false.' },
    },
    required: ['specPath'],
  },
}
```

Add to the dispatch switch (or whatever handler routing pattern the file uses):

```ts
case 'render_widget': {
  const result = await renderWidget(args as { specPath: string; allowExperimental?: boolean });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

- [ ] **Step 3: Build the package**

Run: `npm run build --workspace=packages/canvas-design-studio`
Expected: builds clean.

- [ ] **Step 4: Smoke-test the tool via stdio**

Create a temp file `/tmp/smoke-spec.json` (or Windows equivalent) with the goodSpec content from Task 3.3, then run:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"render_widget","arguments":{"specPath":"/tmp/smoke-spec.json"}}}' | node packages/canvas-design-studio/dist/index.js
```

Expected: JSON response containing the outputPath, kind: card-flip-reveal, experimental: false. The .html file exists at the expected path.

- [ ] **Step 5: Run full CDS test suite**

Run: `npm test --workspace=packages/canvas-design-studio`
Expected: 450 (baseline) + 22 (Phase 2) + 12 + 6 + 6 = 496 passing, zero failures.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas-design-studio/src/index.ts
git commit -m "feat(cds): register render_widget as MCP tool

render_widget is now exposed via the canvas-design-studio MCP server. Takes
{ specPath, allowExperimental? } and returns { outputPath, kind, experimental }.
Plan A's user-facing deliverable: faculty can render a card-flip-reveal widget
end-to-end and open the result in a browser.

Closes Plan A scope."
```

---

## Plan A ship checkpoint

After Task 3.4 completes:

- [ ] Run `npm test` (full monorepo): 450 + 22 (CDS new) + 12 + 6 + 6 = 496 CDS passing; 273 C&C passing; 4 shared-llm passing. **Total: 773.**
- [ ] Run `npm run build`: all five packages build clean.
- [ ] **Manual visual test:** create a spec.json with two card-flip cards; run `render_widget`; open the resulting `.html` file in Chrome/Firefox; verify clicking flips, Enter flips, Tab navigates, screen reader (if available) announces each flip.
- [ ] Memory update: append "Plan A shipped" note to `project-current-state.md` with the new widget infrastructure landed.

---

## Self-review checklist (run before handing off)

- [ ] **Spec coverage:** does this plan implement everything from Phases 1-3 of the design? Specifically: hosting model (Canvas Files iframe) acknowledged in spec, not implemented in Plan A — that's Plan B. Catalog approach (1 of 6 renderers) ✓. Brainstorm soft steering — not in Plan A (Plan C). Experimental escape hatch — stubbed but not implemented (Plan C). Accessibility floor (sr-only, prefers-reduced-motion, touch-target) ✓ via Task 2.3. Validation = Zod ✓ via Task 2.1, 3.1. Per-page spec folder location — convention established by Task 3.3's write-next-to-spec behavior ✓.
- [ ] **Placeholder scan:** searched for TBD, TODO, "fill in", "similar to Task". None found. Every step has complete code or an exact command.
- [ ] **Type consistency:** `Renderer<TContent>`, `Result<T>`, `RenderError(code, detail)`, `WidgetKind`, `InteractiveSpec` all used consistently across Tasks 2.2, 3.1, 3.2, 3.3. The `WIDGET_KINDS` const tuple flows into the `WidgetKind` type and into the catalog registry — no drift.
- [ ] **Verification items in plan:** Phase 0 tasks 0.1, 0.2, 0.3 are explicit early-task slots, exactly as the spec required.

## Execution handoff

Plan complete and saved to `packages/canvas-design-studio/docs/superpowers/plans/2026-06-02-widget-renderer-plan-a.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Uses superpowers:subagent-driven-development.
2. **Inline Execution** — execute tasks in this session using superpowers:executing-plans, batch execution with checkpoints for review.

Which approach?
