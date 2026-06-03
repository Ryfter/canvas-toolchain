import { describe, expect, it } from 'vitest';
import { sortableOrderingRenderer } from '../../../src/tools/widget/catalog/sortable-ordering.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'sdlc-order', name: 'SDLC Phases', kind: 'sortable-ordering', purpose: 'order steps',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 700 },
  accessibility: { keyboardEquivalent: 'Tab to item; Enter to pick up; arrows to move; Enter to drop. Or use the explicit Move Up/Move Down buttons.', screenReaderSummary: 'Five items to sort.', minTouchTarget: 44 },
};

const goodContent = {
  items: [
    { id: 'plan', label: 'Plan' },
    { id: 'design', label: 'Design' },
    { id: 'implement', label: 'Implement' },
    { id: 'test', label: 'Test' },
    { id: 'deploy', label: 'Deploy' },
  ],
  correctOrder: ['plan', 'design', 'implement', 'test', 'deploy'],
};

describe('sortableOrderingRenderer schema', () => {
  it('accepts a well-formed items + correctOrder', () => {
    expect(sortableOrderingRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty items array', () => {
    expect(sortableOrderingRenderer.validateContent({ items: [], correctOrder: [] }).ok).toBe(false);
  });
  it('rejects items missing id', () => {
    expect(sortableOrderingRenderer.validateContent({ items: [{ label: 'x' }], correctOrder: ['x'] }).ok).toBe(false);
  });
  it('rejects items missing label', () => {
    expect(sortableOrderingRenderer.validateContent({ items: [{ id: 'x' }], correctOrder: ['x'] }).ok).toBe(false);
  });
  it('rejects correctOrder length mismatch', () => {
    expect(sortableOrderingRenderer.validateContent({ items: goodContent.items, correctOrder: ['plan'] }).ok).toBe(false);
  });
  it('rejects correctOrder containing unknown id', () => {
    expect(sortableOrderingRenderer.validateContent({ items: goodContent.items, correctOrder: ['plan','design','implement','test','BOGUS'] }).ok).toBe(false);
  });
});

describe('sortableOrderingRenderer render output', () => {
  const validated = sortableOrderingRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = sortableOrderingRenderer.render(validated.value, baseSpec);

  it('emits one list item per content item', () => {
    expect((body.match(/<li[\s>]/g) ?? []).length).toBe(5);
  });
  it('every item has an explicit Move Up and Move Down button (dual-mode)', () => {
    expect((body.match(/aria-label="Move .*up/gi) ?? []).length).toBe(5);
    expect((body.match(/aria-label="Move .*down/gi) ?? []).length).toBe(5);
  });
  it('each item label is HTML-escaped', () => {
    const evilContent = { items: [{ id: 'x', label: '<script>' }, { id: 'y', label: 'safe' }], correctOrder: ['x', 'y'] };
    const v = sortableOrderingRenderer.validateContent(evilContent);
    if (!v.ok) throw new Error('escape fixture invalid');
    const out = sortableOrderingRenderer.render(v.value, baseSpec);
    expect(out.body).not.toContain('<script>');
    expect(out.body).toContain('&lt;script&gt;');
  });
  it('includes a Submit button', () => {
    expect(body).toMatch(/<button[^>]*data-action="submit"/);
  });
  it('uses no CSS transition / animation / transform', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
  it('emits JS handling move-up, move-down, submit, and announce calls', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
    expect(js).toMatch(/data-action="(?:up|down|submit)"/);
  });
});
