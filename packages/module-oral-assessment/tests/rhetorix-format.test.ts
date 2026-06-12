import { describe, it, expect } from 'vitest';
import { RhetorixProvider } from '../src/providers/rhetorix.js';
import type { AssessmentSpec } from '../src/provider.js';

const p = new RhetorixProvider();
const spec: AssessmentSpec = {
  title: 'Ethics of Generative AI',
  promptSummary: 'Discuss the ethics of generative AI in your field.',
  questions: [{ prompt: 'What is one ethical risk of generative AI in your field?' }, { prompt: 'How would you mitigate it?' }],
  prepSeconds: 30,
  responseSeconds: 120,
  randomization: { pick: 1, of: 2 },
  attempts: 'unlimited',
  rubricCriteria: [{ name: 'Insight', description: 'Depth of reasoning', points: 10 }],
};

describe('RhetorixProvider.formatAssessment', () => {
  it('produces paste-ready markdown with timing, questions, and rubric', () => {
    const md = p.formatAssessment(spec);
    expect(md).toContain('Ethics of Generative AI');
    expect(md).toContain('Prep: 30s');
    expect(md).toContain('Response: 2:00');
    expect(md).toContain('Randomization: 1 of 2');
    expect(md).toContain('Attempts: unlimited');
    expect(md).toContain('1. What is one ethical risk');
    expect(md).toContain('2. How would you mitigate it?');
    expect(md).toContain('Insight (10 pts): Depth of reasoning');
  });
});

describe('RhetorixProvider.buildLaunchUrl', () => {
  it('builds the lti/launch URL from a domain', () => {
    expect(p.buildLaunchUrl('rhetorixlab.boisestate.edu')).toBe('https://rhetorixlab.boisestate.edu/lti/launch');
  });
  it('returns null without a domain', () => {
    expect(p.buildLaunchUrl(undefined)).toBeNull();
    expect(p.buildLaunchUrl('')).toBeNull();
  });
});
