import { describe, it, expect, vi } from 'vitest';

vi.mock('@canvas-toolchain/canvas-design-studio/dist/tools/publish.js', () => ({
  scanFerpa: vi.fn((html: string) =>
    html.includes('B12345678') ? { reason: 'possible University student ID', line: 1 } : undefined,
  ),
}));
vi.mock('@canvas-toolchain/canvas-design-studio/dist/tools/validate.js', () => ({
  validateCanvasHtml: vi.fn((html: string) =>
    html.includes('<script>') ? { valid: false, violations: [{ message: 'script tag', line: 1 }] } : { valid: true, violations: [] },
  ),
}));
import { runConformanceCheck } from '@canvas-toolchain/canvas-design-studio/dist/tools/a11y/conformance.js';
import { scanWarnings } from '../../../src/tools/publish/scan_warnings.js';

describe('scanWarnings', () => {
  it('returns empty array when HTML is clean', async () => {
    expect(await scanWarnings('<p>clean</p>')).toEqual([]);
  });

  it('flags FERPA findings as severity:block', async () => {
    const w = await scanWarnings('<p>B12345678</p>');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'ferpa', severity: 'block' });
  });

  it('flags validation violations as severity:block', async () => {
    const w = await scanWarnings('<p>hi</p><script>x</script>');
    expect(w.find(x => x.kind === 'validation')?.severity).toBe('block');
  });

  it('emits a block-severity a11y warning with sc + tier for a clear failure', async () => {
    // Headerless table -> in-house table-no-headers -> 1.3.1 serious -> clear failure
    const warnings = await scanWarnings('<table><tr><td>Monday</td><td>Lab 1</td></tr></table>');
    const a11y = warnings.filter(w => w.kind === 'a11y');
    const clear = a11y.find(w => w.sc === '1.3.1');
    expect(clear).toBeDefined();
    expect(clear!.severity).toBe('block');
    expect(clear!.a11yTier).toBe('clear');
    expect(clear!.message).toContain('1.3.1');
  });

  it('emits a warn-severity a11y warning with borderline tier for a moderate finding', async () => {
    // Vague link -> 2.4.4 moderate -> borderline
    const warnings = await scanWarnings('<p><a href="https://example.edu/syllabus">click here</a></p>');
    const borderline = warnings.find(w => w.kind === 'a11y' && w.sc === '2.4.4');
    expect(borderline).toBeDefined();
    expect(borderline!.severity).toBe('warn');
    expect(borderline!.a11yTier).toBe('borderline');
  });

  it('emits no a11y warnings for clean content', async () => {
    const warnings = await scanWarnings('<p>Read the <a href="https://example.edu/syllabus">course syllabus</a> first.</p>');
    expect(warnings.filter(w => w.kind === 'a11y')).toEqual([]);
  });

  it('sets marginRatio on a11y warnings using the same formula as the audit tool (#111)', async () => {
    // Near-miss body-text contrast (#777 on #fff ~= 4.48:1, requires 4.5:1) — has margin data.
    const html = '<p style="color:#777777; background-color:#ffffff;">text</p>';
    const warnings = await scanWarnings(html);
    const contrastWarning = warnings.find(w => w.kind === 'a11y' && w.sc === '1.4.3');
    expect(contrastWarning).toBeDefined();
    expect(contrastWarning!.marginRatio).toBeDefined();

    const report = await runConformanceCheck(html);
    const finding = report.findings.find(f => f.sc === '1.4.3');
    expect(finding?.margin).toBeDefined();
    expect(contrastWarning!.marginRatio).toBeCloseTo(finding!.margin!.measured / finding!.margin!.required, 10);
  });

  it('leaves marginRatio unset for a11y findings without margin data', async () => {
    // Headerless table -> 1.3.1 -> no margin concept.
    const warnings = await scanWarnings('<table><tr><td>Monday</td><td>Lab 1</td></tr></table>');
    const clear = warnings.find(w => w.kind === 'a11y' && w.sc === '1.3.1');
    expect(clear).toBeDefined();
    expect(clear!.marginRatio).toBeUndefined();
  });
});
