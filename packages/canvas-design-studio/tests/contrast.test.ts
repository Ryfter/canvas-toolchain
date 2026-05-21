import { describe, expect, it } from 'vitest';
import { wcagContrastRatio } from '../src/tools/contrast.js';

describe('wcagContrastRatio', () => {
  it('BSU blue on white passes AA (10.6:1)', () => {
    const ratio = wcagContrastRatio('#0033A0', '#ffffff');
    expect(ratio).toBeGreaterThan(4.5);
  });

  it('BSU orange on white is marginal (≈4.5:1)', () => {
    const ratio = wcagContrastRatio('#D64309', '#ffffff');
    expect(ratio).toBeGreaterThanOrEqual(4.4);
    expect(ratio).toBeLessThanOrEqual(4.6);
  });

  it('light gray on white fails AA (≈1.6:1)', () => {
    const ratio = wcagContrastRatio('#cccccc', '#ffffff');
    expect(ratio).toBeLessThan(3.0);
  });

  it('is symmetric — order of arguments does not matter', () => {
    const a = wcagContrastRatio('#0033A0', '#ffffff');
    const b = wcagContrastRatio('#ffffff', '#0033A0');
    expect(a).toBeCloseTo(b, 5);
  });
});
