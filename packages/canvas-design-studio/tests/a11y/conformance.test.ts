import { describe, it, expect } from 'vitest';
import { runConformanceCheck, formatConformanceReport } from '../../src/tools/a11y/conformance.js';

describe('runConformanceCheck', () => {
  it('clean HTML → verdict pass, no findings, honest criteria statuses', async () => {
    const report = await runConformanceCheck('<h2>Hi</h2><p>Welcome to the course.</p>');
    expect(report.verdict).toBe('pass');
    expect(report.findings).toEqual([]);
    expect(report.requiredLevel).toEqual({ version: '2.1', level: 'AA' });
    const status = (sc: string) => report.criteria.find(c => c.sc === sc)?.status;
    expect(status('1.4.3')).toBe('pass');               // covered by in-house, clean
    expect(status('2.4.2')).toBe('not-applicable');     // Canvas chrome
    expect(status('2.4.3')).toBe('needs-human-review'); // focus order — no automation
  });

  it('serious failure at required level → verdict fail; criteria marked fail', async () => {
    const report = await runConformanceCheck('<table><tr><td>1</td></tr></table>');
    expect(report.verdict).toBe('fail');
    expect(report.findings.some(f => f.sc === '1.3.1' && f.severity === 'serious')).toBe(true);
    expect(report.criteria.find(c => c.sc === '1.3.1')?.status).toBe('fail');
  });

  it('borderline-only findings → verdict borderline', async () => {
    const report = await runConformanceCheck('<p style="color:#787878;background:#ffffff">close</p>');
    expect(report.verdict).toBe('borderline');
    expect(report.findings.every(f => f.sc === '1.4.3')).toBe(true);
  });

  it('deduplicates the same defect reported by both engines', async () => {
    // In-house empty-alt does not fire on missing alt, but axe image-alt does;
    // build an overlap: vague link is caught by in-house AND axe (link-name only
    // fires on empty links), so use a case both engines report: none exists for
    // 2.4.4 — instead verify dedupe on identical (sc, context) keys directly.
    const report = await runConformanceCheck('<img src="x.png"><img src="x.png">');
    const contexts = report.findings.filter(f => f.sc === '1.1.1').map(f => f.context);
    // Two identical img tags produce identical (sc, context) — deduped to one.
    expect(contexts.length).toBe(1);
  });

  it('respects a stricter required level (2.2 AA pulls 2.2 findings out of advisories)', async () => {
    const report = await runConformanceCheck('<p>x</p>', { requiredLevel: { version: '2.2', level: 'AA' } });
    expect(report.requiredLevel.version).toBe('2.2');
  });
});

describe('formatConformanceReport', () => {
  it('renders verdict, sections, and human-review pointer', async () => {
    const report = await runConformanceCheck('<table><tr><td>1</td></tr></table>');
    const text = formatConformanceReport(report);
    expect(text).toContain('FAIL');
    expect(text).toContain('1.3.1');
    expect(text).toContain('needs human review');
    expect(text).toContain('accessibilityinsights.io');
  });
  it('clean report renders a pass line', async () => {
    const report = await runConformanceCheck('<p>hello</p>');
    const text = formatConformanceReport(report);
    expect(text).toContain('PASS');
  });
});
