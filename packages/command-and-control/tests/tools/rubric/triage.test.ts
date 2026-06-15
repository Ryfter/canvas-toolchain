// tests/tools/rubric/triage.test.ts
import { describe, it, expect } from 'vitest';
import { triageRubric } from '../../../src/tools/rubric/triage.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import type { PulledRubric, RubricChangeReport } from '../../../src/tools/rubric/sync_types.js';

const pulled: PulledRubric = {
  source: { kind: 'assignment', courseId: '1', assignmentId: '2', title: 'Essay' },
  criteria: [{ id: 'c1', name: 'Thesis', points: 10, description: 'Clear arguable thesis' }],
};
const change: RubricChangeReport = { status: 'unchanged', added: [], removed: [], modified: [] };

function mockLlm(text: string): LlmClient {
  return { complete: async () => ({ text }) };
}

describe('triageRubric', () => {
  it('parses an acceptable verdict', async () => {
    const llm = mockLlm('{"verdict":"acceptable","flags":[],"rationale":"fine"}');
    const r = await triageRubric({ pulled, change, assignmentSignal: '' }, { llm });
    expect(r.verdict).toBe('acceptable');
    expect(r.flags).toEqual([]);
  });

  it('strips code fences and keeps the proposed rubric on needs-update', async () => {
    const llm = mockLlm('```json\n{"verdict":"needs-update","flags":[{"criterion":"Thesis","issue":"vague","evidence":"vague-language"}],"proposedFacultyRubric":"Thesis (10): a clear, arguable claim.","rationale":"tighten"}\n```');
    const r = await triageRubric({ pulled, change, assignmentSignal: '' }, { llm });
    expect(r.verdict).toBe('needs-update');
    expect(r.proposedFacultyRubric).toContain('clear, arguable');
    expect(r.flags[0].evidence).toBe('vague-language');
  });

  it('throws when the LLM returns non-JSON', async () => {
    const llm = mockLlm('I think it is fine!');
    await expect(triageRubric({ pulled, change, assignmentSignal: '' }, { llm })).rejects.toThrow(/valid JSON/);
  });

  it('throws when verdict is not one of the three allowed values', async () => {
    const llm = mockLlm('{"verdict":"maybe","flags":[],"rationale":"x"}');
    await expect(triageRubric({ pulled, change, assignmentSignal: '' }, { llm })).rejects.toThrow(/verdict/);
  });
});
