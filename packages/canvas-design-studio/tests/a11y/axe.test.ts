import { describe, it, expect } from 'vitest';
import { axeEngine, AXE_COVERED_SC } from '../../src/tools/a11y/axe.js';
import { DEFAULT_REQUIRED_LEVEL } from '@canvas-toolchain/shared-types';

const OPTS = { requiredLevel: DEFAULT_REQUIRED_LEVEL };

describe('axeEngine', () => {
  it('reports name and covered criteria', () => {
    expect(axeEngine.name).toBe('axe');
    expect(AXE_COVERED_SC).toEqual(expect.arrayContaining(['1.1.1', '4.1.2']));
  });

  it('finds a missing alt attribute (1.1.1, critical)', async () => {
    const { findings } = await axeEngine.check('<img src="chart.png">', OPTS);
    const f = findings.find(x => x.sc === '1.1.1');
    expect(f).toBeDefined();
    expect(f!.engine).toBe('axe');
    expect(f!.severity).toBe('critical');
    expect(f!.context).toContain('<img');
  });

  it('finds ARIA misuse the regex audit cannot see (4.1.2)', async () => {
    const html = '<div role="checkbox">agree</div>'; // aria-required-attr: missing aria-checked
    const { findings } = await axeEngine.check(html, OPTS);
    expect(findings.some(f => f.sc === '4.1.2')).toBe(true);
  });

  it('does NOT report contrast (color-contrast disabled — in-house owns it)', async () => {
    const html = '<p style="color:#999999;background:#ffffff">low contrast</p>';
    const { findings } = await axeEngine.check(html, OPTS);
    expect(findings.every(f => f.sc !== '1.4.3')).toBe(true);
  });

  it('does not flag Canvas-chrome document rules on a fragment', async () => {
    const { findings } = await axeEngine.check('<h2>Hi</h2><p>Welcome</p>', OPTS);
    expect(findings).toEqual([]);
  });

  it('every finding has catalog-backed metadata', async () => {
    const { findings } = await axeEngine.check('<img src="x.png"><div role="checkbox">y</div>', OPTS);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.sc).toMatch(/^\d\.\d\.\d{1,2}$/);
      expect(f.scName.length).toBeGreaterThan(0);
      expect(['critical', 'serious', 'moderate', 'minor']).toContain(f.severity);
    }
  });
});
