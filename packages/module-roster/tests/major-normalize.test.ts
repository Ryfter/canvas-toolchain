import { describe, it, expect } from 'vitest';
import { normalizeMajors } from '../src/major/normalize.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

const fakeLlm = (map: Record<string, string>): LlmClient => ({
  complete: async () => ({ text: JSON.stringify(map) }),
});

describe('normalizeMajors', () => {
  it('returns identity passthrough + llmUsed=false when llm is null', async () => {
    const r = await normalizeMajors(['Bus Admin: Marketing', 'Accounting'], null, {});
    expect(r.llmUsed).toBe(false);
    expect(r.map).toEqual({ 'Bus Admin: Marketing': 'Bus Admin: Marketing', 'Accounting': 'Accounting' });
  });

  it('applies alias overrides without calling the llm for those', async () => {
    const r = await normalizeMajors(['Bus Admin: Marketing'], fakeLlm({ 'Bus Admin: Marketing': 'WRONG' }),
      { 'Bus Admin: Marketing': 'Marketing' });
    expect(r.map['Bus Admin: Marketing']).toBe('Marketing'); // alias wins over llm
  });

  it('uses the llm for un-aliased distinct majors and reports llmUsed=true', async () => {
    const r = await normalizeMajors(['Bus Admin: Business Analytics Emphasis'],
      fakeLlm({ 'Bus Admin: Business Analytics Emphasis': 'Business Analytics' }), {});
    expect(r.map['Bus Admin: Business Analytics Emphasis']).toBe('Business Analytics');
    expect(r.llmUsed).toBe(true);
  });

  it('dedupes distinct majors and ignores empty strings', async () => {
    let calls = 0;
    const counting: LlmClient = { complete: async (_s, u) => { calls++; return { text: JSON.stringify({ Marketing: 'Marketing' }) }; } };
    const r = await normalizeMajors(['Marketing', 'Marketing', ''], counting, {});
    expect(calls).toBe(1);
    expect(r.map['']).toBeUndefined();
  });

  it('falls back to raw when the llm response is unparseable', async () => {
    const bad: LlmClient = { complete: async () => ({ text: 'not json' }) };
    const r = await normalizeMajors(['Marketing'], bad, {});
    expect(r.map['Marketing']).toBe('Marketing');
  });
});
