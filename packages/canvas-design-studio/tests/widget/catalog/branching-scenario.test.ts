import { describe, expect, it } from 'vitest';
import { branchingScenarioRenderer } from '../../../src/tools/widget/catalog/branching-scenario.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'arch-choices', name: 'Architecture Choices', kind: 'branching-scenario', purpose: 'decisions',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 800 },
  accessibility: { keyboardEquivalent: 'Tab to choice; Enter to select.', screenReaderSummary: 'Branching scenario.', minTouchTarget: 44 },
};

const goodContent = {
  start: 'start',
  nodes: {
    start: { prompt: 'You inherit a slow query. What do you do?', choices: [
      { label: 'Add an index', nextNodeId: 'index', consequence: 'Indexes speed up reads.' },
      { label: 'Rewrite as a join', nextNodeId: 'join', consequence: 'Joins can be costly.' },
    ]},
    index: { prompt: 'The query is fast now. The team asks what other indexes to add.', choices: [
      { label: 'Profile first', nextNodeId: 'done', consequence: 'Wise choice.' },
    ]},
    join: { prompt: 'The join hits a memory limit on prod.', choices: [
      { label: 'Roll back', nextNodeId: 'done', consequence: 'Stability first.' },
    ]},
    done: { prompt: 'Scenario complete.', choices: [], isEnd: true },
  },
};

describe('branchingScenarioRenderer schema', () => {
  it('accepts well-formed scenario', () => {
    expect(branchingScenarioRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects start pointing to a missing node', () => {
    const bad = { ...goodContent, start: 'nope' };
    expect(branchingScenarioRenderer.validateContent(bad).ok).toBe(false);
  });
  it('rejects choice nextNodeId pointing to a missing node', () => {
    const bad = {
      start: 'a',
      nodes: { a: { prompt: 'p', choices: [{ label: 'go', nextNodeId: 'BOGUS' }] } },
    };
    expect(branchingScenarioRenderer.validateContent(bad).ok).toBe(false);
  });
  it('rejects empty nodes object', () => {
    expect(branchingScenarioRenderer.validateContent({ start: 'a', nodes: {} }).ok).toBe(false);
  });
});

describe('branchingScenarioRenderer render output', () => {
  const validated = branchingScenarioRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = branchingScenarioRenderer.render(validated.value, baseSpec);

  it('renders the start node prompt initially', () => {
    expect(body).toContain('slow query');
  });
  it('renders one button per starting choice', () => {
    expect((body.match(/data-next-node-id="/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('escapes prompts and labels', () => {
    const evil = branchingScenarioRenderer.validateContent({
      start: 'a',
      nodes: { a: { prompt: '<x>', choices: [{ label: '<y>', nextNodeId: 'a' }] } },
    });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = branchingScenarioRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<x>');
    expect(out.body).not.toContain('<y>');
  });
  it('serializes the scenario data as inline JSON for JS lookup', () => {
    expect(js).toContain('start');
    expect(js).toContain('nodes');
  });
  it('JS handles click and announces', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
});
