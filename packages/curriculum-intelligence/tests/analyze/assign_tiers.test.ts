import { describe, expect, it } from 'vitest';
import { assignTiers } from '../../src/analyze/assign_tiers.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

function makeFakeLlm(response: string): LlmClient {
  return {
    async complete() {
      return { text: response, usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
}

const SECTIONS = [
  { heading: 'Due Date', body: 'October 17 at 11:59 PM' },
  { heading: 'Submission Instructions', body: 'Upload a single PDF.' },
  { heading: 'Rubric Breakdown', body: 'Analytical rigor + writing quality.' },
];

describe('assignTiers', () => {
  it('happy path: returns validated PageTiers from a well-formed LLM response', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Oct 17 by 11:59 PM' },
        { heading: 'Submission Instructions', tier: 2, summary: 'Single PDF' },
        { heading: 'Rubric Breakdown', tier: 3, summary: 'Rigor + writing' },
      ],
    }));

    const result = await assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm });

    expect(result.warnings).toEqual([]);
    expect(result.tiers.sections).toHaveLength(3);
    expect(result.tiers.sections[0]).toEqual({ heading: 'Due Date', tier: 1, summary: 'Oct 17 by 11:59 PM' });
  });

  it('drops sections with out-of-range tier values and accumulates warnings', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Oct 17' },
        { heading: 'Submission Instructions', tier: 7, summary: 'PDF' },
        { heading: 'Rubric Breakdown', tier: 3, summary: 'Rigor' },
      ],
    }));

    const result = await assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm });

    expect(result.tiers.sections).toHaveLength(2);
    expect(result.tiers.sections.find((s) => s.heading === 'Submission Instructions')).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/Submission Instructions/);
  });

  it('drops sections with empty summary and accumulates warnings', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 1, summary: 'Oct 17' },
        { heading: 'Submission Instructions', tier: 2, summary: '' },
        { heading: 'Rubric Breakdown', tier: 3, summary: 'Rigor' },
      ],
    }));

    const result = await assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm });

    expect(result.tiers.sections).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
  });

  it('throws TIER_ASSIGN_FAILED when LLM call throws', async () => {
    const llm: LlmClient = {
      async complete() { throw new Error('LLM exploded'); },
    };

    await expect(assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm }))
      .rejects.toThrow(/TIER_ASSIGN_FAILED/);
  });

  it('throws TIER_ASSIGN_FAILED when response is malformed JSON', async () => {
    const llm = makeFakeLlm('not json at all');

    await expect(assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm }))
      .rejects.toThrow(/TIER_ASSIGN_FAILED/);
  });

  it('throws TIER_ASSIGN_FAILED when all sections are dropped during validation', async () => {
    const llm = makeFakeLlm(JSON.stringify({
      sections: [
        { heading: 'Due Date', tier: 99, summary: 'x' },
        { heading: 'Submission Instructions', tier: 0, summary: 'y' },
        { heading: 'Rubric Breakdown', tier: -1, summary: 'z' },
      ],
    }));

    await expect(assignTiers({ pageTitle: 'Week 5', sections: SECTIONS, llm }))
      .rejects.toThrow(/TIER_ASSIGN_FAILED/);
  });
});
