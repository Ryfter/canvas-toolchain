# MCP Tool Surface Consolidation — Core Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 97-tool flat MCP surface of `packages/command-and-control` with 9 workflow-intent tools plus a `ct_advanced` sidecar, driven by a single operation registry, without changing any handler logic.

**Architecture:** Every operation (core and module) is registered once in `src/surface/registry.ts` with an `exposure` field of `intent | advanced | internal`. `tools/list` and `tools/call` are *derived* from that registry rather than hand-written. Handlers are untouched — registry entries point at the functions already exported from `src/tools/` and `src/passthrough/`. Existing 1.x modules are bridged by an adapter until Plan 2 introduces `module-contract` 2.0.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), `@modelcontextprotocol/sdk` 1.30.0, vitest 3.2.6, Node ≥ 20.

**Spec:** `docs/superpowers/specs/2026-08-26-mcp-tool-consolidation-design.md`

## Global Constraints

- Node ≥ 20; TypeScript ESM — **every relative import must carry the `.js` extension** (e.g. `from './registry.js'`), matching the existing codebase.
- Handler logic is **not** modified. Tasks may only re-address handlers, never rewrite them.
- **No operation may be deleted.** The disposition table in the spec is authoritative: 52 `merge`, 42 `demote`, 3 `internal`, 0 `delete`.
- The three `internal` operations are exactly: `reembed_course_index`, `map_transcripts_to_weeks`, `snapshot_course`. No others.
- `taskCategory` (`'none' | 'fast' | 'judgment'` from `src/types.ts`) must survive onto every registry entry. It drives fast-vs-judgment LLM routing.
- A broken module must never crash the host — preserve the existing fail-soft behaviour in `src/modules/registry.ts:110-133`.
- Tests live in `tests/*.test.ts` (vitest `include: ['tests/**/*.test.ts']`).
- Do not create `src/registry/` — that path exists and means the *resource* registry. Use `src/surface/`.
- Run `npm test` from `packages/command-and-control`. Run `npm run build` before any commit that changes types.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/surface/operation.ts` | The `Operation` type, `IntentToolId`, `SectionId`. Types only. |
| `src/surface/sections.ts` | The 8 advanced section ids and their one-line descriptions. |
| `src/surface/registry.ts` | `buildRegistry()` — every core operation with its exposure. |
| `src/surface/module_adapter.ts` | Wraps 1.x `ModuleTool[]` into `Operation[]` under a per-module section. |
| `src/surface/intents/*.ts` | One file per intent tool: its MCP schema + action→operation map. |
| `src/surface/advanced.ts` | `ct_advanced` schema + `describe`/`run` behaviour. |
| `src/surface/list_tools.ts` | Derives the `tools/list` payload from the registry. |
| `src/surface/dispatch.ts` | Routes a `tools/call` name+args to a registry handler. |
| `src/index.ts` | Thin wiring only. Target ~100 lines. |

---

### Task 1: Operation and section types

**Files:**
- Create: `packages/command-and-control/src/surface/operation.ts`
- Create: `packages/command-and-control/src/surface/sections.ts`
- Test: `packages/command-and-control/tests/surface-sections.test.ts`

**Interfaces:**
- Consumes: `TaskCategory` from `src/types.ts`.
- Produces: `Operation`, `IntentToolId`, `SectionId`, `SECTIONS`, `SECTION_IDS`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/surface-sections.test.ts
import { describe, expect, it } from 'vitest';
import { SECTIONS, SECTION_IDS } from '../src/surface/sections.js';

describe('advanced sections', () => {
  it('defines exactly the eight sections from the spec', () => {
    expect([...SECTION_IDS].sort()).toEqual([
      'accessibility', 'admin', 'design', 'modules',
      'registry', 'research', 'snapshots', 'transcripts',
    ]);
  });

  it('gives every section a non-empty description', () => {
    for (const id of SECTION_IDS) {
      expect(SECTIONS[id].description.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-sections`
Expected: FAIL — cannot resolve `../src/surface/sections.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/surface/operation.ts
import type { TaskCategory } from '../types.js';

export type IntentToolId =
  | 'ct_setup' | 'ct_import' | 'ct_inspect' | 'ct_analyze' | 'ct_plan'
  | 'ct_build' | 'ct_review' | 'ct_publish' | 'ct_ask';

export type SectionId =
  | 'modules' | 'registry' | 'transcripts' | 'research'
  | 'accessibility' | 'snapshots' | 'design' | 'admin';

export type Exposure = 'intent' | 'advanced' | 'internal';

export interface Operation {
  /** Unique across core and module operations. Module ops are host-namespaced. */
  id: string;
  section: SectionId;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => unknown | Promise<unknown>;
  taskCategory: TaskCategory;
  exposure: Exposure;
  /** Required when exposure === 'intent'. */
  intentTool?: IntentToolId;
  intentAction?: string;
}
```

```ts
// src/surface/sections.ts
import type { SectionId } from './operation.js';

export const SECTIONS: Record<SectionId, { description: string }> = {
  modules:       { description: 'Plug-in module discovery, install, enable/disable.' },
  registry:      { description: 'Resource registry: search, install, uninstall, lockfiles.' },
  transcripts:   { description: 'Transcript enrichment, comparison, and week mapping.' },
  research:      { description: 'News feeds, recent developments, quote banks, calendars.' },
  accessibility: { description: 'Deep accessibility checks beyond the standard audit.' },
  snapshots:     { description: 'Publish snapshot listing and pruning.' },
  design:        { description: 'Canvas pattern catalog, previews, layout templates.' },
  admin:         { description: 'Institution profile, dashboard, feedback, defaults.' },
};

export const SECTION_IDS = Object.keys(SECTIONS) as SectionId[];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surface-sections`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/operation.ts src/surface/sections.ts tests/surface-sections.test.ts
git commit -m "feat(surface): add Operation type and advanced section definitions"
```

---

### Task 2: Registry skeleton and the parity harness

Builds the registry with a handful of real entries plus the test that will police completeness for the rest of the plan. The parity test is deliberately written *before* the bulk data exists, so Task 3 has a target to satisfy.

**Files:**
- Create: `packages/command-and-control/src/surface/registry.ts`
- Test: `packages/command-and-control/tests/surface-registry.test.ts`

**Interfaces:**
- Consumes: `Operation` (Task 1).
- Produces: `buildRegistry(): Map<string, Operation>`, `CORE_OPERATIONS: Operation[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/surface-registry.test.ts
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/surface/registry.js';

const INTERNAL_ALLOWLIST = [
  'map_transcripts_to_weeks', 'reembed_course_index', 'snapshot_course',
];

describe('operation registry', () => {
  it('has no duplicate ids', () => {
    const reg = buildRegistry();
    const ids = [...reg.values()].map((o) => o.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  // Subset, not equality: Task 2 registers zero internal operations, so an
  // equality assertion would fail here. Task 3 adds the exact-equality check
  // once all 82 operations exist.
  it('never marks an operation internal outside the allowlist', () => {
    const reg = buildRegistry();
    const internal = [...reg.values()].filter((o) => o.exposure === 'internal').map((o) => o.id);
    for (const id of internal) expect(INTERNAL_ALLOWLIST).toContain(id);
  });

  it('gives every intent operation both a tool and an action', () => {
    const reg = buildRegistry();
    for (const op of reg.values()) {
      if (op.exposure !== 'intent') continue;
      expect(op.intentTool, `${op.id} missing intentTool`).toBeTruthy();
      expect(op.intentAction, `${op.id} missing intentAction`).toBeTruthy();
    }
  });

  it('gives every operation a callable handler', () => {
    for (const op of buildRegistry().values()) {
      expect(typeof op.handler, `${op.id} handler`).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-registry`
Expected: FAIL — cannot resolve `../src/surface/registry.js`.

- [ ] **Step 3: Write the implementation with the first four entries**

Import the handlers that already exist; do not rewrite them.

```ts
// src/surface/registry.ts
import type { Operation } from './operation.js';
import { setupCc } from '../tools/setup_cc.js';
import { setupAnthropic } from '../tools/setup_anthropic.js';
import { setupCanvas } from '../tools/setup_canvas.js';
import { setupOllama } from '../tools/setup_ollama.js';

export const CORE_OPERATIONS: Operation[] = [
  {
    id: 'setup_cc',
    section: 'admin',
    description: 'Configure Command & Control: mode, models, routing preferences.',
    inputSchema: { type: 'object', properties: {} },
    handler: (args) => setupCc(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'cc',
  },
  {
    id: 'setup_anthropic',
    section: 'admin',
    description: 'Configure and validate the Anthropic API key.',
    inputSchema: { type: 'object', required: ['apiKey'], properties: {} },
    handler: (args) => setupAnthropic(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'anthropic',
  },
  {
    id: 'setup_canvas',
    section: 'admin',
    description: 'Configure and validate the Canvas LMS host and API token.',
    inputSchema: { type: 'object', required: ['host', 'token'], properties: {} },
    handler: (args) => setupCanvas(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'canvas',
  },
  {
    id: 'setup_ollama',
    section: 'admin',
    description: 'Configure the Ollama base URL and model.',
    inputSchema: { type: 'object', properties: {} },
    handler: (args) => setupOllama(args as never),
    taskCategory: 'none',
    exposure: 'intent',
    intentTool: 'ct_setup',
    intentAction: 'ollama',
  },
];

export function buildRegistry(): Map<string, Operation> {
  const reg = new Map<string, Operation>();
  for (const op of CORE_OPERATIONS) {
    if (reg.has(op.id)) throw new Error(`duplicate operation id: ${op.id}`);
    reg.set(op.id, op);
  }
  return reg;
}
```

**Note on `inputSchema`:** copy each schema verbatim from its current definition in `src/index.ts` or the relevant `src/passthrough/*.ts`. The abbreviated `properties: {}` above is only to keep this plan readable — an entry that drops real properties is a bug the Task 3 parity test will not catch, so copy carefully.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surface-registry`
Expected: PASS (4 tests). The internal-allowlist test is a subset check, so it holds with zero internal operations; Task 3 tightens it to equality.

- [ ] **Step 5: Commit**

```bash
git add src/surface/registry.ts tests/surface-registry.test.ts
git commit -m "feat(surface): add operation registry skeleton and invariant tests"
```

---

### Task 3: Populate all 97 core operations

The bulk data-entry task. The spec's disposition table is the input; the parity test is the acceptance gate.

**Files:**
- Modify: `packages/command-and-control/src/surface/registry.ts`
- Test: `packages/command-and-control/tests/surface-parity.test.ts`

**Interfaces:**
- Consumes: `Operation` (Task 1), `CORE_OPERATIONS` (Task 2).
- Produces: a `CORE_OPERATIONS` array covering every core tool.

- [ ] **Step 1: Write the failing parity test**

This test reads the *current* tool surface out of the source files, so it cannot drift from reality.

```ts
// tests/surface-parity.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../src/surface/registry.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function namesIn(relPath: string, indent: string): string[] {
  const src = readFileSync(join(pkgDir, relPath), 'utf8');
  const re = new RegExp(`^${indent}name: '([a-z_0-9]+)'`, 'gm');
  return [...src.matchAll(re)].map((m) => m[1]);
}

/** Every tool the server exposes today, from source. */
function currentCoreTools(): string[] {
  return [
    ...namesIn('src/index.ts', '      '),
    ...namesIn('src/passthrough/ci_tools.ts', '    '),
    ...namesIn('src/passthrough/downloader_tools.ts', '    '),
    ...namesIn('src/passthrough/design_tools.ts', '    '),
  ];
}

describe('registry parity with the current surface', () => {
  it('registers every tool that exists today', () => {
    const reg = buildRegistry();
    // `list_modules` is registered twice today with two distinct meanings; the
    // registry splits them into `list_modules` (plug-ins) and
    // `list_canvas_modules` (Canvas course modules).
    const expected = new Set(currentCoreTools());
    expected.delete('list_modules');
    const missing = [...expected].filter((n) => !reg.has(n));
    expect(missing, `not in registry: ${missing.join(', ')}`).toEqual([]);
    expect(reg.has('list_modules')).toBe(true);
    expect(reg.has('list_canvas_modules')).toBe(true);
  });

  it('registers 82 core operations', () => {
    expect(buildRegistry().size).toBe(82);
  });

  it('marks internal exactly the three pre-approved operations', () => {
    const internal = [...buildRegistry().values()]
      .filter((o) => o.exposure === 'internal')
      .map((o) => o.id);
    expect(internal.sort()).toEqual([
      'map_transcripts_to_weeks', 'reembed_course_index', 'snapshot_course',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-parity`
Expected: FAIL — `not in registry: show_canvas_capabilities, preview_canvas_pattern, ...` and `expected 4 to be 82`.

- [ ] **Step 3: Add the remaining entries**

Work through the spec's disposition table section by section. For each row, add one entry following the Task 2 shape:

- `verb = merge` → `exposure: 'intent'`, with `intentTool`/`intentAction` from the `ct_xxx:action` destination.
- `verb = demote` → `exposure: 'advanced'`, `section` from the `advanced:section` destination, no `intentTool`.
- `verb = internal` → `exposure: 'internal'`, no `intentTool`. Only the three allow-listed ids.

Two entries need care:

```ts
// The inline list_modules — toolchain plug-ins (index.ts:231)
{
  id: 'list_modules',
  section: 'modules',
  description: 'List plug-in modules with id, name, enabled state, and active provider.',
  inputSchema: { type: 'object', properties: {} },
  handler: () => listModules(),
  taskCategory: 'none',
  exposure: 'advanced',
},
// The ci_tools list_modules — Canvas course modules (ci_tools.ts:111).
// RENAMED: this capability is currently unreachable because the switch at
// index.ts:905 shadows it. The rename is what restores it.
{
  id: 'list_canvas_modules',
  section: 'admin',
  description: 'List Canvas modules for a course/semester. Pass expandItems=true for item details.',
  inputSchema: {
    type: 'object',
    required: ['courseId', 'semesterId'],
    properties: {
      courseId: { type: 'string' },
      semesterId: { type: 'string' },
      expandItems: { type: 'boolean' },
    },
  },
  handler: (args) => listCanvasModules(args as never),
  taskCategory: 'none',
  exposure: 'intent',
  intentTool: 'ct_inspect',
  intentAction: 'canvas_modules',
},
```

Import the second handler from its existing location — `CI_TOOLS` in `src/passthrough/ci_tools.ts` holds it under the name `listModules`; alias it on import to avoid a local collision:

```ts
import { listModules as listCanvasModules } from '@canvas-toolchain/curriculum-intelligence/dist/tools/list_modules.js';
```

This task is mechanical and large. It is a good candidate for delegation to a bulk worker, provided the parity test is the acceptance gate and every generated entry's `inputSchema` is diffed against its source definition before commit.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. `surface-parity` reports 82 operations; `surface-registry`'s internal-allowlist test now has real data to check.

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: exit 0, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/surface/registry.ts tests/surface-parity.test.ts
git commit -m "feat(surface): register all 82 core operations with exposure flags"
```

---

### Task 4: Adapter for existing 1.x modules

Keeps the six in-repo modules working until Plan 2 migrates them to `module-contract` 2.0.

**Files:**
- Create: `packages/command-and-control/src/surface/module_adapter.ts`
- Test: `packages/command-and-control/tests/surface-module-adapter.test.ts`

**Interfaces:**
- Consumes: `Operation` (Task 1); `LoadedModules` from `src/modules/registry.ts`.
- Produces: `adaptModuleTools(moduleId: string, tools: ModuleTool[]): Operation[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/surface-module-adapter.test.ts
import { describe, expect, it } from 'vitest';
import { adaptModuleTools } from '../src/surface/module_adapter.js';

const fakeTool = {
  schema: { name: 'fetch_transcripts', description: 'Fetch them.', inputSchema: { type: 'object' } },
  handler: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
};

describe('module adapter', () => {
  it('namespaces the operation id with the module id', () => {
    const [op] = adaptModuleTools('video', [fakeTool as never]);
    expect(op.id).toBe('video.fetch_transcripts');
  });

  it('places module operations in the modules section as advanced', () => {
    const [op] = adaptModuleTools('video', [fakeTool as never]);
    expect(op.section).toBe('modules');
    expect(op.exposure).toBe('advanced');
  });

  it('preserves the original handler', async () => {
    const [op] = adaptModuleTools('video', [fakeTool as never]);
    await expect(op.handler({})).resolves.toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('returns an empty array for a module with no tools', () => {
    expect(adaptModuleTools('roster', [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-module-adapter`
Expected: FAIL — cannot resolve `../src/surface/module_adapter.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/surface/module_adapter.ts
import type { ModuleTool } from '@canvas-toolchain/module-contract';
import type { Operation } from './operation.js';

/**
 * Bridges module-contract 1.x tools onto the operation registry.
 *
 * 1.x modules hand the host finished MCP tools with no section or exposure
 * information, so every one lands in the `modules` section as `advanced`.
 * Plan 2 replaces this with modules declaring their own section and, at most,
 * one promotion. Ids are namespaced by the HOST, never by the module author —
 * that is what structurally prevents the `list_modules` collision class.
 */
export function adaptModuleTools(moduleId: string, tools: ModuleTool[]): Operation[] {
  return tools.map((t) => ({
    id: `${moduleId}.${t.schema.name}`,
    section: 'modules' as const,
    description: t.schema.description ?? `${moduleId} operation.`,
    inputSchema: (t.schema.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
    handler: t.handler,
    taskCategory: 'none' as const,
    exposure: 'advanced' as const,
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surface-module-adapter`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/module_adapter.ts tests/surface-module-adapter.test.ts
git commit -m "feat(surface): bridge module-contract 1.x tools onto the registry"
```

---

### Task 5: The ct_advanced sidecar

**Files:**
- Create: `packages/command-and-control/src/surface/advanced.ts`
- Test: `packages/command-and-control/tests/surface-advanced.test.ts`

**Interfaces:**
- Consumes: `Operation`, `SECTIONS`, `buildRegistry`.
- Produces: `advancedToolSchema(reg): Tool`, `runAdvanced(reg, args): Promise<CallToolResult>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/surface-advanced.test.ts
import { describe, expect, it } from 'vitest';
import { advancedToolSchema, runAdvanced } from '../src/surface/advanced.js';
import { buildRegistry } from '../src/surface/registry.js';

describe('ct_advanced', () => {
  it('lists section and operation names in its description but no schemas', () => {
    const schema = advancedToolSchema(buildRegistry());
    expect(schema.description).toContain('accessibility');
    expect(schema.description).toContain('wave_deep_check');
    expect(schema.description).not.toContain('inputSchema');
  });

  it('describe with no arguments returns sections and operation names', async () => {
    const res = await runAdvanced(buildRegistry(), { action: 'describe' });
    const body = JSON.parse(res.content[0].text as string);
    expect(Object.keys(body.sections)).toContain('research');
    expect(res.isError).toBeFalsy();
  });

  it('describe with a section returns full schemas for that section', async () => {
    const res = await runAdvanced(buildRegistry(), { action: 'describe', section: 'accessibility' });
    const body = JSON.parse(res.content[0].text as string);
    expect(body.operations.wave_deep_check.inputSchema).toBeDefined();
  });

  it('run on an unknown operation returns a tool error listing valid operations', async () => {
    const res = await runAdvanced(buildRegistry(), { action: 'run', operation: 'nope', params: {} });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(Array.isArray(body.validOperations)).toBe(true);
    expect(body.validOperations.length).toBeGreaterThan(0);
  });

  it('refuses to run an internal operation', async () => {
    const res = await runAdvanced(buildRegistry(), {
      action: 'run', operation: 'reembed_course_index', params: {},
    });
    expect(res.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-advanced`
Expected: FAIL — cannot resolve `../src/surface/advanced.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/surface/advanced.ts
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Operation, SectionId } from './operation.js';
import { SECTIONS, SECTION_IDS } from './sections.js';

type Registry = Map<string, Operation>;

const json = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/** Operations reachable through ct_advanced: everything not on an intent tool
 *  and not internal. */
function advancedOps(reg: Registry): Operation[] {
  return [...reg.values()].filter((o) => o.exposure === 'advanced');
}

/**
 * The description carries section and operation NAMES only — never schemas.
 * That is the whole context saving: names are cheap, schemas are not.
 */
export function advancedToolSchema(reg: Registry): Tool {
  const ops = advancedOps(reg);
  const lines = SECTION_IDS.map((id) => {
    const names = ops.filter((o) => o.section === id).map((o) => o.id);
    return names.length ? `- ${id}: ${SECTIONS[id].description} [${names.join(', ')}]` : null;
  }).filter(Boolean);

  return {
    name: 'ct_advanced',
    description:
      'Less common operations, grouped into sections. Call with action="describe" and a ' +
      'section to get full parameter schemas for that section, then action="run" to execute ' +
      'one. Sections and their operations:\n' + lines.join('\n'),
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['describe', 'run'] },
        section: { type: 'string', enum: SECTION_IDS },
        operation: { type: 'string', description: 'Operation id, required when action="run".' },
        params: { type: 'object', description: 'Arguments for the operation.' },
      },
    },
  };
}

export async function runAdvanced(reg: Registry, rawArgs: unknown): Promise<CallToolResult> {
  const args = (rawArgs ?? {}) as {
    action?: string; section?: SectionId; operation?: string; params?: unknown;
  };
  const ops = advancedOps(reg);

  if (args.action === 'describe') {
    if (args.operation) {
      const op = ops.find((o) => o.id === args.operation);
      if (!op) {
        return json({ error: `Unknown operation: ${args.operation}`,
                      validOperations: ops.map((o) => o.id) }, true);
      }
      return json({ operations: { [op.id]: { description: op.description, inputSchema: op.inputSchema } } });
    }
    if (args.section) {
      const inSection = ops.filter((o) => o.section === args.section);
      return json({
        section: args.section,
        operations: Object.fromEntries(
          inSection.map((o) => [o.id, { description: o.description, inputSchema: o.inputSchema }]),
        ),
      });
    }
    return json({
      sections: Object.fromEntries(SECTION_IDS.map((id) => [id, {
        description: SECTIONS[id].description,
        operations: ops.filter((o) => o.section === id).map((o) => o.id),
      }])),
    });
  }

  if (args.action === 'run') {
    const op = reg.get(args.operation ?? '');
    // Internal operations run as steps inside other operations and are not
    // callable. Report them like any unknown id so the model self-corrects.
    if (!op || op.exposure !== 'advanced') {
      return json({ error: `Unknown or non-callable operation: ${args.operation}`,
                    validOperations: ops.map((o) => o.id) }, true);
    }
    const result = await op.handler(args.params ?? {});
    return json(result);
  }

  return json({ error: `Unknown action: ${args.action}`, validActions: ['describe', 'run'] }, true);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surface-advanced`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/advanced.ts tests/surface-advanced.test.ts
git commit -m "feat(surface): add ct_advanced describe/run sidecar"
```

---

### Task 6: Intent tool schemas and routing

**Files:**
- Create: `packages/command-and-control/src/surface/intents/index.ts`
- Test: `packages/command-and-control/tests/surface-intents.test.ts`

**Interfaces:**
- Consumes: `Operation`, `IntentToolId`, `buildRegistry`.
- Produces: `INTENT_TOOLS: Record<IntentToolId, { summary: string; extendedBy: SectionId }>`, `intentToolSchemas(reg): Tool[]`, `runIntent(reg, toolName, args): Promise<CallToolResult>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/surface-intents.test.ts
import { describe, expect, it } from 'vitest';
import { intentToolSchemas, runIntent, INTENT_TOOLS } from '../src/surface/intents/index.js';
import { buildRegistry } from '../src/surface/registry.js';

describe('intent tools', () => {
  it('produces exactly nine intent tools', () => {
    expect(intentToolSchemas(buildRegistry())).toHaveLength(9);
  });

  it('builds each action enum from the registry', () => {
    const setup = intentToolSchemas(buildRegistry()).find((t) => t.name === 'ct_setup')!;
    const actions = (setup.inputSchema as { properties: { action: { enum: string[] } } })
      .properties.action.enum;
    expect(actions).toContain('canvas');
    expect(actions).toContain('anthropic');
  });

  it('names its extending advanced section in every description', () => {
    for (const t of intentToolSchemas(buildRegistry())) {
      expect(t.description, `${t.name} should point at ct_advanced`).toContain('ct_advanced');
    }
  });

  it('returns a tool error listing valid actions for an unknown action', async () => {
    const res = await runIntent(buildRegistry(), 'ct_setup', { action: 'nope' });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(body.validActions).toContain('canvas');
  });

  it('every registered intent action is reachable', async () => {
    const reg = buildRegistry();
    const schemas = intentToolSchemas(reg);
    for (const op of reg.values()) {
      if (op.exposure !== 'intent') continue;
      const tool = schemas.find((t) => t.name === op.intentTool);
      expect(tool, `${op.id} -> missing tool ${op.intentTool}`).toBeTruthy();
      const actions = (tool!.inputSchema as { properties: { action: { enum: string[] } } })
        .properties.action.enum;
      expect(actions, `${op.id} action not exposed`).toContain(op.intentAction);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-intents`
Expected: FAIL — cannot resolve `../src/surface/intents/index.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/surface/intents/index.ts
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IntentToolId, Operation, SectionId } from '../operation.js';

type Registry = Map<string, Operation>;

/** Each intent tool names the advanced section that extends it, so the model
 *  has somewhere to look when an intent action does not cover the request. */
export const INTENT_TOOLS: Record<IntentToolId, { summary: string; extendedBy: SectionId }> = {
  ct_setup:   { summary: 'Configure credentials, providers, and paths. Run first.', extendedBy: 'admin' },
  ct_import:  { summary: 'Bring course data in: Canvas archives, transcripts, prior shells.', extendedBy: 'transcripts' },
  ct_inspect: { summary: 'Read current course state: assignments, pages, modules, resources.', extendedBy: 'admin' },
  ct_analyze: { summary: 'Find what is stale: topic currency, semester diffs, off-syllabus drift.', extendedBy: 'research' },
  ct_plan:    { summary: 'Plan next semester: outlines, date shifts, assignment briefs.', extendedBy: 'research' },
  ct_build:   { summary: 'Generate Canvas-safe materials, examples, layouts, and rubrics.', extendedBy: 'design' },
  ct_review:  { summary: 'Accessibility and quality gates before students see anything.', extendedBy: 'accessibility' },
  ct_publish: { summary: 'Preview, publish, roll back, and snapshot Canvas content.', extendedBy: 'snapshots' },
  ct_ask:     { summary: 'Index a course and answer questions from its own materials.', extendedBy: 'admin' },
};

const INTENT_IDS = Object.keys(INTENT_TOOLS) as IntentToolId[];

const json = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

function actionsFor(reg: Registry, tool: IntentToolId): Operation[] {
  return [...reg.values()].filter((o) => o.exposure === 'intent' && o.intentTool === tool);
}

export function intentToolSchemas(reg: Registry): Tool[] {
  return INTENT_IDS.map((id) => {
    const ops = actionsFor(reg, id);
    const meta = INTENT_TOOLS[id];
    return {
      name: id,
      description:
        `${meta.summary}\nActions: ` +
        ops.map((o) => `${o.intentAction} — ${o.description}`).join('; ') +
        `\nFor less common operations see ct_advanced section "${meta.extendedBy}".`,
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ops.map((o) => o.intentAction as string) },
          params: { type: 'object', description: 'Arguments for the chosen action.' },
        },
      },
    };
  });
}

export async function runIntent(
  reg: Registry, toolName: string, rawArgs: unknown,
): Promise<CallToolResult> {
  const args = (rawArgs ?? {}) as { action?: string; params?: unknown };
  const ops = actionsFor(reg, toolName as IntentToolId);
  const op = ops.find((o) => o.intentAction === args.action);
  if (!op) {
    return json({
      error: `Unknown action "${args.action}" for ${toolName}`,
      validActions: ops.map((o) => o.intentAction),
      hint: `Less common operations live in ct_advanced section "${INTENT_TOOLS[toolName as IntentToolId]?.extendedBy}".`,
    }, true);
  }
  return json(await op.handler(args.params ?? {}));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surface-intents`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/intents/index.ts tests/surface-intents.test.ts
git commit -m "feat(surface): derive nine intent tool schemas and routing from the registry"
```

---

### Task 7: tools/list derivation and the no-orphan guarantee

**Files:**
- Create: `packages/command-and-control/src/surface/list_tools.ts`
- Test: `packages/command-and-control/tests/surface-list-tools.test.ts`

**Interfaces:**
- Consumes: `intentToolSchemas`, `advancedToolSchema`, `buildRegistry`.
- Produces: `listTools(reg): Tool[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/surface-list-tools.test.ts
import { describe, expect, it } from 'vitest';
import { listTools } from '../src/surface/list_tools.js';
import { buildRegistry } from '../src/surface/registry.js';
import { adaptModuleTools } from '../src/surface/module_adapter.js';

describe('tools/list', () => {
  it('returns exactly ten tools', () => {
    expect(listTools(buildRegistry())).toHaveLength(10);
  });

  it('returns unique tool names', () => {
    const names = listTools(buildRegistry()).map((t) => t.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('stays at ten tools when modules are loaded', () => {
    const reg = buildRegistry();
    for (const op of adaptModuleTools('video', [{
      schema: { name: 'fetch', description: 'd', inputSchema: { type: 'object' } },
      handler: async () => ({ content: [] }),
    } as never])) {
      reg.set(op.id, op);
    }
    expect(listTools(reg)).toHaveLength(10);
  });

  it('leaves no operation orphaned', () => {
    const reg = buildRegistry();
    const orphans = [...reg.values()].filter(
      (o) => o.exposure !== 'intent' && o.exposure !== 'advanced' && o.exposure !== 'internal',
    );
    expect(orphans).toEqual([]);
    for (const op of reg.values()) {
      if (op.exposure === 'intent') expect(op.intentTool).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-list-tools`
Expected: FAIL — cannot resolve `../src/surface/list_tools.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/surface/list_tools.ts
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Operation } from './operation.js';
import { intentToolSchemas } from './intents/index.js';
import { advancedToolSchema } from './advanced.js';

/**
 * The exposed surface is always nine intent tools plus ct_advanced —
 * regardless of how many operations or modules are registered. That fixed
 * ceiling is the point of the design.
 */
export function listTools(reg: Map<string, Operation>): Tool[] {
  return [...intentToolSchemas(reg), advancedToolSchema(reg)];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surface-list-tools`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/list_tools.ts tests/surface-list-tools.test.ts
git commit -m "feat(surface): derive tools/list from the registry with a fixed ceiling of ten"
```

---

### Task 8: Dispatch

**Files:**
- Create: `packages/command-and-control/src/surface/dispatch.ts`
- Test: `packages/command-and-control/tests/surface-dispatch.test.ts`

**Interfaces:**
- Consumes: `runIntent`, `runAdvanced`, `INTENT_TOOLS`.
- Produces: `dispatchSurface(reg, name, args): Promise<CallToolResult>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/surface-dispatch.test.ts
import { describe, expect, it } from 'vitest';
import { dispatchSurface } from '../src/surface/dispatch.js';
import { buildRegistry } from '../src/surface/registry.js';

describe('dispatch', () => {
  it('routes an unknown tool name to a tool error, not a throw', async () => {
    const res = await dispatchSurface(buildRegistry(), 'nope', {});
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text as string);
    expect(body.validTools).toContain('ct_advanced');
  });

  it('routes ct_advanced to the sidecar', async () => {
    const res = await dispatchSurface(buildRegistry(), 'ct_advanced', { action: 'describe' });
    expect(res.isError).toBeFalsy();
  });

  it('surfaces a handler throw as a tool error rather than propagating', async () => {
    const reg = buildRegistry();
    reg.set('boom', {
      id: 'boom', section: 'admin', description: 'x', inputSchema: { type: 'object' },
      handler: () => { throw new Error('kaboom'); },
      taskCategory: 'none', exposure: 'intent', intentTool: 'ct_setup', intentAction: 'boom',
    });
    const res = await dispatchSurface(reg, 'ct_setup', { action: 'boom', params: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('kaboom');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- surface-dispatch`
Expected: FAIL — cannot resolve `../src/surface/dispatch.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/surface/dispatch.ts
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Operation } from './operation.js';
import { INTENT_TOOLS, runIntent } from './intents/index.js';
import { runAdvanced } from './advanced.js';

const TOOL_NAMES = [...Object.keys(INTENT_TOOLS), 'ct_advanced'];

/**
 * Every failure path returns a tool execution error (isError) rather than
 * throwing. MCP 2025-11-25 moved input validation failures to tool execution
 * errors precisely so the model can read the error and self-correct.
 */
export async function dispatchSurface(
  reg: Map<string, Operation>, name: string, args: unknown,
): Promise<CallToolResult> {
  try {
    if (name === 'ct_advanced') return await runAdvanced(reg, args);
    if (name in INTENT_TOOLS) return await runIntent(reg, name, args);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `Unknown tool: ${name}`, validTools: TOOL_NAMES }) }],
      isError: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- surface-dispatch`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/surface/dispatch.ts tests/surface-dispatch.test.ts
git commit -m "feat(surface): route tools/call through the registry with tool-error semantics"
```

---

### Task 9: Go live — wire index.ts to the registry

The cutover. The old switch is left in place for now so this step is revertible with a one-line change.

**Files:**
- Modify: `packages/command-and-control/src/index.ts:112-867` (ListTools handler), `:869-880` (CallTool handler)
- Modify: `packages/command-and-control/tests/server_identity.test.ts`

**Interfaces:**
- Consumes: `listTools`, `dispatchSurface`, `buildRegistry`, `adaptModuleTools`.
- Produces: a server whose `tools/list` returns 10 tools.

- [ ] **Step 1: Rewrite the brittle identity test first**

The existing test reads `src/index.ts` as a *string*; the restructure invalidates it.

```ts
// tests/server_identity.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../src/surface/registry.js';
import { listTools } from '../src/surface/list_tools.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('server identity', () => {
  it('takes its version from package.json', () => {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exposes exactly the ten-tool surface', () => {
    const names = listTools(buildRegistry()).map((t) => t.name);
    expect(names).toHaveLength(10);
    expect(names).toContain('ct_advanced');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- server_identity`
Expected: FAIL — the old assertions are gone and the new ones need the wiring.

- [ ] **Step 3: Replace the two handlers in `src/index.ts`**

Delete the whole `tools: [...]` array literal in the `ListToolsRequestSchema` handler and replace both handlers with:

```ts
import { buildRegistry } from './surface/registry.js';
import { adaptModuleTools } from './surface/module_adapter.js';
import { listTools } from './surface/list_tools.js';
import { dispatchSurface } from './surface/dispatch.js';

const registry = buildRegistry();
for (const [id, mod] of loadedModules.byId ?? []) {
  for (const op of adaptModuleTools(id, mod.tools)) registry.set(op.id, op);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(registry) }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await dispatchSurface(registry, request.params.name, request.params.arguments);
  const notice = (getUpdateNotice() ?? '') + (getChannelNotices() ?? '');
  if (!notice) return result;
  return { ...result, content: [...result.content, { type: 'text' as const, text: notice }] };
});
```

**Required:** `LoadedModules` (`src/modules/registry.ts:34`) currently exposes only `tools` and `handlers` — no module id, so the adapter cannot namespace. Add `byId: Map<string, CanvasToolchainModule>` alongside them and populate it from the `active` map already built in `loadModules()`. The field is additive; fail-soft loading must be left exactly as it is.

- [ ] **Step 4: Run the full suite and the smoke test**

Run: `npm test && npm run build && npm run smoke:integration`
Expected: all PASS. The smoke test imports handlers directly, so it must be unaffected — if it breaks, a handler was modified, which this plan forbids.

- [ ] **Step 5: Manually verify the live surface**

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | npx tsx src/index.ts 2>/dev/null | tail -1 | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']), 'tools')"
```

Expected: `10 tools`.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts src/modules/registry.ts tests/server_identity.test.ts
git commit -m "feat(surface): serve tools/list and tools/call from the operation registry"
```

---

### Task 10: Remove the dead surface

**Files:**
- Modify: `packages/command-and-control/src/index.ts` (delete the old switch)
- Modify: `packages/command-and-control/src/passthrough/{ci,downloader,design}_tools.ts` (drop presentation fields)
- Delete: `packages/command-and-control/src/lib/call_tool_dispatch.ts` and `tests/` counterpart if it exists
- Delete: `packages/command-and-control/tests/surface-parity.test.ts` (see below)

**Interfaces:**
- Consumes: nothing new.
- Produces: `index.ts` at ~100 lines.

- [ ] **Step 1: Add the guard test**

```ts
// tests/surface-no-legacy.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('legacy surface removal', () => {
  it('index.ts no longer hand-rolls a tool switch', () => {
    const src = readFileSync(join(pkgDir, 'src', 'index.ts'), 'utf8');
    expect(src).not.toContain('ALL_PASSTHROUGH');
    expect(src.split('\n').length).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- surface-no-legacy`
Expected: FAIL — `ALL_PASSTHROUGH` is still present and the file is ~1100 lines.

- [ ] **Step 3: Delete the dead code**

**Delete `tests/surface-parity.test.ts` in this task.** It reads tool-name literals out of
`src/index.ts` and the passthrough files to prove the migration lost nothing. This task deletes
those literals, so the test cannot survive them — it is spent migration scaffolding by now.
The permanent invariants live elsewhere: unique-id (Task 2) and no-orphan (Task 7) still fail
for any unreachable or duplicated operation.

Remove from `src/index.ts`: the `ALL_PASSTHROUGH` constant, the old `switch (name)` block, the `dispatchCallTool` import, and every now-unused tool-schema import. Keep the server construction, module loading, notice checks, and transport wiring.

In each `src/passthrough/*_tools.ts`, keep the exported handler functions and the `taskCategory` values — the registry consumes them. The `name`/`description`/`inputSchema` fields are now duplicated in the registry; leave the arrays intact for this commit and remove them only once `npm run build` confirms nothing imports them.

- [ ] **Step 4: Run everything**

Run: `npm test && npm run build && npm run smoke:integration`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/ tests/
git commit -m "refactor(surface): delete the legacy tool switch and passthrough presentation"
```

---

## Self-Review

**Spec coverage.** D1 → Tasks 6, 7. D2 → Task 5. D3 → Tasks 1, 2, 3. D5 → Tasks 9, 10. Testing section → every task, plus the no-orphan test in Task 7. Rollout Stage 0 → Tasks 1–4; Stage 1 → Task 9; Stage 2 → Task 10. **D4 (module contract 2.0) and Stage 3–4 are deliberately out of scope** — see below.

**Deferred to follow-up plans:**
- **Plan 2 — `module-contract` 2.0:** the `ModuleOperation` shape, host namespacing at the contract level, the promotion cap, `contractVersion` gating, and migrating the six in-repo modules. Task 4's adapter keeps modules working until then.
- **Plan 3 — documentation:** regenerating `AGENTS.md` and `docs/commands-and-credentials.md` (75KB combined) against the new surface.

**Known gap accepted for now:** the parity test proves every operation is *registered*, not that every `inputSchema` was copied faithfully. Schema fidelity is enforced by review during Task 3, not by a test. Building a schema-diff test would require parsing the old literals out of `index.ts`, which stops being possible after Task 10 — so if that guarantee matters, it must be added as part of Task 3, not later.

---

### Task 11: Harden the sidecar seams

Added during execution after a cross-family (Grok) review of the whole surface found six issues that five task-scoped reviews had each been too narrow to see. Two were confirmed by executing against the real registry. **Execute this BEFORE Task 9** — after the cutover these are live defects rather than latent ones.

**Files:**
- Modify: `packages/command-and-control/src/surface/advanced.ts`
- Modify: `packages/command-and-control/src/surface/module_adapter.ts`
- Test: `packages/command-and-control/tests/surface-advanced.test.ts`
- Test: `packages/command-and-control/tests/surface-module-adapter.test.ts`
- Test: `packages/command-and-control/tests/surface-invariants.test.ts` (create)

**Interfaces:**
- Consumes: `Operation`, `SECTION_IDS`, `buildRegistry`, `adaptModuleTools`, `runAdvanced`
- Produces: no new exports; behaviour changes to `runAdvanced` and `adaptModuleTools`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/surface-advanced.test.ts — append
import { adaptModuleTools } from '../src/surface/module_adapter.js';

it('returns a tool error for an unknown section', async () => {
  const res = await runAdvanced(buildRegistry(), { action: 'describe', section: 'a11y' as never });
  expect(res.isError).toBe(true);
  const body = JSON.parse(res.content[0].text as string);
  expect(body.validSections).toContain('accessibility');
});

it('does not double-wrap a module handler result', async () => {
  const reg = buildRegistry();
  const failing = {
    schema: { name: 'boom', description: 'fails', inputSchema: { type: 'object' } },
    handler: async () => ({ content: [{ type: 'text' as const, text: 'module blew up' }], isError: true }),
  };
  for (const op of adaptModuleTools('video', [failing as never])) reg.set(op.id, op);
  const res = await runAdvanced(reg, { action: 'run', operation: 'video.boom', params: {} });
  expect(res.isError).toBe(true);                       // inner failure must surface
  expect(res.content[0].text).toBe('module blew up');   // not a stringified envelope
});

it('rejects a non-object params', async () => {
  const res = await runAdvanced(buildRegistry(), {
    action: 'run', operation: 'wave_deep_check', params: 'not an object' as never,
  });
  expect(res.isError).toBe(true);
});

it('rejects params missing a required field', async () => {
  const res = await runAdvanced(buildRegistry(), {
    action: 'run', operation: 'wave_deep_check', params: {},
  });
  expect(res.isError).toBe(true);
  const body = JSON.parse(res.content[0].text as string);
  expect(JSON.stringify(body)).toMatch(/required/i);
});

it('calls the operation handler with the given params', async () => {
  const reg = buildRegistry();
  let seen: unknown = null;
  reg.set('stub_op', {
    id: 'stub_op', section: 'admin', description: 'stub', inputSchema: { type: 'object' },
    handler: (args) => { seen = args; return { ok: true }; },
    taskCategory: 'none', exposure: 'advanced',
  });
  await runAdvanced(reg, { action: 'run', operation: 'stub_op', params: { a: 1 } });
  expect(seen).toEqual({ a: 1 });
});
```

```ts
// tests/surface-module-adapter.test.ts — append
it('throws on duplicate tool names within one module', () => {
  const t = (name: string) => ({
    schema: { name, description: 'd', inputSchema: { type: 'object' } },
    handler: async () => ({ content: [] }),
  });
  expect(() => adaptModuleTools('video', [t('dup'), t('dup')] as never)).toThrow(/dup/);
});
```

```ts
// tests/surface-invariants.test.ts — create
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/surface/registry.js';
import { runAdvanced } from '../src/surface/advanced.js';

describe('whole-surface invariants', () => {
  it('gives no non-intent operation intent fields', () => {
    for (const op of buildRegistry().values()) {
      if (op.exposure === 'intent') continue;
      expect(op.intentTool, `${op.id}`).toBeUndefined();
      expect(op.intentAction, `${op.id}`).toBeUndefined();
    }
  });

  it('exposes exactly the advanced operations through ct_advanced', async () => {
    const reg = buildRegistry();
    const res = await runAdvanced(reg, { action: 'run', operation: 'nope', params: {} });
    const valid: string[] = JSON.parse(res.content[0].text as string).validOperations;
    const advanced = [...reg.values()].filter((o) => o.exposure === 'advanced').map((o) => o.id);
    expect(valid.sort()).toEqual(advanced.sort());
  });

  it('makes an internal operation indistinguishable from a nonexistent one', async () => {
    const reg = buildRegistry();
    const a = await runAdvanced(reg, { action: 'run', operation: 'reembed_course_index', params: {} });
    const b = await runAdvanced(reg, { action: 'run', operation: 'definitely_not_real', params: {} });
    const norm = (r: typeof a) =>
      JSON.parse(r.content[0].text as string).error.replace(/reembed_course_index|definitely_not_real/, 'X');
    expect(norm(a)).toEqual(norm(b));
    expect(a.isError).toBe(b.isError);
  });

  it('keeps the exposure split at 50 / 29 / 3', () => {
    const c = { intent: 0, advanced: 0, internal: 0 };
    for (const op of buildRegistry().values()) c[op.exposure] += 1;
    expect(c).toEqual({ intent: 50, advanced: 29, internal: 3 });
  });

  it('gives every operation an object inputSchema and a non-empty description', () => {
    for (const op of buildRegistry().values()) {
      expect((op.inputSchema as { type?: string }).type, `${op.id}`).toBe('object');
      expect(op.description.length, `${op.id}`).toBeGreaterThan(0);
    }
  });

  it('keeps core ids free of dots so module ids cannot collide', () => {
    for (const id of buildRegistry().keys()) expect(id).not.toContain('.');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- surface-advanced surface-module-adapter surface-invariants`
Expected: FAIL — unknown section returns no `isError`; the module result is double-wrapped; `params` is unvalidated; `adaptModuleTools` does not throw on duplicates.

- [ ] **Step 3: Implement**

In `src/surface/advanced.ts`:

1. Validate `section` before use — if `args.section` is set and not in `SECTION_IDS`, return `json({ error: ..., validSections: SECTION_IDS }, true)`.
2. Validate `params` before calling the handler: reject a non-object (`typeof !== 'object'` or `Array.isArray`), then check every name in `op.inputSchema.required` is present, returning `json({ error: ..., missing: [...], inputSchema: op.inputSchema }, true)` when not. Returning the schema lets the model self-correct without a second `describe` round-trip.
3. Stop double-wrapping. After awaiting the handler, if the result already looks like a `CallToolResult` — an object with a `content` array — return it **unchanged**, preserving its `isError`. Otherwise `json(result)`.
4. Use one wording for both unknown-operation messages so `describe` and `run` read the same.

In `src/surface/module_adapter.ts`: throw on a duplicate `schema.name` within one module, naming the offending id — matching `buildRegistry()`'s existing behaviour for core ids.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/surface/advanced.ts src/surface/module_adapter.ts tests/
git commit -m "fix(surface): harden ct_advanced seams and lock whole-surface invariants"
```

---

### Task 12: Repoint stale cross-references in operation descriptions

Execute AFTER Task 10.

Descriptions were copied verbatim from the old flat tools, so several instruct the model to call a sibling operation by its old top-level name — and some of those are now a different exposure, so `ct_advanced` refuses them. Known sites: `registry.ts` lines 191, 212, 426, 542, 563, 692, 727.

**Ruling that governs this task:** schema *structure* (properties, `required`, enums, types) stays verbatim — that is the guarantee the 82/82 fidelity verification bought, and it is not up for renegotiation. Description *text* may deviate from source exactly where it names another operation's address, because the address genuinely changed. Fidelity to a stale pointer is not fidelity.

**Files:**
- Modify: `packages/command-and-control/src/surface/registry.ts` (description strings only)
- Test: `packages/command-and-control/tests/surface-invariants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('never points a description at another operation by a stale address', () => {
  const reg = buildRegistry();
  const byId = new Map([...reg.values()].map((o) => [o.id, o]));
  const offenders: string[] = [];
  for (const op of reg.values()) {
    for (const [id, other] of byId) {
      if (id === op.id) continue;
      // A bare mention of another op id is only safe when both are advanced,
      // because only then is that id a valid ct_advanced run target.
      const bare = new RegExp(`\\b${id}\\b`);
      if (bare.test(op.description) && !(op.exposure === 'advanced' && other.exposure === 'advanced')) {
        offenders.push(`${op.id} -> ${id}`);
      }
    }
  }
  expect(offenders, offenders.join('; ')).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- surface-invariants`
Expected: FAIL listing the offending pairs, including `show_canvas_capabilities -> preview_canvas_pattern` and `open_dashboard -> set_courses_root`.

- [ ] **Step 3: Rewrite each offending reference to the new address**

For an operation now on an intent tool, write the tool and action (`ct_build` action `preview_pattern`). For one still on the sidecar, write `ct_advanced` run `<id>`. For a name that is only a module tool after adaptation, write the namespaced form (`video.setup_panopto`). Change nothing but the referring phrase.

- [ ] **Step 4: Run tests**

Run: `npm test && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/surface/registry.ts tests/surface-invariants.test.ts
git commit -m "fix(surface): repoint operation descriptions at their new addresses"
```
