import { describe, it, expect } from 'vitest';
import { renderOralAssessmentMarkdown } from '../src/render_md.js';
import type { AssessmentSpec } from '../src/provider.js';

const spec: AssessmentSpec = {
  title: 'Concept Check',
  promptSummary: 'Explain opportunity cost aloud.',
  questions: [{ prompt: 'What is opportunity cost?' }],
  prepSeconds: 30,
  responseSeconds: 120,
  randomization: { pick: 1, of: 3 },
  attempts: 1,
  rubricCriteria: [{ name: 'Accuracy', description: 'Correctness', points: 10 }],
};

describe('renderOralAssessmentMarkdown', () => {
  it('writes oral-assessment front matter (flat fields) + body', () => {
    const md = renderOralAssessmentMarkdown(spec, { week: 4, launchUrl: 'https://r.edu/lti/launch', aiasLevel: 3 });
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('week: 4');
    expect(md).toContain('title: "Concept Check"');
    expect(md).toContain('prep_seconds: 30');
    expect(md).toContain('response_seconds: 120');
    expect(md).toContain('randomize_pick: 1');
    expect(md).toContain('randomize_of: 3');
    expect(md).toContain('attempts: "1"');
    expect(md).toContain('launch_url: "https://r.edu/lti/launch"');
    expect(md).toContain('aiasLevel: 3');
    expect(md).toContain('## What to expect');
    expect(md).toContain('Explain opportunity cost aloud.');
    expect(md).toContain('## Rubric');
    expect(md).toContain('## Criterion 1: Accuracy — 10 pts');
  });

  it('omits launch_url and aiasLevel when not provided', () => {
    const md = renderOralAssessmentMarkdown(spec, {});
    expect(md).not.toContain('launch_url');
    expect(md).not.toContain('aiasLevel');
  });
});
