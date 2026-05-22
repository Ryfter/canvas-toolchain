import { describe, expect, test } from 'vitest';
import { extractCourseConcepts } from '../../src/tools/extract_course_concepts.js';
import type { LlmClient } from '../../src/llm/client.js';

const MOCK_LLM_RESPONSE = JSON.stringify({
  concepts: [
    { name: 'Prompt engineering', relatedAssignments: ['Assignment 1', 'Assignment 3'] },
    { name: 'Agent tool use', relatedAssignments: ['Assignment 2'] },
  ],
});

function mockClient(response: string): LlmClient {
  return { complete: async () => response };
}

describe('extractCourseConcepts', () => {
  test('returns concepts parsed from LLM JSON response', async () => {
    const result = await extractCourseConcepts({
      assignments: [{ name: 'Assignment 1' }, { name: 'Assignment 2' }, { name: 'Assignment 3' }],
      modules: [{ name: 'Module 1' }],
      llmClient: mockClient(MOCK_LLM_RESPONSE),
    });
    expect(result.concepts).toHaveLength(2);
    expect(result.concepts[0].name).toBe('Prompt engineering');
    expect(result.concepts[0].relatedAssignments).toEqual(['Assignment 1', 'Assignment 3']);
  });

  test('handles markdown-fenced response', async () => {
    const fenced = '```json\n' + MOCK_LLM_RESPONSE + '\n```';
    const result = await extractCourseConcepts({
      assignments: [{ name: 'A' }], modules: [],
      llmClient: mockClient(fenced),
    });
    expect(result.concepts).toHaveLength(2);
  });

  test('returns empty list on unparseable response', async () => {
    const result = await extractCourseConcepts({
      assignments: [{ name: 'A' }], modules: [],
      llmClient: mockClient('Sorry, I cannot help.'),
    });
    expect(result.concepts).toEqual([]);
  });
});
