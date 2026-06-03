import { describe, expect, it } from 'vitest';
import { dimensionsToCss, dimensionsToIframeAttrs } from '../../src/tools/widget/sizing.js';
import type { InteractiveSpec } from '../../src/tools/widget/types.js';

const baseSpec: InteractiveSpec = {
  id: 'x', name: 'X', kind: 'card-flip-reveal', purpose: '', contentSchema: {}, initialContent: {},
  dimensions: { minHeight: 200, maxHeight: 600 },
  accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
};

describe('widget/sizing', () => {
  it('emits min/max-height CSS from dimensions', () => {
    const css = dimensionsToCss(baseSpec.dimensions);
    expect(css).toContain('min-height: 200px');
    expect(css).toContain('max-height: 600px');
  });

  it('handles aspectRatio when present', () => {
    const css = dimensionsToCss({ minHeight: 200, maxHeight: 600, aspectRatio: '16/9' });
    expect(css).toContain('aspect-ratio: 16/9');
  });

  it('omits aspect-ratio when absent', () => {
    const css = dimensionsToCss(baseSpec.dimensions);
    expect(css).not.toContain('aspect-ratio');
  });

  it('emits iframe attrs with maxHeight as height and minHeight as inline style', () => {
    const attrs = dimensionsToIframeAttrs(baseSpec.dimensions);
    expect(attrs.height).toBe('600');
    expect(attrs.style).toContain('min-height: 200px');
  });
});
