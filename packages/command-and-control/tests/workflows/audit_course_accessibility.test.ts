import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadReviewQueue, upsertReviewEntry } from 'canvas-design-mcp/dist/tools/a11y/records.js';
import { auditCourseAccessibility } from '../../src/tools/workflows/audit_course_accessibility.js';

const CLEAN = '<p>Read the <a href="https://example.edu/syllabus">course syllabus</a> before week one.</p>';
const BORDERLINE = '<p><a href="https://example.edu/syllabus">click here</a></p>';                 // 2.4.4 moderate
const FAIL = '<table><tr><td>Monday</td><td>Lab 1</td></tr></table>';                              // 1.3.1 serious

let courseDir: string;
beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'audit-'));
  mkdirSync(join(courseDir, 'output', 'week-01'), { recursive: true });
  writeFileSync(join(courseDir, 'output', 'week-01', 'clean.html'), CLEAN, 'utf-8');
  writeFileSync(join(courseDir, 'output', 'week-01', 'borderline.html'), BORDERLINE, 'utf-8');
  writeFileSync(join(courseDir, 'output', 'fail.html'), FAIL, 'utf-8');
});
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

describe('audit_course_accessibility', () => {
  it('audits every generated HTML file and reports per-verdict counts', async () => {
    const result = await auditCourseAccessibility({ courseDir });
    expect(result.pages).toBe(3);
    expect(result.pass).toBe(1);
    expect(result.borderline).toBe(1);
    expect(result.fail).toBe(1);
    expect(result.text).toContain('fail.html');
    expect(result.text).toContain('accessibility_review_queue');
  }, 30000);

  it('refreshes the review queue: failing pages enter, clean pages clear', async () => {
    upsertReviewEntry(courseDir, {
      page: 'week-01/clean.html',
      reasons: [{ sc: '1.4.3', detail: 'stale entry from an earlier check' }],
      lastCheckedAt: '2026-06-01',
    });
    await auditCourseAccessibility({ courseDir });
    const pages = loadReviewQueue(courseDir).map(e => e.page).sort();
    expect(pages).toEqual(['fail.html', 'week-01/borderline.html']);
  }, 30000);

  it('errors helpfully when there is no generated output', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'audit-empty-'));
    try {
      const result = await auditCourseAccessibility({ courseDir: empty });
      expect(result.error).toBe('NO_GENERATED_OUTPUT');
      expect(result.fix?.[0]).toContain('generate_course');
    } finally { rmSync(empty, { recursive: true, force: true }); }
  });
});
