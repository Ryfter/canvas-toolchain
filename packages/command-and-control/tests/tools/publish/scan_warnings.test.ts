import { describe, it, expect, vi } from 'vitest';

vi.mock('canvas-design-mcp/dist/tools/publish.js', () => ({
  scanFerpa: vi.fn((html: string) =>
    html.includes('B12345678') ? { reason: 'possible University student ID', line: 1 } : undefined,
  ),
}));
vi.mock('canvas-design-mcp/dist/tools/validate.js', () => ({
  validateCanvasHtml: vi.fn((html: string) =>
    html.includes('<script>') ? { valid: false, violations: [{ message: 'script tag', line: 1 }] } : { valid: true, violations: [] },
  ),
}));
vi.mock('canvas-design-mcp/dist/tools/accessibility.js', () => ({
  auditAccessibility: vi.fn((html: string) =>
    html.includes('<img') && !html.includes('alt=') ? [{ severity: 'warn', message: 'img missing alt', line: 1 }] : [],
  ),
}));

import { scanWarnings } from '../../../src/tools/publish/scan_warnings.js';

describe('scanWarnings', () => {
  it('returns empty array when HTML is clean', () => {
    expect(scanWarnings('<p>clean</p>')).toEqual([]);
  });

  it('flags FERPA findings as severity:block', () => {
    const w = scanWarnings('<p>B12345678</p>');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'ferpa', severity: 'block' });
  });

  it('flags validation violations as severity:block', () => {
    const w = scanWarnings('<p>hi</p><script>x</script>');
    expect(w.find(x => x.kind === 'validation')?.severity).toBe('block');
  });

  it('flags accessibility issues as severity:warn', () => {
    const w = scanWarnings('<img src="x.jpg">');
    expect(w.find(x => x.kind === 'a11y')?.severity).toBe('warn');
  });
});
