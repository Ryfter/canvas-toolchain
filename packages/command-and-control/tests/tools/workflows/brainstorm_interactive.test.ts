import { describe, it, expect } from 'vitest';
import { brainstormInteractive } from '../../../src/tools/workflows/brainstorm_interactive.js';
import type { LlmClient, LlmResponse } from '../../../src/tools/brainstorm/llm_client.js';
import type { WidgetConcept } from '../../../src/tools/brainstorm/types.js';

function makeFakeLlm(response: object | string): LlmClient & { calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    calls,
    async complete(system: string, user: string): Promise<LlmResponse> {
      calls.push({ system, user });
      const text = typeof response === 'string' ? response : JSON.stringify(response);
      return { text, usage: { inputTokens: 80, outputTokens: 320 } };
    },
  };
}

function validConcept(overrides: Partial<WidgetConcept> = {}): WidgetConcept {
  return {
    id: 'card-flip-reveal',
    name: 'Card-Flip Reveal',
    rationale: 'Students see each pattern on the front; flip to see the right use case.',
    pedagogicalFit: 'high',
    personaConsiderations: 'Visual learners benefit from spatial card layout.',
    spec: {
      id: 'card-flip-reveal',
      name: 'Card-Flip Reveal',
      kind: 'card-flip-reveal',
      purpose: 'Force a moment of recall before showing the answer.',
      contentSchema: { cards: 'array of {front, back}' },
      initialContent: { cards: [{ front: 'VLOOKUP', back: 'Searches left column, returns value from right.' }] },
      dimensions: { minHeight: 320, maxHeight: 600, aspectRatio: '4:3' },
      accessibility: {
        keyboardEquivalent: 'Tab to focus, Enter to flip.',
        screenReaderSummary: 'Card 1 of 5. Front side showing.',
        minTouchTarget: 44,
      },
    },
    ...overrides,
  };
}

describe('brainstormInteractive', () => {
  it('returns parsed concepts and propagates topic + learning goal', async () => {
    const llm = makeFakeLlm({ concepts: [validConcept(), validConcept({ id: 'sortable-ordering', name: 'Sortable Ordering' })] });
    const r = await brainstormInteractive(
      { topic: 'VLOOKUP vs XLOOKUP', learningGoal: 'Students pick the right function for a given task.' },
      { llm },
    );
    expect(r.topic).toBe('VLOOKUP vs XLOOKUP');
    expect(r.learningGoal).toBe('Students pick the right function for a given task.');
    expect(r.concepts).toHaveLength(2);
    expect(r.concepts[0].id).toBe('card-flip-reveal');
    expect(r.concepts[0].spec.kind).toBe('card-flip-reveal');
    expect(r.concepts[1].name).toBe('Sortable Ordering');
  });

  it('passes topic / learning goal / audience tags / count into the user prompt', async () => {
    const llm = makeFakeLlm({ concepts: [validConcept()] });
    await brainstormInteractive(
      {
        topic: 'TOP',
        learningGoal: 'GOAL',
        audienceTags: ['undergraduate', 'visual-learner'],
        count: 5,
      },
      { llm },
    );
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].user).toContain('TOPIC: TOP');
    expect(llm.calls[0].user).toContain('LEARNING GOAL: GOAL');
    expect(llm.calls[0].user).toContain('AUDIENCE TAGS: undergraduate, visual-learner');
    expect(llm.calls[0].user).toContain('Propose 5 distinct widget concepts');
  });

  it('includes philosophy KB in the prompt when includePhilosophy + philosophyKb provided', async () => {
    const llm = makeFakeLlm({ concepts: [validConcept()] });
    await brainstormInteractive(
      {
        topic: 'X',
        learningGoal: 'Y',
        includePhilosophy: true,
        philosophyKb: 'KEVIN-PHILOSOPHY-TEXT',
      },
      { llm },
    );
    expect(llm.calls[0].user).toContain('INSTRUCTOR PHILOSOPHY');
    expect(llm.calls[0].user).toContain('KEVIN-PHILOSOPHY-TEXT');
  });

  it('notes when philosophy / personas were requested but not provided', async () => {
    const llm = makeFakeLlm({ concepts: [validConcept()] });
    await brainstormInteractive(
      { topic: 'X', learningGoal: 'Y', includePhilosophy: true, includePersonas: true },
      { llm },
    );
    expect(llm.calls[0].user).toContain('Instructor philosophy was requested but not provided');
    expect(llm.calls[0].user).toContain('Student personas were requested but not provided');
  });

  it('strips ```json code fences from LLM responses', async () => {
    const llm = makeFakeLlm('```json\n' + JSON.stringify({ concepts: [validConcept()] }) + '\n```');
    const r = await brainstormInteractive({ topic: 'X', learningGoal: 'Y' }, { llm });
    expect(r.concepts).toHaveLength(1);
  });

  it('throws when LLM returns non-JSON prose', async () => {
    const llm = makeFakeLlm("I can't help with that without more context.");
    await expect(
      brainstormInteractive({ topic: 'X', learningGoal: 'Y' }, { llm }),
    ).rejects.toThrow(/LLM did not return valid JSON/);
  });

  it('throws when concepts array is empty', async () => {
    const llm = makeFakeLlm({ concepts: [] });
    await expect(
      brainstormInteractive({ topic: 'X', learningGoal: 'Y' }, { llm }),
    ).rejects.toThrow(/not a non-empty array/);
  });

  it('throws when a concept is missing required spec fields', async () => {
    const broken = validConcept();
    delete (broken.spec as Partial<typeof broken.spec>).accessibility;
    const llm = makeFakeLlm({ concepts: [broken] });
    await expect(
      brainstormInteractive({ topic: 'X', learningGoal: 'Y' }, { llm }),
    ).rejects.toThrow(/spec\.accessibility/);
  });

  it("throws when pedagogicalFit is not 'high' | 'medium' | 'low'", async () => {
    const llm = makeFakeLlm({ concepts: [validConcept({ pedagogicalFit: 'maybe' as 'high' })] });
    await expect(
      brainstormInteractive({ topic: 'X', learningGoal: 'Y' }, { llm }),
    ).rejects.toThrow(/pedagogicalFit/);
  });

  it('returns usage metadata from the LLM', async () => {
    const llm = makeFakeLlm({ concepts: [validConcept()] });
    const r = await brainstormInteractive({ topic: 'X', learningGoal: 'Y' }, { llm });
    expect(r.usage).toEqual({ inputTokens: 80, outputTokens: 320 });
  });
});
