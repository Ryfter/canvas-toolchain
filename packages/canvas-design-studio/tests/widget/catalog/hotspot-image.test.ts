// packages/canvas-design-studio/tests/widget/catalog/hotspot-image.test.ts
import { describe, expect, it } from 'vitest';
import { hotspotImageRenderer } from '../../../src/tools/widget/catalog/hotspot-image.js';
import type { InteractiveSpec } from '../../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'excel-ribbon', name: 'Excel Ribbon Tour', kind: 'hotspot-image', purpose: 'tour',
  contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 400, maxHeight: 800 },
  accessibility: { keyboardEquivalent: 'Tab through hotspots; Enter reveals info.', screenReaderSummary: 'Annotated image with 3 hotspots.', minTouchTarget: 44 },
};

const goodContent = {
  imageUrl: 'https://example.canvas/excel-ribbon.png',
  imageAlt: 'Excel ribbon with the Home tab active',
  hotspots: [
    { x: 10, y: 20, width: 80, height: 30, label: 'Paste', info: 'Insert clipboard content.' },
    { x: 110, y: 20, width: 80, height: 30, label: 'Font', info: 'Choose typeface and size.' },
  ],
};

describe('hotspotImageRenderer schema', () => {
  it('accepts well-formed content', () => {
    expect(hotspotImageRenderer.validateContent(goodContent).ok).toBe(true);
  });
  it('rejects empty hotspots', () => {
    expect(hotspotImageRenderer.validateContent({ ...goodContent, hotspots: [] }).ok).toBe(false);
  });
  it('rejects negative coordinates', () => {
    expect(hotspotImageRenderer.validateContent({
      ...goodContent,
      hotspots: [{ x: -1, y: 0, width: 10, height: 10, label: 'x', info: 'y' }],
    }).ok).toBe(false);
  });
  it('rejects missing imageUrl', () => {
    const bad: any = { ...goodContent };
    delete bad.imageUrl;
    expect(hotspotImageRenderer.validateContent(bad).ok).toBe(false);
  });
  it('rejects missing imageAlt', () => {
    const bad: any = { ...goodContent };
    delete bad.imageAlt;
    expect(hotspotImageRenderer.validateContent(bad).ok).toBe(false);
  });
});

describe('hotspotImageRenderer render output', () => {
  const validated = hotspotImageRenderer.validateContent(goodContent);
  if (!validated.ok) throw new Error('fixture invalid');
  const { body, css, js } = hotspotImageRenderer.render(validated.value, baseSpec);

  it('renders the image with alt text', () => {
    expect(body).toContain('<img');
    expect(body).toContain('alt="Excel ribbon with the Home tab active"');
  });
  it('renders one button per hotspot', () => {
    expect((body.match(/class="hotspot[^"]*"/g) ?? []).length).toBe(2);
  });
  it('hotspots positioned via inline style with percent/pixel coordinates', () => {
    expect(body).toMatch(/left:\s*10px/);
    expect(body).toMatch(/top:\s*20px/);
  });
  it('escapes hotspot labels and info', () => {
    const evil = hotspotImageRenderer.validateContent({
      ...goodContent,
      hotspots: [{ x: 0, y: 0, width: 10, height: 10, label: '<x>', info: '<y>' }],
    });
    if (!evil.ok) throw new Error('escape fixture invalid');
    const out = hotspotImageRenderer.render(evil.value, baseSpec);
    expect(out.body).not.toContain('<x>');
    expect(out.body).not.toContain('<y>');
  });
  it('JS handles click and announces', () => {
    expect(js).toContain('addEventListener');
    expect(js).toContain('__announce');
  });
  it('no transition/animation/transform CSS', () => {
    expect(css).not.toMatch(/\b(?:transition|animation|transform)\s*:/);
  });
});
