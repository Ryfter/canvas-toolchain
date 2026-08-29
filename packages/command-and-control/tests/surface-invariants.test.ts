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
    const a = await runAdvanced(reg, { action: 'run', operation: 'map_transcripts_to_weeks', params: {} });
    const b = await runAdvanced(reg, { action: 'run', operation: 'definitely_not_real', params: {} });
    const norm = (r: typeof a) =>
      JSON.parse(r.content[0].text as string).error.replace(/map_transcripts_to_weeks|definitely_not_real/, 'X');
    expect(norm(a)).toEqual(norm(b));
    expect(a.isError).toBe(b.isError);
  });

  it('keeps the exposure split at 54 / 31 / 1', () => {
    const c = { intent: 0, advanced: 0, internal: 0 };
    for (const op of buildRegistry().values()) c[op.exposure] += 1;
    expect(c).toEqual({ intent: 54, advanced: 31, internal: 1 });
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

  it('never points a description at another operation by a stale address', () => {
    const reg = buildRegistry();
    const byId = new Map([...reg.values()].map((o) => [o.id, o]));
    const offenders: string[] = [];
    for (const op of reg.values()) {
      for (const [id, other] of byId) {
        if (id === op.id) continue;
        // A bare mention of another op id is only safe when the target is
        // advanced, because only then is that id a valid ct_advanced run
        // target — `ct_advanced` run `<id>` is resolvable from anywhere, so
        // the citing operation's own exposure has no bearing on this.
        const bare = new RegExp(`\\b${id}\\b`);
        if (bare.test(op.description) && other.exposure !== 'advanced') {
          offenders.push(`${op.id} -> ${id}`);
        }
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([]);
  });

  it('never gives an intent operation the reserved action name "describe"', () => {
    for (const op of buildRegistry().values()) {
      if (op.exposure !== 'intent') continue;
      expect(op.intentAction, `${op.id}`).not.toBe('describe');
    }
  });
});
