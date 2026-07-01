import { describe, it, expect } from 'vitest';
import { inhouseEngine } from '../../src/tools/a11y/inhouse.js';
import { DEFAULT_REQUIRED_LEVEL } from '@canvas-toolchain/shared-types';

const OPTS = { requiredLevel: DEFAULT_REQUIRED_LEVEL };

describe('inhouseEngine', () => {
  it('reports name and covered criteria', async () => {
    expect(inhouseEngine.name).toBe('inhouse');
    const { criteriaCovered } = await inhouseEngine.check('<p>clean</p>', OPTS);
    expect(criteriaCovered).toEqual(expect.arrayContaining(['1.1.1', '1.2.2', '1.3.1', '1.4.3', '2.4.4']));
  });

  it('maps a clear contrast failure to 1.4.3 serious with margin', async () => {
    const html = '<p style="color:#999999;background:#ffffff">low</p>'; // ≈2.85:1
    const { findings } = await inhouseEngine.check(html, OPTS);
    const f = findings.find(x => x.sc === '1.4.3');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('serious');
    expect(f!.engine).toBe('inhouse');
    expect(f!.margin!.required).toBe(4.5);
    expect(f!.margin!.measured).toBeLessThan(0.85 * 4.5);
  });

  it('maps a borderline contrast failure to 1.4.3 moderate', async () => {
    const html = '<p style="color:#757575;background:#ffffff">close</p>'; // ≈4.6? use #767676 ≈4.54 passes; #787878 ≈4.36 borderline
    const borderline = '<p style="color:#787878;background:#ffffff">close</p>';
    const { findings } = await inhouseEngine.check(borderline, OPTS);
    const f = findings.find(x => x.sc === '1.4.3');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('moderate');
    expect(f!.margin!.measured).toBeGreaterThanOrEqual(0.85 * 4.5);
    void html;
  });

  it('maps the other checks to their SCs and severities', async () => {
    const html = [
      '<img src="chart.png" alt="">',                                   // empty-alt → 1.1.1 moderate
      '<h2>A</h2><h4>skip</h4>',                                        // heading-skip → 1.3.1 moderate
      '<a href="https://example.edu/x">click here</a>',                 // vague-link → 2.4.4 moderate
      '<table><tr><td>1</td></tr></table>',                             // table-no-headers → 1.3.1 serious
      '<iframe src="https://example.edu/Panopto/Pages/Embed.aspx?id=1"></iframe>', // video-no-captions → 1.2.2 serious
    ].join('\n');
    const { findings } = await inhouseEngine.check(html, OPTS);
    const bySc = (sc: string, sev: string) =>
      findings.some(f => f.sc === sc && f.severity === sev);
    expect(bySc('1.1.1', 'moderate')).toBe(true);
    expect(bySc('1.3.1', 'moderate')).toBe(true);
    expect(bySc('2.4.4', 'moderate')).toBe(true);
    expect(bySc('1.3.1', 'serious')).toBe(true);
    expect(bySc('1.2.2', 'serious')).toBe(true);
    for (const f of findings) {
      expect(f.scName.length).toBeGreaterThan(0);
      expect(['2.0', '2.1', '2.2']).toContain(f.scVersion);
    }
  });

  it('clean HTML produces no findings', async () => {
    const { findings } = await inhouseEngine.check('<h2>Hi</h2><p>Welcome</p>', OPTS);
    expect(findings).toEqual([]);
  });
});
