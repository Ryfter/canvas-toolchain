import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../src/surface/registry.js';
import { advancedToolSchema, runAdvanced } from '../src/surface/advanced.js';
import { intentToolSchemas, runIntent } from '../src/surface/intents/index.js';
import { deprecation } from '../src/surface/deprecation.js';
import { parseFrontMatter } from '../../../scripts/skills/lib/frontmatter.mjs';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The release the legacy ids go away in, restated here rather than imported from
 * `src/surface/deprecation.ts` — a test that reads the value it is checking
 * proves only that the code agrees with itself.
 */
const REMOVE_IN = '2.5.0';

const PKG_VERSION = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

/** True when `version` is the same as or later than `floor` (all X.Y.Z). */
function atLeast(version: string, floor: string): boolean {
  const parse = (v: string) => v.split('.').map((part) => Number.parseInt(part, 10));
  const [a, b] = [parse(version), parse(floor)];
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/**
 * The legacy setup operation ids that have a `ct_setup` action — the complete
 * deprecation set, and the action each one is replaced by.
 */
const EXPECTED: Record<string, string> = {
  setup_cc: 'cc',
  setup_anthropic: 'anthropic',
  setup_canvas: 'canvas',
  setup_ollama: 'ollama',
  set_courses_root: 'courses_root',
  get_cc_status: 'status',
  setup_transcript_source: 'transcripts',
  setup_lecture_answers: 'lecture_answers',
  setup_spot_check: 'spot_check',
  setup_course: 'course',
  setup_canvas_backup: 'backup',
};

function body(result: CallToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0].text as string);
}

function deprecatedOps() {
  return [...buildRegistry().values()].filter((op) => op.deprecated !== undefined);
}

const ORIGINAL_CC_HOME = process.env.CC_HOME;
let ccHome: string;
let coursesRoot: string;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-deprecation-home-'));
  coursesRoot = mkdtempSync(join(tmpdir(), 'cc-deprecation-courses-'));
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(coursesRoot, { recursive: true, force: true });
  if (ORIGINAL_CC_HOME === undefined) delete process.env.CC_HOME;
  else process.env.CC_HOME = ORIGINAL_CC_HOME;
});

describe('the deprecated legacy setup ids', () => {
  it('marks exactly the legacy ids that have a ct_setup action', () => {
    expect(deprecatedOps().map((op) => op.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('resolves every replacement to a real ct_setup action', () => {
    const reg = buildRegistry();
    const actions = new Set(
      [...reg.values()]
        .filter((op) => op.exposure === 'intent' && op.intentTool === 'ct_setup')
        .map((op) => op.intentAction as string),
    );

    for (const op of deprecatedOps()) {
      expect(op.deprecated?.replacement.tool, op.id).toBe('ct_setup');
      const action = op.deprecated?.replacement.action as string;
      expect(action, op.id).toBe(EXPECTED[op.id]);
      expect(actions.has(action), `${op.id} -> ct_setup ${action}`).toBe(true);
    }
  });

  it('names the pinned removal release, which is still ahead of the package version', () => {
    for (const op of deprecatedOps()) {
      expect(op.deprecated?.removeIn, op.id).toBe(REMOVE_IN);
      expect(op.deprecated?.notice, op.id).toContain(REMOVE_IN);
      expect(op.deprecated?.marker, op.id).toContain(op.deprecated?.replacement.action as string);
    }
    expect(atLeast(PKG_VERSION, REMOVE_IN), `package ${PKG_VERSION} has reached ${REMOVE_IN}`).toBe(false);
  });

  // A tripwire, not a behaviour: the wrappers are promised one release and must
  // not outlive it. If this fails, delete the legacy ops (and this deprecation
  // machinery) — or move the removal release and say why.
  it('expires: no wrapper may survive the package reaching its removal release', () => {
    const reached = atLeast(PKG_VERSION, REMOVE_IN);
    const survivors = reached ? deprecatedOps().map((op) => op.id) : [];
    expect(
      survivors,
      `package ${PKG_VERSION} >= ${REMOVE_IN}: remove these legacy wrappers (or move LEGACY_SETUP_REMOVE_IN): ${survivors.join(', ')}`,
    ).toEqual([]);
  });
});

describe('invoking a legacy id through ct_advanced', () => {
  it('returns the same result as the ct_setup action, plus the deprecation', async () => {
    const reg = buildRegistry();
    const params = { coursesRoot };

    const viaAction = await runIntent(reg, 'ct_setup', { action: 'courses_root', params });
    const viaLegacyId = await runAdvanced(reg, { action: 'run', operation: 'set_courses_root', params });

    expect(viaAction.isError).toBeFalsy();
    expect(viaLegacyId.isError).toBeFalsy();

    const { deprecation: notice, ...rest } = body(viaLegacyId);
    expect(rest).toEqual(body(viaAction));

    expect(notice).toEqual({
      replacement: { tool: 'ct_setup', action: 'courses_root' },
      removeIn: REMOVE_IN,
      marker: 'Deprecated — use ct_setup {action: "courses_root"}',
      notice: `Deprecated — use ct_setup {action: "courses_root"}; removed in ${REMOVE_IN}.`,
    });
    expect(JSON.stringify(rest)).not.toContain('Deprecated');
  });

  it('does not warn when the same operation runs through ct_setup', async () => {
    const reg = buildRegistry();
    const result = await runIntent(reg, 'ct_setup', { action: 'courses_root', params: { coursesRoot } });

    expect(body(result).deprecation).toBeUndefined();
    expect(result.content[0].text as string).not.toContain('Deprecated');
  });

  it('keeps isError unchanged and appends the notice when a handler already returns a CallToolResult', async () => {
    const reg = buildRegistry();
    const failing = {
      id: 'legacy_failing_stub',
      section: 'admin' as const,
      description: 'stub',
      inputSchema: { type: 'object' as const },
      handler: async (): Promise<CallToolResult> => ({ content: [{ type: 'text' as const, text: 'inner failed' }], isError: true }),
      taskCategory: 'none' as const,
      exposure: 'advanced' as const,
      deprecated: deprecation({ tool: 'ct_setup', action: 'canvas' }),
    };
    reg.set(failing.id, failing);

    const result = await runAdvanced(reg, { action: 'run', operation: failing.id, params: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'inner failed' });
    expect((result.content[1] as { text: string }).text).toContain('Deprecated — use ct_setup {action: "canvas"}');
  });

  it('wraps an array result instead of spreading it into an object', async () => {
    const reg = buildRegistry();
    reg.set('legacy_array_stub', {
      id: 'legacy_array_stub',
      section: 'admin',
      description: 'stub',
      inputSchema: { type: 'object' },
      handler: async () => ['a', 'b'],
      taskCategory: 'none',
      exposure: 'advanced',
      deprecated: deprecation({ tool: 'ct_setup', action: 'canvas' }),
    });

    const result = await runAdvanced(reg, { action: 'run', operation: 'legacy_array_stub', params: {} });
    const parsed = body(result);

    expect(parsed.result).toEqual(['a', 'b']);
    expect(parsed).not.toHaveProperty('0');
    expect((parsed.deprecation as { notice: string }).notice).toContain('Deprecated — use ct_setup {action: "canvas"}');
  });

  it('leaves an ordinary advanced operation with no notice', async () => {
    const reg = buildRegistry();
    const result = await runAdvanced(reg, { action: 'run', operation: 'list_modules', params: {} });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text as string).not.toContain('Deprecated');
  });
});

describe('the deprecation in ct_advanced listings and skill files', () => {
  it('marks each deprecated id in the ct_advanced help', () => {
    const description = advancedToolSchema(buildRegistry()).description;

    for (const op of deprecatedOps()) {
      expect(description, op.id).toContain(`${op.id} (${op.deprecated?.marker})`);
    }
  });

  it('advertises deprecated ids as runnable in the describe catalogue', async () => {
    const reg = buildRegistry();

    const catalogue = body(await runAdvanced(reg, { action: 'describe' }));
    const admin = (catalogue.sections as Record<string, { operations: string[] }>).admin;
    expect(admin.operations).toContain('setup_canvas');

    const one = body(await runAdvanced(reg, { action: 'describe', operation: 'setup_canvas' }));
    expect((one.operations as Record<string, { deprecated: { marker: string } }>).setup_canvas.deprecated.marker)
      .toBe('Deprecated — use ct_setup {action: "canvas"}');

    const unknown = body(await runAdvanced(reg, { action: 'run', operation: 'nope', params: {} }));
    expect(unknown.validOperations).toContain('setup_canvas');

    const section = body(await runAdvanced(reg, { action: 'describe', section: 'admin' }));
    expect(Object.keys(section.operations as Record<string, unknown>)).toContain('setup_canvas');
  });

  it('keeps the intent-tool listing free of the deprecation wording', () => {
    const setup = intentToolSchemas(buildRegistry()).find((tool) => tool.name === 'ct_setup');

    expect(setup?.description).not.toContain('Deprecated');
    expect(setup?.description).toContain('canvas');
  });

  it('shows the notice in the generated skill op file', () => {
    const { data } = parseFrontMatter(
      readFileSync(join(pkgDir, 'skills', 'ops', 'setup_canvas.md'), 'utf8'),
    );

    expect(String(data?.deprecated)).toContain('Deprecated — use ct_setup {action: "canvas"}');
    expect(String(data?.deprecated)).toContain(REMOVE_IN);
  });
});
