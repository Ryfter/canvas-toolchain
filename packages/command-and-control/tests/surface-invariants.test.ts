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
