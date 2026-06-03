import { describe, expect, it } from 'vitest';
import { dragToCategorizeRenderer } from '../../../src/tools/widget/catalog/drag-to-categorize.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'data-types', name: 'Data Types', kind: 'drag-to-categorize', purpose: 'categorize',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 700 },
  accessibility: { keyboardEquivalent: 'Tab to item; choose a bin from the dropdown.', screenReaderSummary: 'Three items, two bins.', minTouchTarget: 44 },
};

const goodContent = {
  items: [
    { id: 'int', label: 'Integer', correctBin: 'numeric' },
    { id: 'str', label: 'String', correctBin: 'text' },
    { id: 'flt', label: 'Float', correctBin: 'numeric' },
  ],
  bins: [
    { id: 'numeric', label: 'Numeric' },
    { id: 'text', label: 'Text' },
  ],
};

describe('dragToCategorizeRenderer schema', () => {
  it('accepts a well-formed content', () => {
    expect(dragToCategorizeRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty items', () => {
    expect(dragToCategorizeRenderer.validateContent({ items: [], bins: goodContent.bins }).ok).toBe(false);
  });
  it('rejects empty bins', () => {
    expect(dragToCategorizeRenderer.validateContent({ items: goodContent.items, bins: [] }).ok).toBe(false);
  });
  it('rejects item.correctBin not in bins', () => {
    expect(dragToCategorizeRenderer.validateContent({
      items: [{ id: 'x', label: 'X', correctBin: 'BOGUS' }],
      bins: goodContent.bins,
    }).ok).toBe(false);
  });
  it('rejects items missing fields', () => {
    expect(dragToCategorizeRenderer.validateContent({ items: [{ id: 'x', label: 'X' }], bins: goodContent.bins }).ok).toBe(false);
  });
});

describe('dragToCategorizeRenderer render output', () => {
  const validated = dragToCategorizeRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = dragToCategorizeRenderer.render(validated.value, baseSpec);

  it('renders one draggable item per items entry', () => {
    expect((body.match(/data-item-id="/g) ?? []).length).toBe(3);
  });
  it('renders one bin per bins entry', () => {
    expect((body.match(/data-bin-id="/g) ?? []).length).toBe(2);
  });
  it('each item has an explicit "Move to bin" select (dual-mode fallback)', () => {
    expect((body.match(/<select[^>]*data-action="move-to-bin"/g) ?? []).length).toBe(3);
  });
  it('escapes labels', () => {
    const evil = dragToCategorizeRenderer.validateContent({
      items: [{ id: 'x', label: '<x>', correctBin: 'numeric' }],
      bins: goodContent.bins,
    });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = dragToCategorizeRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<x>');
    expect(out.body).toContain('&lt;x&gt;');
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
  it('JS handles select change + submit + announce', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
    expect(js).toMatch(/change|submit/);
  });
});
