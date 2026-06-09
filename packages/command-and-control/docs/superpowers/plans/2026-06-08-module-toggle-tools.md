# Module Toggle Tools Implementation Plan (#94)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two always-on C&C tools — `set_module_enabled` and `list_modules` — so professors can toggle plug-in modules after install without hand-editing `modules.json`.

**Architecture:** Mirror the existing `set_active_llm_provider` tool exactly (atomic 0o600 tmp+rename write, `{ok}|{ok:false,error,message,fix}` result shape, `CC_HOME`-override tests). Manifest read/write helpers live in `src/modules/manifest.ts`; the known-module id list comes from `src/modules/registry.ts`. Both tools register as core cases in the `index.ts` switch (never module-gated).

**Tech Stack:** TypeScript (NodeNext ESM), vitest, `@canvas-toolchain/module-contract` types.

**Spec:** `packages/command-and-control/docs/superpowers/specs/2026-06-08-module-toggle-tools-design.md`

---

## Task 1: Manifest writer + path helper

**Files:**
- Modify: `packages/command-and-control/src/modules/manifest.ts`
- Test: `packages/command-and-control/tests/modules/manifest.test.ts`

Adds an atomic writer alongside the existing tolerant reader so both tools share one I/O path.

- [ ] **Step 1: Write the failing test**

Create `packages/command-and-control/tests/modules/manifest.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { loadModuleManifest, saveModuleManifest, getModulesManifestPath } from '../../src/modules/manifest.js';

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

describe('saveModuleManifest', () => {
  it('writes modules.json that loadModuleManifest reads back', () => {
    const manifest = { modules: { video: { enabled: true, activeProvider: 'panopto' } } };
    const path = saveModuleManifest(manifest);
    expect(path).toBe(getModulesManifestPath());
    expect(loadModuleManifest()).toEqual(manifest);
  });

  it('writes 0o600 on non-windows', () => {
    const path = saveModuleManifest({ modules: {} });
    if (platform() !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  it('overwrites an existing (even corrupt) file', () => {
    writeFileSync(getModulesManifestPath(), 'not json');
    saveModuleManifest({ modules: { video: { enabled: false } } });
    expect(loadModuleManifest()).toEqual({ modules: { video: { enabled: false } } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/command-and-control -- manifest.test`
Expected: FAIL — `saveModuleManifest` / `getModulesManifestPath` not exported.

- [ ] **Step 3: Implement**

Edit `packages/command-and-control/src/modules/manifest.ts` to add (keep the existing `loadModuleManifest` unchanged, add the `mkdirSync/renameSync/writeFileSync` imports):

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleManifest } from '@canvas-toolchain/module-contract';
import { getCcHomePath } from '../kb/config.js';

/** Absolute path to ~/.command-and-control/modules.json. */
export function getModulesManifestPath(): string {
  return join(getCcHomePath(), 'modules.json');
}

/** Read ~/.command-and-control/modules.json; tolerate missing/corrupt by returning empty. */
export function loadModuleManifest(): ModuleManifest {
  const path = getModulesManifestPath();
  if (!existsSync(path)) return { modules: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ModuleManifest;
    return parsed.modules ? parsed : { modules: {} };
  } catch {
    return { modules: {} };
  }
}

/** Atomically write modules.json (tmp + rename, 0o600). Returns the path written. */
export function saveModuleManifest(manifest: ModuleManifest): string {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const path = getModulesManifestPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/command-and-control -- manifest.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/modules/manifest.ts packages/command-and-control/tests/modules/manifest.test.ts
git commit -m "feat(modules): atomic saveModuleManifest + getModulesManifestPath (#94)"
```

---

## Task 2: Expose known module ids from the registry

**Files:**
- Modify: `packages/command-and-control/src/modules/registry.ts`
- Test: `packages/command-and-control/tests/modules/registry.test.ts` (add to existing file if present; else create)

`set_module_enabled` validates against known ids and `list_modules` iterates them — both need the id set without duplicating the `KNOWN_MODULES` map.

- [ ] **Step 1: Write the failing test**

Add to `packages/command-and-control/tests/modules/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { knownModuleIds, KNOWN_MODULES } from '../../src/modules/registry.js';

describe('knownModuleIds', () => {
  it('returns the ids of the known-module map', () => {
    expect(knownModuleIds()).toEqual(Object.keys(KNOWN_MODULES));
  });
  it('includes video', () => {
    expect(knownModuleIds()).toContain('video');
  });
  it('honors an injected known map', () => {
    expect(knownModuleIds({ foo: async () => ({} as never) })).toEqual(['foo']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/command-and-control -- registry.test`
Expected: FAIL — `knownModuleIds` / `KNOWN_MODULES` not exported.

- [ ] **Step 3: Implement**

In `packages/command-and-control/src/modules/registry.ts`, change the `KNOWN_MODULES` declaration from `const` to an exported const, and add the helper below it:

```ts
/** Static registry of known modules. Future runtime-loading swaps this map for dynamic import. */
export const KNOWN_MODULES: Record<string, () => Promise<CanvasToolchainModule>> = {
  video: async () => (await import('@canvas-toolchain/module-video')).default,
};

/** Ids of all known modules (whether enabled or not). */
export function knownModuleIds(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
): string[] {
  return Object.keys(known);
}
```

Leave `loadModules` and its `known = KNOWN_MODULES` default parameter as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/command-and-control -- registry.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/modules/registry.ts packages/command-and-control/tests/modules/registry.test.ts
git commit -m "feat(modules): export KNOWN_MODULES + knownModuleIds() (#94)"
```

---

## Task 3: `set_module_enabled` tool

**Files:**
- Create: `packages/command-and-control/src/tools/set_module_enabled.ts`
- Test: `packages/command-and-control/tests/tools/set_module_enabled.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/command-and-control/tests/tools/set_module_enabled.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { setModuleEnabled } from '../../src/tools/set_module_enabled.js';

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

const manifestPath = () => join(ccHomeDir, 'modules.json');

describe('setModuleEnabled', () => {
  it('enables a known module and writes modules.json', async () => {
    const result = await setModuleEnabled({ module: 'video', enabled: true });
    expect(result.ok).toBe(true);
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.video.enabled).toBe(true);
    if (platform() !== 'win32') {
      expect(statSync(manifestPath()).mode & 0o777).toBe(0o600);
    }
  });

  it('records activeProvider when supplied', async () => {
    const result = await setModuleEnabled({ module: 'video', enabled: true, activeProvider: 'panopto' });
    expect(result.ok).toBe(true);
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.video.activeProvider).toBe('panopto');
  });

  it('disables a module', async () => {
    await setModuleEnabled({ module: 'video', enabled: true });
    const result = await setModuleEnabled({ module: 'video', enabled: false });
    expect(result.ok).toBe(true);
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.video.enabled).toBe(false);
  });

  it('preserves sibling module entries on write', async () => {
    writeFileSync(manifestPath(), JSON.stringify({ modules: { other: { enabled: true } } }));
    await setModuleEnabled({ module: 'video', enabled: true });
    const written = JSON.parse(readFileSync(manifestPath(), 'utf-8'));
    expect(written.modules.other).toEqual({ enabled: true });
    expect(written.modules.video.enabled).toBe(true);
  });

  it('returns UNKNOWN_MODULE for an unknown id and writes nothing', async () => {
    const result = await setModuleEnabled({ module: 'nope', enabled: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('UNKNOWN_MODULE');
    expect(existsSync(manifestPath())).toBe(false);
  });

  it('returns INVALID_ENABLED for a non-boolean enabled', async () => {
    const result = await setModuleEnabled({ module: 'video', enabled: 'yes' as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INVALID_ENABLED');
    expect(existsSync(manifestPath())).toBe(false);
  });

  it('tolerates a pre-existing corrupt manifest', async () => {
    writeFileSync(manifestPath(), 'not json');
    const result = await setModuleEnabled({ module: 'video', enabled: true });
    expect(result.ok).toBe(true);
    expect(JSON.parse(readFileSync(manifestPath(), 'utf-8')).modules.video.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/command-and-control -- set_module_enabled`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/command-and-control/src/tools/set_module_enabled.ts`:

```ts
import { knownModuleIds } from '../modules/registry.js';
import { loadModuleManifest, saveModuleManifest } from '../modules/manifest.js';

export interface SetModuleEnabledInput {
  module: string;
  enabled: boolean;
  activeProvider?: string;
}

export type SetModuleEnabledResult =
  | { ok: true; module: string; enabled: boolean; activeProvider?: string; note: string }
  | { ok: false; error: string; message: string; fix: string[] };

const RESTART_NOTE =
  'Modules load at server startup. Reconnect or restart your MCP client for this change to take effect.';

export async function setModuleEnabled(input: SetModuleEnabledInput): Promise<SetModuleEnabledResult> {
  if (typeof input.enabled !== 'boolean') {
    return {
      ok: false,
      error: 'INVALID_ENABLED',
      message: `'enabled' must be a boolean, got '${String(input.enabled)}'`,
      fix: ["Pass enabled: true or enabled: false"],
    };
  }

  const ids = knownModuleIds();
  if (!ids.includes(input.module)) {
    return {
      ok: false,
      error: 'UNKNOWN_MODULE',
      message: `Unknown module '${String(input.module)}'`,
      fix: [`Valid modules: ${ids.join(', ')}`],
    };
  }

  const manifest = loadModuleManifest();
  const entry: { enabled: boolean; activeProvider?: string } = { enabled: input.enabled };
  if (input.activeProvider !== undefined) entry.activeProvider = input.activeProvider;
  manifest.modules[input.module] = entry;
  saveModuleManifest(manifest);

  return {
    ok: true,
    module: input.module,
    enabled: input.enabled,
    ...(input.activeProvider !== undefined ? { activeProvider: input.activeProvider } : {}),
    note: RESTART_NOTE,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/command-and-control -- set_module_enabled`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/set_module_enabled.ts packages/command-and-control/tests/tools/set_module_enabled.test.ts
git commit -m "feat(modules): set_module_enabled tool — post-install module toggle (#94)"
```

---

## Task 4: `list_modules` tool

**Files:**
- Create: `packages/command-and-control/src/tools/list_modules.ts`
- Test: `packages/command-and-control/tests/tools/list_modules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/command-and-control/tests/tools/list_modules.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listModules } from '../../src/tools/list_modules.js';

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

describe('listModules', () => {
  it('lists the real video module as disabled when no manifest', async () => {
    const mods = await listModules();
    const video = mods.find((m) => m.id === 'video');
    expect(video).toBeDefined();
    expect(video!.enabled).toBe(false);
    expect(video!.name.length).toBeGreaterThan(0);
    expect(Array.isArray(video!.handles)).toBe(true);
  });

  it('reflects enabled + activeProvider from the manifest', async () => {
    writeFileSync(
      join(ccHomeDir, 'modules.json'),
      JSON.stringify({ modules: { video: { enabled: true, activeProvider: 'panopto' } } }),
    );
    const video = (await listModules()).find((m) => m.id === 'video')!;
    expect(video.enabled).toBe(true);
    expect(video.activeProvider).toBe('panopto');
  });

  it('is fail-soft: a throwing loader yields a loadError entry, not a throw', async () => {
    const known = {
      broken: async () => {
        throw new Error('boom');
      },
    };
    const mods = await listModules(known as never);
    const broken = mods.find((m) => m.id === 'broken')!;
    expect(broken.loadError).toContain('boom');
    expect(broken.name).toBe('broken');
    expect(broken.handles).toEqual([]);
    expect(broken.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace packages/command-and-control -- list_modules`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/command-and-control/src/tools/list_modules.ts`:

```ts
import { isCanvasToolchainModule, type CanvasToolchainModule } from '@canvas-toolchain/module-contract';
import { KNOWN_MODULES } from '../modules/registry.js';
import { loadModuleManifest } from '../modules/manifest.js';

export interface ModuleInfo {
  id: string;
  name: string;
  enabled: boolean;
  activeProvider?: string;
  handles: string[];
  loadError?: string;
}

/** Report every known module's id/name/enabled/activeProvider/handles, fail-soft per module. */
export async function listModules(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
): Promise<ModuleInfo[]> {
  const manifest = loadModuleManifest();
  const out: ModuleInfo[] = [];

  for (const [id, loader] of Object.entries(known)) {
    const entry = manifest.modules[id];
    const enabled = entry?.enabled ?? false;
    const activeProvider = entry?.activeProvider;
    try {
      const mod = await loader();
      if (!isCanvasToolchainModule(mod)) {
        out.push({ id, name: id, enabled, activeProvider, handles: [], loadError: 'failed module contract' });
        continue;
      }
      out.push({ id, name: mod.name, enabled, activeProvider, handles: mod.handles ?? [] });
    } catch (err) {
      out.push({
        id,
        name: id,
        enabled,
        activeProvider,
        handles: [],
        loadError: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace packages/command-and-control -- list_modules`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/command-and-control/src/tools/list_modules.ts packages/command-and-control/tests/tools/list_modules.test.ts
git commit -m "feat(modules): list_modules tool — report known modules + state (#94)"
```

---

## Task 5: Register both tools in the MCP server

**Files:**
- Modify: `packages/command-and-control/src/index.ts`

Registers the two tools as **core** (always-on) entries — schemas in the ListTools array and cases in the CallTool switch, next to `set_active_llm_provider`.

- [ ] **Step 1: Add imports**

Near the other tool imports (e.g. after the `set_active_llm_provider` import around line 24):

```ts
import { setModuleEnabled } from './tools/set_module_enabled.js';
import { listModules } from './tools/list_modules.js';
```

- [ ] **Step 2: Add tool schemas**

In the ListTools array, immediately after the `set_active_llm_provider` schema object (closes at line ~195), insert:

```ts
    {
      name: 'set_module_enabled',
      description:
        'Enable or disable a plug-in module (e.g. video) by writing modules.json. ' +
        'Always available so a disabled module can be re-enabled. Takes effect after the MCP client reconnects/restarts.',
      inputSchema: {
        type: 'object' as const,
        required: ['module', 'enabled'],
        properties: {
          module: { type: 'string', description: "Module id, e.g. 'video'. Use list_modules to see valid ids." },
          enabled: { type: 'boolean', description: 'true to enable, false to disable.' },
          activeProvider: { type: 'string', description: "Optional provider id for the module, e.g. 'panopto'." },
        },
      },
    },
    {
      name: 'list_modules',
      description:
        'List all known plug-in modules with their id, name, enabled state, active provider, and the provider/tool types they handle.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
```

- [ ] **Step 3: Add switch cases**

In the CallTool switch, after the `set_active_llm_provider` case (line ~687), insert:

```ts
      case 'set_module_enabled':
        result = await setModuleEnabled(args as unknown as Parameters<typeof setModuleEnabled>[0]);
        break;
      case 'list_modules':
        result = await listModules();
        break;
```

- [ ] **Step 4: Verify build + the result wrapper**

Confirm the generic `result` is JSON-wrapped into a `CallToolResult` by the existing tail of the switch (same as `set_active_llm_provider`). No special-casing needed.

Run: `npm run build --workspace packages/command-and-control`
Expected: clean compile.

- [ ] **Step 5: Smoke the tool list**

Run: `npm run smoke:integration --workspace packages/command-and-control`
Expected: PASS (server constructs, no registration errors).

- [ ] **Step 6: Commit**

```bash
git add packages/command-and-control/src/index.ts
git commit -m "feat(modules): register set_module_enabled + list_modules as core tools (#94)"
```

---

## Task 6: Docs + handoff

**Files:**
- Modify: `packages/command-and-control/CLAUDE.md` (Implemented list)
- Modify: `AGENTS.md` (status line / module section)

- [ ] **Step 1: CLAUDE.md** — add to the Implemented bullet list:

```markdown
- `set_module_enabled` MCP tool — atomic 0o600 write to `~/.command-and-control/modules.json`. Enables/disables a plug-in module post-install (the in-product path that #78's config-time installer checkbox lacked). Always-on so a disabled module can be re-enabled. Takes effect on next client reconnect/restart.
- `list_modules` MCP tool — reports each known module's id/name/enabled/activeProvider/handles. Read-only; also feeds #76 discovery.
```

- [ ] **Step 2: AGENTS.md** — note #94 shipped in the v2.0 / module section (one or two lines, matching the existing style of the #78 entry).

- [ ] **Step 3: Commit**

```bash
git add packages/command-and-control/CLAUDE.md AGENTS.md
git commit -m "docs(modules): document set_module_enabled + list_modules; #94 shipped"
```

---

## Final verification (after all tasks)

```bash
npm run build
npm test
npm run smoke:integration --workspace packages/command-and-control
```

Expected: build clean across packages; full suite green (existing 1468 + ~16 new); smoke green.
Then dispatch a final whole-implementation review.
