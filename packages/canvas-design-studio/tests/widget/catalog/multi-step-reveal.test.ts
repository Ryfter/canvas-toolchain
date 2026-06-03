import { describe, expect, it } from 'vitest';
import { multiStepRevealRenderer } from '../../../src/tools/widget/catalog/multi-step-reveal.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'formula-walk', name: 'Formula Walkthrough', kind: 'multi-step-reveal', purpose: 'walk',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 300, maxHeight: 600 },
  accessibility: { keyboardEquivalent: 'Arrow keys or Prev/Next buttons.', screenReaderSummary: 'Five-step walkthrough.', minTouchTarget: 44 },
};

const goodContent = {
  steps: [
    { title: 'Step 1', body: 'Start.' },
    { title: 'Step 2', body: 'Middle.' },
    { title: 'Step 3', body: 'End.' },
  ],
};

describe('multiStepRevealRenderer schema', () => {
  it('accepts well-formed steps', () => {
    expect(multiStepRevealRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty steps', () => {
    expect(multiStepRevealRenderer.validateContent({ steps: [] }).ok).toBe(false);
  });
  it('rejects step missing title', () => {
    expect(multiStepRevealRenderer.validateContent({ steps: [{ body: 'x' }] }).ok).toBe(false);
  });
  it('rejects step missing body', () => {
    expect(multiStepRevealRenderer.validateContent({ steps: [{ title: 'x' }] }).ok).toBe(false);
  });
});

describe('multiStepRevealRenderer render output', () => {
  const validated = multiStepRevealRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = multiStepRevealRenderer.render(validated.value, baseSpec);

  it('renders the first step initially visible', () => {
    expect(body).toContain('Start.');
  });
  it('has Previous and Next buttons', () => {
    expect(body).toMatch(/data-action="prev"/);
    expect(body).toMatch(/data-action="next"/);
  });
  it('shows step counter', () => {
    expect(body).toMatch(/Step 1 of 3|1 of 3/);
  });
  it('escapes content', () => {
    const evil = multiStepRevealRenderer.validateContent({ steps: [{ title: '<t>', body: '<b>' }] });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = multiStepRevealRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<t>');
    expect(out.body).not.toContain('<b>');
  });
  it('JS handles next/prev clicks + Arrow keys + announces', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
    expect(js).toMatch(/ArrowRight|ArrowLeft|key/);
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
});
