# Plug-in Module Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Panopto into a standalone, config-time-enabled `module-video` package behind a `VideoProvider` adapter, loaded by a new C&C module registry — proving the v2.0 plug-in contract on one real module.

**Architecture:** Two new packages — `@canvas-toolchain/module-contract` (the `CanvasToolchainModule`/`ModuleTool` interfaces + manifest types) and `@canvas-toolchain/module-video` (Panopto provider primitives + the module's MCP tools). C&C gains a `loadModules()` that reads `~/.command-and-control/modules.json`, statically imports enabled modules, and merges their tools into the existing core tool list (additive — core registry untouched). Multi-system Panopto workflows stay in C&C as orchestration, re-pointed to import from `module-video`. CDS loses its baked-in Panopto tools.

**Tech Stack:** TypeScript (NodeNext ESM), vitest, npm workspaces, Go (installer). Test runner: `vitest run` per package; `go test ./...` for installer.

---

## Spec refinements discovered during planning

These clarify (not contradict) the approved spec at `../specs/2026-06-07-module-architecture-design.md`:

1. **CI coupling.** Spec §5 says "the module never imports CI." Reality: `panopto-enrich` uses CI's generic `parseVtt`, and `compare_transcripts` uses CI's Whisper transcription + comparison. **Refinement:** module-video may import CI's *generic* `parseVtt` parser; the *ingest* path stays decoupled by data contract; the heavy multi-system workflows (`bulk_fetch_panopto_transcripts`, `enrich_panopto_transcripts`, `compare_transcripts`, `setup_transcript_source`) **remain C&C orchestration tools**, re-pointed to import provider primitives from `module-video`. No dependency cycle results (CI never imports module-video).

2. **Gated vs. always-on.** The module gates the *simple* Panopto tools (`video_search`/`video_embed`/`video_fetch_captions`, `setup_panopto`, `setup_panopto_vocab`). The orchestration workflows remain always-registered C&C tools; they already fail gracefully with `PANOPTO_NOT_CONFIGURED` when Panopto isn't set up. Converting them to module-gated tools is a future follow-up.

3. **Package names:** `@canvas-toolchain/module-contract`, `@canvas-toolchain/module-video` (matches the `@canvas-toolchain/shared-llm` convention).

---

## File structure

**New: `packages/module-contract/`**
- `src/index.ts` — `CanvasToolchainModule`, `ModuleTool`, `ModuleManifest`, `ModuleManifestEntry` interfaces. No runtime logic.
- `package.json`, `tsconfig.json`

**New: `packages/module-video/`**
- `src/provider.ts` — `VideoProvider` interface + `VideoResult`, `EmbedOptions` types.
- `src/types.ts` — `PanoptoConfig` (moved from CDS).
- `src/panopto/client.ts` — moved `panopto.ts` (API client + helpers).
- `src/panopto/audio.ts` — moved `panopto-audio.ts`.
- `src/panopto/enrich.ts` — moved `panopto-enrich.ts`.
- `src/panopto/provider.ts` — `PanoptoProvider implements VideoProvider`.
- `src/panopto/setup.ts` — moved `setup_panopto.ts` (config read/write/validate).
- `src/panopto/vocab.ts` — moved `setup_panopto_vocab.ts`.
- `src/resolve.ts` — `resolveActiveVideoProvider()` reads manifest's `activeProvider`, returns a `VideoProvider`.
- `src/tools.ts` — `ModuleTool[]` for `video_search`/`video_embed`/`video_fetch_captions` (+ deprecated `*_panopto_*` aliases), `setup_panopto`, `setup_panopto_vocab`.
- `src/index.ts` — default-exports the assembled `CanvasToolchainModule`.
- `tests/*` — moved Panopto tests + new provider/tools tests.
- `package.json`, `tsconfig.json`

**Modified: `packages/command-and-control/`**
- `src/modules/manifest.ts` (new) — `loadModuleManifest()`, manifest path helper.
- `src/modules/registry.ts` (new) — `loadModules()` → `{ tools, handlers }`.
- `src/index.ts` — call `loadModules()`, merge tools into `ListTools`, consult handler map in `CallTool`; delete the moved Panopto tool registrations; repoint workflow imports.
- `src/tools/workflows/*.ts` — repoint Panopto imports from `canvas-design-mcp` → `@canvas-toolchain/module-video`.
- `package.json` — add `@canvas-toolchain/module-video`, `@canvas-toolchain/module-contract` deps.
- Remove `src/tools/setup_panopto.ts`, `setup_panopto_vocab.ts` (moved).

**Modified: `packages/canvas-design-studio/`**
- `src/index.ts` — remove the 3 Panopto tool registrations + imports.
- Remove `src/tools/panopto.ts`, `panopto-audio.ts`, `panopto-enrich.ts` (moved).
- `src/types.ts` — remove `PanoptoConfig` (moved).
- Remove `tests/panopto*.test.ts` (moved).

**Modified: `installer/`**
- `installer/tasks/write_modules_manifest.go` (new) — write `modules.json` from workflow selection.
- `installer/screens/install.go` — call the new task.
- `installer/tasks/write_modules_manifest_test.go` (new).

---

## Phase 0 — Scaffolding

### Task 1: Create `module-contract` package

**Files:**
- Create: `packages/module-contract/package.json`
- Create: `packages/module-contract/tsconfig.json`
- Create: `packages/module-contract/src/index.ts`
- Test: `packages/module-contract/tests/contract.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@canvas-toolchain/module-contract",
  "version": "1.0.0",
  "description": "Shared interfaces for canvas-toolchain plug-in modules",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Write the failing test**

`packages/module-contract/tests/contract.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isCanvasToolchainModule } from '../src/index.js';

describe('isCanvasToolchainModule', () => {
  it('accepts a well-formed module', () => {
    const m = { id: 'video', name: 'Lecture Video', description: 'd', version: '1.0.0', tools: [] };
    expect(isCanvasToolchainModule(m)).toBe(true);
  });
  it('rejects an object missing tools', () => {
    const m = { id: 'video', name: 'Lecture Video', description: 'd', version: '1.0.0' };
    expect(isCanvasToolchainModule(m)).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test --workspace=@canvas-toolchain/module-contract`
Expected: FAIL — cannot find `../src/index.js` / `isCanvasToolchainModule` not exported.

- [ ] **Step 5: Write the implementation**

`packages/module-contract/src/index.ts`:
```ts
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** One MCP tool a module contributes. */
export interface ModuleTool {
  schema: Tool;
  handler(args: unknown): Promise<CallToolResult>;
}

/** The single object every module package default-exports. */
export interface CanvasToolchainModule {
  id: string;
  name: string;
  description: string;
  version: string;
  /** Provider/tool types this module can integrate, for #76 discovery matching. */
  handles?: string[];
  tools: ModuleTool[];
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
}

export interface ModuleManifestEntry {
  enabled: boolean;
  /** Optional active provider id for modules with a provider layer. */
  activeProvider?: string;
}

export interface ModuleManifest {
  modules: Record<string, ModuleManifestEntry>;
}

/** Runtime guard used by the registry before trusting a loaded module. */
export function isCanvasToolchainModule(value: unknown): value is CanvasToolchainModule {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    typeof m.description === 'string' &&
    typeof m.version === 'string' &&
    Array.isArray(m.tools)
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --workspace=@canvas-toolchain/module-contract`
Expected: PASS (2 tests).

- [ ] **Step 7: Build to verify types compile**

Run: `npm run build --workspace=@canvas-toolchain/module-contract`
Expected: clean exit, `dist/` produced.

- [ ] **Step 8: Commit**

```bash
git add packages/module-contract
git commit -m "feat(modules): module-contract package — CanvasToolchainModule + manifest types (#78)"
```

---

### Task 2: Create `module-video` package skeleton

**Files:**
- Create: `packages/module-video/package.json`
- Create: `packages/module-video/tsconfig.json`
- Create: `packages/module-video/src/index.ts` (temporary stub)
- Test: `packages/module-video/tests/smoke.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@canvas-toolchain/module-video",
  "version": "1.0.0",
  "description": "Lecture Video module for canvas-toolchain (Panopto provider)",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@canvas-toolchain/module-contract": "*",
    "@modelcontextprotocol/sdk": "^1.10.0",
    "curriculum-intelligence-mcp": "*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=18" }
}
```

- [ ] **Step 2: Create tsconfig.json** (identical shape to Task 1 Step 2).

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Write the failing smoke test**

`packages/module-video/tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { MODULE_ID } from '../src/index.js';

describe('module-video', () => {
  it('exposes its module id', () => {
    expect(MODULE_ID).toBe('video');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test --workspace=@canvas-toolchain/module-video`
Expected: FAIL — `MODULE_ID` not exported.

- [ ] **Step 5: Write the stub implementation**

`packages/module-video/src/index.ts`:
```ts
export const MODULE_ID = 'video';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test --workspace=@canvas-toolchain/module-video`
Expected: PASS.

- [ ] **Step 7: Install workspace links + build**

Run: `npm install` then `npm run build --workspace=@canvas-toolchain/module-video`
Expected: workspace symlinks created; build clean.

- [ ] **Step 8: Commit**

```bash
git add packages/module-video package-lock.json
git commit -m "feat(modules): module-video package skeleton (#78)"
```

---

## Phase 1 — Provider primitives (move Panopto code)

### Task 3: Define the `VideoProvider` interface

**Files:**
- Create: `packages/module-video/src/provider.ts`
- Test: `packages/module-video/tests/provider.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/module-video/tests/provider.test.ts`:
```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { VideoProvider, VideoResult, EmbedOptions } from '../src/provider.js';

describe('VideoProvider type', () => {
  it('shapes a provider', () => {
    const p: VideoProvider = {
      id: 'fake',
      name: 'Fake',
      capabilities: { search: false, embed: true, fetchCaptions: false },
      async embed() { return '<iframe></iframe>'; },
    };
    expectTypeOf(p.capabilities.embed).toEqualTypeOf<boolean>();
    expectTypeOf<VideoResult>().toHaveProperty('id');
    expectTypeOf<EmbedOptions>().toHaveProperty('startSeconds');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@canvas-toolchain/module-video`
Expected: FAIL — `../src/provider.js` not found.

- [ ] **Step 3: Write the implementation**

`packages/module-video/src/provider.ts`:
```ts
export interface VideoResult {
  id: string;
  title: string;
  url: string;
  durationSeconds?: number;
}

export interface EmbedOptions {
  width?: number;
  height?: number;
  startSeconds?: number;
}

export interface VideoProvider {
  id: string;
  name: string;
  capabilities: {
    search: boolean;
    embed: boolean;
    fetchCaptions: boolean;
  };
  search?(query: string): Promise<VideoResult[]>;
  embed(ref: string, opts?: EmbedOptions): Promise<string>;
  fetchCaptions?(ref: string): Promise<string>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=@canvas-toolchain/module-video`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-video/src/provider.ts packages/module-video/tests/provider.test.ts
git commit -m "feat(modules): VideoProvider interface (#78)"
```

---

### Task 4: Move `PanoptoConfig` + Panopto API client into module-video

**Files:**
- Create: `packages/module-video/src/types.ts`
- Move: `packages/canvas-design-studio/src/tools/panopto.ts` → `packages/module-video/src/panopto/client.ts`
- Move: `packages/canvas-design-studio/tests/panopto.test.ts` → `packages/module-video/tests/panopto-client.test.ts`
- Move: `packages/canvas-design-studio/tests/panopto-bulk.test.ts` → `packages/module-video/tests/panopto-bulk.test.ts`
- Create: `packages/module-video/src/utils/errors.ts` (copy of CDS `utils/errors.ts` `formatError`)

- [ ] **Step 1: Create `src/types.ts` with the moved interface**

`packages/module-video/src/types.ts`:
```ts
export interface PanoptoConfig {
  domain: string;
  iframeWhitelisted: boolean | null;
  clientId?: string;
  clientSecret?: string;
}
```

- [ ] **Step 2: Copy the `formatError` util**

Read `packages/canvas-design-studio/src/utils/errors.ts` and copy `formatError` (and anything it needs) to `packages/module-video/src/utils/errors.ts`. (panopto.ts imports `formatError` from `../utils/errors.js`.)

- [ ] **Step 3: git mv the client + its tests**

```bash
git mv packages/canvas-design-studio/src/tools/panopto.ts packages/module-video/src/panopto/client.ts
git mv packages/canvas-design-studio/tests/panopto.test.ts packages/module-video/tests/panopto-client.test.ts
git mv packages/canvas-design-studio/tests/panopto-bulk.test.ts packages/module-video/tests/panopto-bulk.test.ts
```

- [ ] **Step 4: Fix imports in `client.ts`**

In `packages/module-video/src/panopto/client.ts`, change:
- `import type { PanoptoConfig } from '../types.js';` → `import type { PanoptoConfig } from '../types.js';` (path now resolves to module-video `src/types.ts` — verify relative depth: file is in `src/panopto/`, so `../types.js` is correct).
- `import { formatError } from '../utils/errors.js';` → keep (`../utils/errors.js` resolves to module-video copy).

In the moved test files, update the import path of the subject from `../src/tools/panopto.js` → `../src/panopto/client.js`.

- [ ] **Step 5: Run the moved tests**

Run: `npm test --workspace=@canvas-toolchain/module-video`
Expected: PASS — all `panopto-client` + `panopto-bulk` tests green (behavior unchanged).

- [ ] **Step 6: Verify CDS no longer references the moved file**

Run: `npm run build --workspace=canvas-design-mcp`
Expected: FAIL — CDS `src/index.ts` still imports `./tools/panopto.js`. This is expected; it is fixed in Task 16. To keep the tree building in the meantime, proceed — but do **not** mark Task 16 skippable. (If you prefer green-at-every-commit, jump to Task 16 Step 1–2 now to delete the CDS imports, then return. The plan orders CDS cleanup later to keep moves grouped.)

- [ ] **Step 7: Commit**

```bash
git add packages/module-video packages/canvas-design-studio
git commit -m "refactor(modules): move Panopto API client + PanoptoConfig into module-video (#78)"
```

---

### Task 5: Move Panopto audio fetch into module-video

**Files:**
- Move: `packages/canvas-design-studio/src/tools/panopto-audio.ts` → `packages/module-video/src/panopto/audio.ts`
- Move: `packages/canvas-design-studio/tests/panopto-audio.test.ts` → `packages/module-video/tests/panopto-audio.test.ts`

- [ ] **Step 1: git mv the files**

```bash
git mv packages/canvas-design-studio/src/tools/panopto-audio.ts packages/module-video/src/panopto/audio.ts
git mv packages/canvas-design-studio/tests/panopto-audio.test.ts packages/module-video/tests/panopto-audio.test.ts
```

- [ ] **Step 2: Fix imports in `audio.ts`**

In `packages/module-video/src/panopto/audio.ts`:
- `import type { PanoptoConfig } from '../types.js';` (file is in `src/panopto/`, `../types.js` correct).
- `import { getPanoptoToken, buildViewerUrl } from './panopto.js';` → `from './client.js';`
- `import type { SessionManifestEntry } from './panopto-enrich.js';` → `from './enrich.js';` (enrich moves in Task 6; this import will resolve after Task 6).

In the moved test, update subject import `../src/tools/panopto-audio.js` → `../src/panopto/audio.js`, and any `./panopto.js` mock paths → `./client.js`.

- [ ] **Step 3: Run the moved test**

Run: `npm test --workspace=@canvas-toolchain/module-video -- panopto-audio`
Expected: FAIL only if Task 6 not yet done (missing `./enrich.js` type). Type-only import of `SessionManifestEntry` — if the test passes at runtime (type erased), it is green. If the build/typecheck fails, complete Task 6 first then re-run. Expected after Task 6: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/module-video packages/canvas-design-studio
git commit -m "refactor(modules): move Panopto audio fetch into module-video (#78)"
```

---

### Task 6: Move Panopto transcript enrichment into module-video

**Files:**
- Move: `packages/canvas-design-studio/src/tools/panopto-enrich.ts` → `packages/module-video/src/panopto/enrich.ts`
- Move: `packages/canvas-design-studio/tests/panopto-enrich.test.ts` → `packages/module-video/tests/panopto-enrich.test.ts`

- [ ] **Step 1: git mv the files**

```bash
git mv packages/canvas-design-studio/src/tools/panopto-enrich.ts packages/module-video/src/panopto/enrich.ts
git mv packages/canvas-design-studio/tests/panopto-enrich.test.ts packages/module-video/tests/panopto-enrich.test.ts
```

- [ ] **Step 2: Fix imports in `enrich.ts`**

The only non-node import is:
```ts
import { parseVtt } from 'curriculum-intelligence-mcp/dist/parsers/transcript_vtt.js';
```
Keep it as-is — `curriculum-intelligence-mcp` is a declared dependency of module-video (Task 2). This is the deliberate CI-parser coupling noted in the spec refinements.

In the moved test, update subject import `../src/tools/panopto-enrich.js` → `../src/panopto/enrich.js`.

- [ ] **Step 3: Run the moved test**

Run: `npm test --workspace=@canvas-toolchain/module-video -- panopto-enrich`
Expected: PASS — enrich tests green (behavior unchanged).

- [ ] **Step 4: Run the full module-video suite (audio now resolves)**

Run: `npm test --workspace=@canvas-toolchain/module-video`
Expected: PASS — client, bulk, audio, enrich, provider, smoke all green.

- [ ] **Step 5: Build the package**

Run: `npm run build --workspace=@canvas-toolchain/module-video`
Expected: clean compile (confirms `SessionManifestEntry` import in audio.ts resolves).

- [ ] **Step 6: Commit**

```bash
git add packages/module-video packages/canvas-design-studio
git commit -m "refactor(modules): move Panopto transcript enrichment into module-video (#78)"
```

---

### Task 7: Implement `PanoptoProvider`

**Files:**
- Create: `packages/module-video/src/panopto/provider.ts`
- Test: `packages/module-video/tests/panopto-provider.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/module-video/tests/panopto-provider.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { PanoptoProvider } from '../src/panopto/provider.js';
import type { PanoptoConfig } from '../src/types.js';

const cfg: PanoptoConfig = { domain: 'x.panopto.com', iframeWhitelisted: true, clientId: 'a', clientSecret: 'b' };

describe('PanoptoProvider', () => {
  it('declares its capabilities', () => {
    const p = new PanoptoProvider(cfg);
    expect(p.id).toBe('panopto');
    expect(p.capabilities).toEqual({ search: true, embed: true, fetchCaptions: true });
  });

  it('embed() delegates to embedPanoptoVideo and returns html', async () => {
    const p = new PanoptoProvider(cfg);
    const html = await p.embed('vid-1', { });
    expect(typeof html).toBe('string');
  });
});
```
(The embed test relies on `embedPanoptoVideo` working without network for the no-credential/whitelist path; if it requires the API, mock `./client.js` `getPanoptoToken` with `vi.mock`. Use the same mock approach the existing `panopto-bulk.test.ts` uses.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@canvas-toolchain/module-video -- panopto-provider`
Expected: FAIL — `../src/panopto/provider.js` not found.

- [ ] **Step 3: Write the implementation**

`packages/module-video/src/panopto/provider.ts`:
```ts
import type { VideoProvider, VideoResult, EmbedOptions } from '../provider.js';
import type { PanoptoConfig } from '../types.js';
import {
  searchPanoptoVideos,
  embedPanoptoVideo,
  fetchPanoptoCaptions,
} from './client.js';

/** Panopto implementation of the VideoProvider contract. */
export class PanoptoProvider implements VideoProvider {
  readonly id = 'panopto';
  readonly name = 'Panopto';
  readonly capabilities = { search: true, embed: true, fetchCaptions: true };

  constructor(private readonly config: PanoptoConfig) {}

  async search(query: string): Promise<VideoResult[]> {
    // The MCP tool layer (tools.ts) calls searchPanoptoVideos directly to keep the
    // exact current formatted-string output. This structured method exists only so
    // future providers can return real VideoResult[]. Minimal placeholder for now
    // (YAGNI until a second provider needs structured search).
    const formatted = await searchPanoptoVideos({ query }, this.config);
    return [{ id: '', title: formatted, url: '' }];
  }

  async embed(ref: string, opts?: EmbedOptions): Promise<string> {
    const placement = opts?.width && opts.width >= 720 ? 'full-page' : 'inline';
    const res = await embedPanoptoVideo({ videoId: ref, placement }, this.config);
    return res.html;
  }

  async fetchCaptions(ref: string): Promise<string> {
    return fetchPanoptoCaptions({ videoId: ref }, this.config);
  }
}
```

> **Implementer note:** `searchPanoptoVideos`/`fetchPanoptoCaptions` currently return MCP-formatted strings, not structured data. The `tools.ts` layer (Task 8) calls the *client functions directly* to preserve exact current tool output. The `PanoptoProvider.search` structured shape is only used by future providers; keep it minimal here (return the formatted string in `title`) and do not over-engineer parsing — YAGNI until a second provider needs structured search. Adjust the test to assert `result[0].title` contains the formatted string.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=@canvas-toolchain/module-video -- panopto-provider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-video/src/panopto/provider.ts packages/module-video/tests/panopto-provider.test.ts
git commit -m "feat(modules): PanoptoProvider implements VideoProvider (#78)"
```

---

## Phase 2 — Config + module assembly

### Task 8: Move `setup_panopto` (config read/write/validate) into module-video

**Files:**
- Move: `packages/command-and-control/src/tools/setup_panopto.ts` → `packages/module-video/src/panopto/setup.ts`
- Move: `packages/command-and-control/tests/tools/setup_panopto.test.ts` → `packages/module-video/tests/panopto-setup.test.ts`
- Create (in module-video): `packages/module-video/src/cc-home.ts` (copy of `getCcHomePath`)

- [ ] **Step 1: Copy `getCcHomePath`**

`packages/module-video/src/cc-home.ts`:
```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve the shared canvas-toolchain config home (matches C&C's kb/config.ts). */
export function getCcHomePath(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}
```

- [ ] **Step 2: git mv setup + its test**

```bash
git mv packages/command-and-control/src/tools/setup_panopto.ts packages/module-video/src/panopto/setup.ts
git mv packages/command-and-control/tests/tools/setup_panopto.test.ts packages/module-video/tests/panopto-setup.test.ts
```

- [ ] **Step 3: Fix imports in `setup.ts`**

- `import { getPanoptoToken } from 'canvas-design-mcp/dist/tools/panopto.js';` → `import { getPanoptoToken } from './client.js';` (now intra-module — this is the smear cure).
- `import { getCcHomePath } from '../kb/config.js';` → `import { getCcHomePath } from '../cc-home.js';`

In the moved test, update subject import to `../src/panopto/setup.js`, and ensure `CC_HOME` env is set to a temp dir as the original test did.

- [ ] **Step 4: Run the moved test**

Run: `npm test --workspace=@canvas-toolchain/module-video -- panopto-setup`
Expected: PASS — credential validation + atomic-write tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/module-video packages/command-and-control
git commit -m "refactor(modules): move setup_panopto into module-video; kill CDS cross-import (#78)"
```

---

### Task 9: Move `setup_panopto_vocab` into module-video

**Files:**
- Move: `packages/command-and-control/src/tools/setup_panopto_vocab.ts` → `packages/module-video/src/panopto/vocab.ts`
- Move: `packages/command-and-control/tests/tools/setup_panopto_vocab.test.ts` → `packages/module-video/tests/panopto-vocab.test.ts`

- [ ] **Step 1: git mv the files**

```bash
git mv packages/command-and-control/src/tools/setup_panopto_vocab.ts packages/module-video/src/panopto/vocab.ts
git mv packages/command-and-control/tests/tools/setup_panopto_vocab.test.ts packages/module-video/tests/panopto-vocab.test.ts
```

- [ ] **Step 2: Fix imports in `vocab.ts`**

- `import { getCcHomePath } from '../kb/config.js';` → `import { getCcHomePath } from '../cc-home.js';`

In the moved test, update subject import to `../src/panopto/vocab.js`.

- [ ] **Step 3: Run the moved test**

Run: `npm test --workspace=@canvas-toolchain/module-video -- panopto-vocab`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/module-video packages/command-and-control
git commit -m "refactor(modules): move setup_panopto_vocab into module-video (#78)"
```

---

### Task 10: Build the module's MCP tools (with provider-agnostic names + aliases)

**Files:**
- Create: `packages/module-video/src/resolve.ts`
- Create: `packages/module-video/src/tools.ts`
- Test: `packages/module-video/tests/tools.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/module-video/tests/tools.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { videoTools } from '../src/tools.js';

describe('videoTools', () => {
  it('exposes provider-agnostic names plus deprecated aliases', () => {
    const names = videoTools.map((t) => t.schema.name);
    expect(names).toContain('video_search');
    expect(names).toContain('video_embed');
    expect(names).toContain('video_fetch_captions');
    expect(names).toContain('setup_panopto');
    expect(names).toContain('setup_panopto_vocab');
    // deprecated aliases retained for one version
    expect(names).toContain('search_panopto_videos');
    expect(names).toContain('embed_panopto_video');
    expect(names).toContain('fetch_panopto_captions');
  });

  it('alias and canonical share a handler reference', () => {
    const canonical = videoTools.find((t) => t.schema.name === 'video_embed');
    const alias = videoTools.find((t) => t.schema.name === 'embed_panopto_video');
    expect(canonical?.handler).toBe(alias?.handler);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@canvas-toolchain/module-video -- tools`
Expected: FAIL — `../src/tools.js` not found.

- [ ] **Step 3: Write `resolve.ts`**

`packages/module-video/src/resolve.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VideoProvider } from './provider.js';
import { PanoptoProvider } from './panopto/provider.js';
import { loadPanoptoConfig } from './panopto/setup.js';
import { getCcHomePath } from './cc-home.js';

/** Read the active provider id for the video module from modules.json (default 'panopto'). */
export function activeProviderId(): string {
  const path = join(getCcHomePath(), 'modules.json');
  if (!existsSync(path)) return 'panopto';
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf-8')) as {
      modules?: Record<string, { activeProvider?: string }>;
    };
    return manifest.modules?.video?.activeProvider ?? 'panopto';
  } catch {
    return 'panopto';
  }
}

/** Resolve the active VideoProvider. Throws the provider's own NOT_CONFIGURED error if unset. */
export function resolveActiveVideoProvider(): VideoProvider {
  const id = activeProviderId();
  switch (id) {
    case 'panopto':
    default:
      return new PanoptoProvider(loadPanoptoConfig());
  }
}
```

- [ ] **Step 4: Write `tools.ts`**

`packages/module-video/src/tools.ts`:
```ts
import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { loadPanoptoConfig, setupPanopto } from './panopto/setup.js';
import { setupPanoptoVocab } from './panopto/vocab.js';
import {
  searchPanoptoVideos,
  embedPanoptoVideo,
  fetchPanoptoCaptions,
} from './panopto/client.js';

const text = (s: string): CallToolResult => ({ content: [{ type: 'text', text: s }] });

const videoSearch: ModuleTool = {
  schema: {
    name: 'video_search',
    description:
      'Search or browse your lecture video library (active provider, default Panopto). Omit the query to list all videos. Returns video IDs, titles, durations, and captions status.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms. Omit to list all videos.' },
        limit: { type: 'number', description: 'Maximum results (capped at 500).' },
      },
    },
  },
  handler: async (args) => {
    const input = args as { query?: string; limit?: number };
    return text(await searchPanoptoVideos(input, loadPanoptoConfig()));
  },
};

const videoEmbed: ModuleTool = {
  schema: {
    name: 'video_embed',
    description:
      'Generate Canvas-safe HTML to embed a lecture video (active provider, default Panopto). Works without API credentials (provide video ID and title). iframe when whitelisted, accessible fallback link otherwise.',
    inputSchema: {
      type: 'object',
      required: ['videoId', 'placement'],
      properties: {
        videoId: { type: 'string', description: 'Provider video ID (UUID or URL id).' },
        placement: { type: 'string', enum: ['inline', 'full-page'], description: 'inline or centered full-page.' },
        title: { type: 'string', description: 'Accessibility label; fetched automatically when API configured.' },
      },
    },
  },
  handler: async (args) => {
    const input = args as { videoId: string; placement: 'inline' | 'full-page'; title?: string };
    const res = await embedPanoptoVideo(input, loadPanoptoConfig());
    return text(res.html);
  },
};

const videoFetchCaptions: ModuleTool = {
  schema: {
    name: 'video_fetch_captions',
    description:
      'Download captions for a lecture video, strip timestamps, and save the plain-text transcript. Requires provider API credentials.',
    inputSchema: {
      type: 'object',
      required: ['videoId'],
      properties: {
        videoId: { type: 'string', description: 'Provider video ID.' },
        title: { type: 'string', description: 'Title used for the saved filename.' },
      },
    },
  },
  handler: async (args) => {
    const input = args as { videoId: string; title?: string };
    return text(await fetchPanoptoCaptions(input, loadPanoptoConfig()));
  },
};

const setupPanoptoTool: ModuleTool = {
  schema: {
    name: 'setup_panopto',
    description:
      'Configure Panopto integration: domain, clientId, clientSecret. Validates credentials before saving.',
    inputSchema: {
      type: 'object',
      required: ['domain', 'clientId', 'clientSecret'],
      properties: {
        domain: { type: 'string', description: 'Panopto hostname, e.g. "bsu.hosted.panopto.com".' },
        clientId: { type: 'string', description: 'OAuth2 client ID.' },
        clientSecret: { type: 'string', description: 'OAuth2 client secret. Stored locally, never echoed.' },
        iframeWhitelisted: { type: 'boolean', description: 'Whether Canvas allows Panopto iframes. Null = unknown.', nullable: true },
        test: { type: 'boolean', description: 'Validate before saving (default true).' },
      },
    },
  },
  handler: async (args) => {
    const res = await setupPanopto(args as Parameters<typeof setupPanopto>[0]);
    return text(JSON.stringify(res, null, 2));
  },
};

const setupPanoptoVocabTool: ModuleTool = {
  schema: {
    name: 'setup_panopto_vocab',
    description:
      'Manage professor vocabulary corrections and filler words for transcript enrichment.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['add-correction', 'add-filler', 'remove-correction', 'list'] },
        from: { type: 'string', description: 'Source word/phrase (add/remove-correction).' },
        to: { type: 'string', description: 'Replacement (add-correction).' },
        word: { type: 'string', description: 'Filler word (add-filler).' },
      },
    },
  },
  handler: async (args) => {
    const res = setupPanoptoVocab(args as Parameters<typeof setupPanoptoVocab>[0]);
    return text(JSON.stringify(res, null, 2));
  },
};

/** Deprecated alias: same handler, old name, with a deprecation note appended to the description. */
function alias(tool: ModuleTool, oldName: string): ModuleTool {
  return {
    schema: { ...tool.schema, name: oldName, description: `[deprecated: use ${tool.schema.name}] ${tool.schema.description ?? ''}` },
    handler: tool.handler,
  };
}

export const videoTools: ModuleTool[] = [
  videoSearch,
  videoEmbed,
  videoFetchCaptions,
  setupPanoptoTool,
  setupPanoptoVocabTool,
  alias(videoSearch, 'search_panopto_videos'),
  alias(videoEmbed, 'embed_panopto_video'),
  alias(videoFetchCaptions, 'fetch_panopto_captions'),
];
```

> **Implementer note:** `resolve.ts` is wired for future multi-provider use; the tool handlers above call `loadPanoptoConfig()` directly to preserve byte-for-byte the current tool output. That is intentional for this single-provider pass. Do not route handlers through `resolveActiveVideoProvider()` yet — the provider's structured `search` shape differs from the formatted-string tool output and would change behavior.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=@canvas-toolchain/module-video -- tools`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/module-video/src/resolve.ts packages/module-video/src/tools.ts packages/module-video/tests/tools.test.ts
git commit -m "feat(modules): video module tools (video_* + deprecated panopto aliases) (#78)"
```

---

### Task 11: Assemble the `CanvasToolchainModule` default export

**Files:**
- Modify: `packages/module-video/src/index.ts`
- Test: `packages/module-video/tests/module.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/module-video/tests/module.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import videoModule from '../src/index.js';
import { isCanvasToolchainModule } from '@canvas-toolchain/module-contract';

describe('video module', () => {
  it('satisfies the module contract', () => {
    expect(isCanvasToolchainModule(videoModule)).toBe(true);
    expect(videoModule.id).toBe('video');
    expect(videoModule.handles).toContain('panopto');
    expect(videoModule.tools.length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@canvas-toolchain/module-video -- module`
Expected: FAIL — default export is the `MODULE_ID` stub, not a module object.

- [ ] **Step 3: Replace `src/index.ts`**

`packages/module-video/src/index.ts`:
```ts
import type { CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { videoTools } from './tools.js';

export const MODULE_ID = 'video';

const videoModule: CanvasToolchainModule = {
  id: MODULE_ID,
  name: 'Lecture Video',
  description:
    'Embed lecture videos in Canvas pages and pull transcripts. Providers: Panopto (more coming: Zoom, Teams, Meet, YouTube).',
  version: '1.0.0',
  handles: ['panopto', 'zoom', 'teams', 'meet', 'youtube'],
  tools: videoTools,
};

export default videoModule;

// Re-export provider primitives that C&C workflows orchestrate.
export {
  bulkDownloadPanoptoCaptions,
  type ProgressCallback,
} from './panopto/client.js';
export { enrichVttFile, BUILTIN_FILLER_WORDS, type SessionsManifest } from './panopto/enrich.js';
export { fetchSessionAudio } from './panopto/audio.js';
```

- [ ] **Step 4: Run test + full suite**

Run: `npm test --workspace=@canvas-toolchain/module-video`
Expected: PASS — all suites green (smoke still asserts `MODULE_ID === 'video'`).

- [ ] **Step 5: Build**

Run: `npm run build --workspace=@canvas-toolchain/module-video`
Expected: clean compile, `dist/` complete.

- [ ] **Step 6: Commit**

```bash
git add packages/module-video/src/index.ts packages/module-video/tests/module.test.ts
git commit -m "feat(modules): assemble Lecture Video module default export (#78)"
```

---

## Phase 3 — Manifest + registry in C&C

### Task 12: Manifest reader in C&C

**Files:**
- Create: `packages/command-and-control/src/modules/manifest.ts`
- Test: `packages/command-and-control/tests/modules/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/command-and-control/tests/modules/manifest.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModuleManifest } from '../../src/modules/manifest.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-mani-')); process.env.CC_HOME = dir; });
afterEach(() => { delete process.env.CC_HOME; rmSync(dir, { recursive: true, force: true }); });

describe('loadModuleManifest', () => {
  it('returns empty modules when file absent', () => {
    expect(loadModuleManifest()).toEqual({ modules: {} });
  });
  it('reads enabled state', () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }));
    expect(loadModuleManifest().modules.video).toEqual({ enabled: true, activeProvider: 'panopto' });
  });
  it('tolerates corrupt JSON by returning empty', () => {
    writeFileSync(join(dir, 'modules.json'), '{ not json');
    expect(loadModuleManifest()).toEqual({ modules: {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=command-and-control-mcp -- modules/manifest`
Expected: FAIL — module not found.

(Confirm C&C's package name from `packages/command-and-control/package.json`; the workspace flag must match it. The plan assumes `command-and-control-mcp` — verify and substitute if different.)

- [ ] **Step 3: Write the implementation**

`packages/command-and-control/src/modules/manifest.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleManifest } from '@canvas-toolchain/module-contract';
import { getCcHomePath } from '../kb/config.js';

const EMPTY: ModuleManifest = { modules: {} };

/** Read ~/.command-and-control/modules.json; tolerate missing/corrupt by returning empty. */
export function loadModuleManifest(): ModuleManifest {
  const path = join(getCcHomePath(), 'modules.json');
  if (!existsSync(path)) return EMPTY;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ModuleManifest;
    return parsed.modules ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=command-and-control-mcp -- modules/manifest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/modules/manifest.ts packages/command-and-control/tests/modules/manifest.test.ts
git commit -m "feat(modules): C&C module manifest reader (#78)"
```

---

### Task 13: Module registry/loader in C&C

**Files:**
- Create: `packages/command-and-control/src/modules/registry.ts`
- Test: `packages/command-and-control/tests/modules/registry.test.ts`
- Modify: `packages/command-and-control/package.json` (add deps)

- [ ] **Step 1: Add module deps to C&C package.json**

In `packages/command-and-control/package.json` `dependencies`, add:
```json
"@canvas-toolchain/module-contract": "*",
"@canvas-toolchain/module-video": "*"
```
Run `npm install` to link.

- [ ] **Step 2: Write the failing test**

`packages/command-and-control/tests/modules/registry.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModules } from '../../src/modules/registry.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-reg-')); process.env.CC_HOME = dir; });
afterEach(() => { delete process.env.CC_HOME; rmSync(dir, { recursive: true, force: true }); });

describe('loadModules', () => {
  it('exposes no module tools when manifest absent', async () => {
    const { tools, handlers } = await loadModules();
    expect(tools.find((t) => t.name === 'video_embed')).toBeUndefined();
    expect(handlers.has('video_embed')).toBe(false);
  });

  it('exposes video tools when enabled', async () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }));
    const { tools, handlers } = await loadModules();
    expect(tools.find((t) => t.name === 'video_embed')).toBeDefined();
    expect(handlers.has('video_embed')).toBe(true);
    expect(handlers.has('embed_panopto_video')).toBe(true); // alias
  });

  it('hides video tools when disabled', async () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: false } } }));
    const { tools } = await loadModules();
    expect(tools.find((t) => t.name === 'video_embed')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=command-and-control-mcp -- modules/registry`
Expected: FAIL — registry not found.

- [ ] **Step 4: Write the implementation**

`packages/command-and-control/src/modules/registry.ts`:
```ts
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isCanvasToolchainModule, type CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { loadModuleManifest } from './manifest.js';

/** Static registry of known modules. Future runtime-loading swaps this map for dynamic import. */
const KNOWN_MODULES: Record<string, () => Promise<CanvasToolchainModule>> = {
  video: async () => (await import('@canvas-toolchain/module-video')).default,
};

export interface LoadedModules {
  tools: Tool[];
  handlers: Map<string, (args: unknown) => Promise<CallToolResult>>;
}

/** Load all enabled modules; return their merged tool schemas + a name→handler map. */
export async function loadModules(): Promise<LoadedModules> {
  const manifest = loadModuleManifest();
  const tools: Tool[] = [];
  const handlers = new Map<string, (args: unknown) => Promise<CallToolResult>>();

  for (const [id, entry] of Object.entries(manifest.modules)) {
    if (!entry?.enabled) continue;
    const loader = KNOWN_MODULES[id];
    if (!loader) continue;
    const mod = await loader();
    if (!isCanvasToolchainModule(mod)) continue;
    for (const t of mod.tools) {
      tools.push(t.schema);
      handlers.set(t.schema.name, t.handler);
    }
  }
  return { tools, handlers };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=command-and-control-mcp -- modules/registry`
Expected: PASS (3 tests). (Requires `module-video` built — run `npm run build --workspace=@canvas-toolchain/module-video` first if dist is stale.)

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/modules/registry.ts packages/command-and-control/tests/modules/registry.test.ts packages/command-and-control/package.json package-lock.json
git commit -m "feat(modules): C&C module registry/loader (#78)"
```

---

### Task 14: Wire `loadModules()` into the C&C server

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

- [ ] **Step 1: Load modules at startup**

Near the top of the server setup in `packages/command-and-control/src/index.ts` (after `Server` instantiation, before request handlers are registered), add:
```ts
import { loadModules } from './modules/registry.js';
// ...
const loadedModules = await loadModules();
```
(If the file's top level is not async, wrap server start in an async IIFE or move `loadModules()` into the existing async startup path. Verify how the server currently boots — `main()` or top-level await — and place it there.)

- [ ] **Step 2: Merge module tool schemas into ListTools**

In the `ListToolsRequestSchema` handler, where the `tools` array is returned, spread the module tools in:
```ts
return { tools: [ ...coreTools, ...loadedModules.tools ] };
```
(Adapt to the actual return shape — the current handler returns an inline object literal `{ tools: [ ... ] }`. Append `...loadedModules.tools` to that array.)

- [ ] **Step 3: Consult the module handler map in CallTool**

At the very start of the `CallToolRequestSchema` handler body, before the existing `switch`/passthrough logic:
```ts
const moduleHandler = loadedModules.handlers.get(name);
if (moduleHandler) {
  const result = await moduleHandler(args);
  return result;
}
```
(Match the existing handler's variable names for `name`/`args` and its return convention.)

- [ ] **Step 4: Build to verify wiring compiles**

Run: `npm run build --workspace=command-and-control-mcp`
Expected: FAIL — duplicate tool names: the moved `setup_panopto`/`setup_panopto_vocab` are still registered inline AND now come from the module. This is fixed in Task 15. Proceed to Task 15 before testing the server end-to-end.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(modules): wire module registry into C&C ListTools + CallTool (#78)"
```

---

### Task 15: Remove moved Panopto registrations from C&C; repoint workflow imports

**Files:**
- Modify: `packages/command-and-control/src/index.ts`
- Modify: `packages/command-and-control/src/tools/workflows/bulk_fetch_panopto_transcripts.ts`
- Modify: `packages/command-and-control/src/tools/workflows/enrich_panopto_transcripts.ts`
- Modify: `packages/command-and-control/src/tools/workflows/compare_transcripts.ts`

- [ ] **Step 1: Remove moved tool wiring from `index.ts`**

Delete from `packages/command-and-control/src/index.ts`:
- The imports `import { setupPanopto } from './tools/setup_panopto.js';` and `import { setupPanoptoVocab } from './tools/setup_panopto_vocab.js';`
- The `ListTools` schema blocks for `setup_panopto` (lines ~309-321) and `setup_panopto_vocab` (lines ~339-354).
- The `CallTool` cases `case 'setup_panopto':` and `case 'setup_panopto_vocab':`.

Leave the **workflow** tools (`bulk_fetch_panopto_transcripts`, `enrich_panopto_transcripts`, `setup_transcript_source`, `compare_transcripts`) registered — they stay as C&C orchestration.

- [ ] **Step 2: Repoint `bulk_fetch_panopto_transcripts.ts` imports**

Change:
```ts
import { bulkDownloadPanoptoCaptions } from 'canvas-design-mcp/dist/tools/panopto.js';
import type { ProgressCallback } from 'canvas-design-mcp/dist/tools/panopto.js';
```
to:
```ts
import { bulkDownloadPanoptoCaptions, type ProgressCallback } from '@canvas-toolchain/module-video';
```

- [ ] **Step 3: Repoint `enrich_panopto_transcripts.ts` imports**

Change:
```ts
import { enrichVttFile, BUILTIN_FILLER_WORDS, type SessionsManifest } from 'canvas-design-mcp/dist/tools/panopto-enrich.js';
```
to:
```ts
import { enrichVttFile, BUILTIN_FILLER_WORDS, type SessionsManifest } from '@canvas-toolchain/module-video';
```

- [ ] **Step 4: Repoint `compare_transcripts.ts` imports**

Change:
```ts
import { fetchSessionAudio } from 'canvas-design-mcp/dist/tools/panopto-audio.js';
```
to:
```ts
import { fetchSessionAudio } from '@canvas-toolchain/module-video';
```
Leave its CI imports (`getTranscriptionEngine`, `compareTranscripts`, `renderComparisonMd`, `parseVtt`) unchanged.

- [ ] **Step 5: Build C&C**

Run: `npm run build --workspace=command-and-control-mcp`
Expected: clean compile (no duplicate tool names; imports resolve to module-video).

- [ ] **Step 6: Run the C&C workflow tests**

Run: `npm test --workspace=command-and-control-mcp -- workflows`
Expected: PASS — `bulk_fetch_panopto_transcripts` + `enrich_panopto_transcripts` tests green (they may import provider primitives via the repointed path; if a test imports from `canvas-design-mcp` Panopto paths directly, repoint it to `@canvas-toolchain/module-video`).

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/src
git commit -m "refactor(modules): remove moved Panopto tools from C&C core; repoint workflows to module-video (#78)"
```

---

## Phase 4 — CDS cleanup

### Task 16: Remove Panopto from canvas-design-studio

**Files:**
- Modify: `packages/canvas-design-studio/src/index.ts`
- Modify: `packages/canvas-design-studio/src/types.ts`

- [ ] **Step 1: Remove Panopto imports + registrations from CDS `index.ts`**

Delete:
- `import { searchPanoptoVideos, embedPanoptoVideo, fetchPanoptoCaptions } from './tools/panopto.js';` (lines ~27-30).
- The `ListTools` schema blocks for `search_panopto_videos`, `embed_panopto_video`, `fetch_panopto_captions` (lines ~225-262).
- Their `CallTool` handler cases.

- [ ] **Step 2: Remove `PanoptoConfig` from CDS `types.ts`**

Delete the `PanoptoConfig` interface from `packages/canvas-design-studio/src/types.ts`. Search CDS for any remaining `PanoptoConfig` references:
```bash
git grep -n "PanoptoConfig" packages/canvas-design-studio
```
Expected: no results after deletion (all Panopto code already moved in Phase 1).

- [ ] **Step 3: Confirm no orphan references**

```bash
git grep -n "panopto" packages/canvas-design-studio/src
```
Expected: no results (case-insensitive check: `git grep -ni panopto packages/canvas-design-studio/src`).

- [ ] **Step 4: Build + test CDS**

Run: `npm run build --workspace=canvas-design-mcp && npm test --workspace=canvas-design-mcp`
Expected: clean build; all remaining CDS tests pass (Panopto tests already moved out).

- [ ] **Step 5: Commit**

```bash
git add packages/canvas-design-studio
git commit -m "refactor(modules): remove Panopto from canvas-design-studio (now in module-video) (#78)"
```

---

## Phase 5 — Installer wiring

### Task 17: Installer writes `modules.json` from the workflow selection

**Files:**
- Create: `installer/tasks/write_modules_manifest.go`
- Create: `installer/tasks/write_modules_manifest_test.go`
- Modify: `installer/screens/install.go`

- [ ] **Step 1: Write the failing Go test**

`installer/tasks/write_modules_manifest_test.go`:
```go
package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteModulesManifestEnablesVideo(t *testing.T) {
	dir := t.TempDir()
	if err := WriteModulesManifest(dir, true); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "modules.json"))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var m struct {
		Modules map[string]struct {
			Enabled        bool   `json:"enabled"`
			ActiveProvider string `json:"activeProvider"`
		} `json:"modules"`
	}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !m.Modules["video"].Enabled || m.Modules["video"].ActiveProvider != "panopto" {
		t.Fatalf("video not enabled with panopto provider: %+v", m.Modules["video"])
	}
}

func TestWriteModulesManifestDisablesVideo(t *testing.T) {
	dir := t.TempDir()
	if err := WriteModulesManifest(dir, false); err != nil {
		t.Fatalf("WriteModulesManifest: %v", err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "modules.json"))
	var m struct {
		Modules map[string]struct {
			Enabled bool `json:"enabled"`
		} `json:"modules"`
	}
	_ = json.Unmarshal(data, &m)
	if m.Modules["video"].Enabled {
		t.Fatalf("video should be disabled")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `installer/`): `go test ./tasks/ -run TestWriteModulesManifest`
Expected: FAIL — `WriteModulesManifest` undefined.

- [ ] **Step 3: Write the implementation**

`installer/tasks/write_modules_manifest.go`:
```go
package tasks

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type moduleEntry struct {
	Enabled        bool   `json:"enabled"`
	ActiveProvider string `json:"activeProvider,omitempty"`
}

type modulesManifest struct {
	Modules map[string]moduleEntry `json:"modules"`
}

// WriteModulesManifest writes ~/.command-and-control/modules.json describing which
// plug-in modules are enabled. ccHome is the config directory; videoEnabled toggles
// the Lecture Video module (Panopto provider).
func WriteModulesManifest(ccHome string, videoEnabled bool) error {
	entry := moduleEntry{Enabled: videoEnabled}
	if videoEnabled {
		entry.ActiveProvider = "panopto"
	}
	m := modulesManifest{Modules: map[string]moduleEntry{"video": entry}}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(ccHome, 0o700); err != nil {
		return err
	}
	tmp := filepath.Join(ccHome, "modules.json.tmp")
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(ccHome, "modules.json"))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `installer/`): `go test ./tasks/ -run TestWriteModulesManifest`
Expected: PASS (2 tests).

- [ ] **Step 5: Call it from the install screen**

In `installer/screens/install.go`, add an install step that resolves the C&C home (the same `~/.command-and-control` path the installer already uses for config — locate the existing helper; if none, use `filepath.Join(userHomeDir, ".command-and-control")`) and calls:
```go
if err := tasks.WriteModulesManifest(ccHome, st.WorkflowPanopto); err != nil {
    return err
}
```
Add it as a named step row (e.g. "Write module manifest", `Warn: true`) alongside the existing steps. `st.WorkflowPanopto` is the existing workflow-selector boolean.

- [ ] **Step 6: Build the installer + run installer tests**

Run (from `installer/`): `go build -o D:\tmp\ct-installer-smoke.exe . && go test ./...`
Expected: build clean; all Go tests pass.

- [ ] **Step 7: Commit**

```bash
git add installer/tasks/write_modules_manifest.go installer/tasks/write_modules_manifest_test.go installer/screens/install.go
git commit -m "feat(installer): write modules.json from Video/Panopto workflow selection (#78)"
```

---

## Phase 6 — Integration verification

### Task 18: Full monorepo green + manifest enable/disable e2e

**Files:**
- Test: `packages/command-and-control/tests/modules/e2e.test.ts`

- [ ] **Step 1: Write the e2e test**

`packages/command-and-control/tests/modules/e2e.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModules } from '../../src/modules/registry.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-e2e-')); process.env.CC_HOME = dir; });
afterEach(() => { delete process.env.CC_HOME; rmSync(dir, { recursive: true, force: true }); });

describe('module enable/disable e2e', () => {
  it('disabled → core only (no video_* names); enabled → video_* present', async () => {
    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: false } } }));
    expect((await loadModules()).tools.map((t) => t.name)).not.toContain('video_embed');

    writeFileSync(join(dir, 'modules.json'), JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }));
    const names = (await loadModules()).tools.map((t) => t.name);
    expect(names).toContain('video_search');
    expect(names).toContain('fetch_panopto_captions'); // alias still served
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `npm test --workspace=command-and-control-mcp -- modules/e2e`
Expected: PASS.

- [ ] **Step 3: Full monorepo build**

Run (repo root): `npm run build`
Expected: all packages compile (module-contract, module-video, shared-*, CI, CDS, C&C).

- [ ] **Step 4: Full monorepo test**

Run (repo root): `npm test`
Expected: all workspace suites pass. Net test count should be ≥ the pre-refactor baseline (moved tests + new registry/manifest/tools/e2e tests). No Panopto test lost.

- [ ] **Step 5: C&C integration smoke**

Run: `npm run smoke:integration --workspace=command-and-control-mcp`
Expected: PASS — fixture pipeline unaffected by the extraction.

- [ ] **Step 6: Installer suite**

Run (from `installer/`): `go vet ./... && go test ./...`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/command-and-control/tests/modules/e2e.test.ts
git commit -m "test(modules): module enable/disable e2e; full monorepo green (#78)"
```

---

## Self-review notes (for the executor)

- **Workspace package names:** verify the exact `name` field in each package.json before using `--workspace=` flags. The plan assumes C&C = `command-and-control-mcp`, CDS = `canvas-design-mcp`, CI = `curriculum-intelligence-mcp`. Substitute actuals if different.
- **Build order:** module-contract → module-video → C&C. The registry test needs module-video's `dist/`. Run `npm run build` at the root, or build leaf packages before dependents.
- **Green-at-every-commit caveat:** Tasks 4 and 14 intentionally leave the tree non-building until their paired cleanup (Task 16 / Task 15). If you require every commit to build, fold the paired deletions into the same commit. The plan groups moves first for reviewability; either order is acceptable as long as the phase ends green.
- **Aliases are temporary:** the `*_panopto_*` aliases ship deprecated for one version (spec decision A). A future issue removes them.
- **No behavior change:** every moved test must pass unmodified except for import paths. If a moved test needs logic changes to pass, stop — that signals the move altered behavior.
