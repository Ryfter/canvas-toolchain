import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/surface/registry.js';

const INTERNAL_ALLOWLIST = [
  'map_transcripts_to_weeks',
];

describe('operation registry', () => {
  it('has no duplicate ids', () => {
    const reg = buildRegistry();
    const ids = [...reg.values()].map((o) => o.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('never lets two intent operations share an action', () => {
    const seen = new Map<string, string>();
    for (const op of buildRegistry().values()) {
      if (op.exposure !== 'intent') continue;
      const key = `${op.intentTool}:${op.intentAction}`;
      const prior = seen.get(key);
      expect(prior, `${key} claimed by both ${prior} and ${op.id}`).toBeUndefined();
      seen.set(key, op.id);
    }
  });

  // Subset, not equality: Task 2 registers zero internal operations, so an
  // equality assertion would fail here. Task 3 adds the exact-equality check
  // once the full operation set exists.
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
