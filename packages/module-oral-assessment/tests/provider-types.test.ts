import { describe, it, expect } from 'vitest';
import type { AssessmentSpec, OralAssessmentProvider } from '../src/provider.js';

describe('provider types', () => {
  it('an AssessmentSpec is structurally usable', () => {
    const spec: AssessmentSpec = {
      title: 'Concept Check',
      promptSummary: 'Explain a concept aloud.',
      questions: [{ prompt: 'What is opportunity cost?' }],
      prepSeconds: 30,
      responseSeconds: 120,
      randomization: { pick: 1, of: 3 },
      attempts: 1,
      rubricCriteria: [{ name: 'Accuracy', description: 'Correctness', points: 10 }],
    };
    expect(spec.questions).toHaveLength(1);
  });

  it('a provider shape is assignable', () => {
    const p: Pick<OralAssessmentProvider, 'id' | 'recommended'> = { id: 'x', recommended: false };
    expect(p.id).toBe('x');
  });
});
