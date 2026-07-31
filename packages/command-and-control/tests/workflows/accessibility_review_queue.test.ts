import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { upsertReviewEntry, loadReviewQueue } from '@canvas-toolchain/canvas-design-studio/dist/tools/a11y/records.js';
import { accessibilityReviewQueue } from '../../src/tools/workflows/accessibility_review_queue.js';

let courseDir: string;
beforeEach(() => {
  courseDir = mkdtempSync(join(tmpdir(), 'arq-'));
  upsertReviewEntry(courseDir, {
    page: 'week-3-lab.html',
    canvasUrl: 'https://example.instructure.com/courses/123/pages/week-3-lab',
    reasons: [{ sc: '1.4.3', detail: '4.32:1 measured, 4.5:1 required', marginRatio: 0.96 }],
    lastCheckedAt: '2026-07-02',
  });
  upsertReviewEntry(courseDir, {
    page: 'week-1-intro.html',
    reasons: [{ sc: '1.4.3', detail: '3.90:1 measured, 4.5:1 required', marginRatio: 0.867 }],
    lastCheckedAt: '2026-07-02',
  });
});
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

describe('accessibility_review_queue', () => {
  it('lists open entries worst-margin first with URL, criteria, and last-checked date', async () => {
    const result = await accessibilityReviewQueue({ courseDir });
    expect(result.open).toBe(2);
    expect(result.text.indexOf('week-1-intro.html')).toBeLessThan(result.text.indexOf('week-3-lab.html'));
    expect(result.text).toContain('https://example.instructure.com/courses/123/pages/week-3-lab');
    expect(result.text).toContain('1.4.3');
    expect(result.text).toContain('2026-07-02');
  });

  it('resolve marks an entry reviewed-by-human with the note', async () => {
    const result = await accessibilityReviewQueue({
      courseDir, action: 'resolve', page: 'week-3-lab.html', note: 'checked on screen, contrast fine',
    });
    expect(result.error).toBeUndefined();
    const entry = loadReviewQueue(courseDir).find(e => e.page === 'week-3-lab.html')!;
    expect(entry.status).toBe('reviewed-by-human');
    expect(entry.note).toBe('checked on screen, contrast fine');
    expect(result.open).toBe(1);
    expect(result.reviewed).toBe(1);
  });

  it('resolve without page or with an unknown page returns a structured error', async () => {
    const noPage = await accessibilityReviewQueue({ courseDir, action: 'resolve' });
    expect(noPage.error).toBe('PAGE_REQUIRED');
    const unknown = await accessibilityReviewQueue({ courseDir, action: 'resolve', page: 'nope.html' });
    expect(unknown.error).toBe('PAGE_NOT_IN_QUEUE');
  });

  it('missing courseDir returns COURSE_DIR_NOT_FOUND with a fix', async () => {
    const result = await accessibilityReviewQueue({ courseDir: join(courseDir, 'does-not-exist') });
    expect(result.error).toBe('COURSE_DIR_NOT_FOUND');
    expect(result.fix?.length).toBeGreaterThan(0);
  });

  it('an empty queue lists cleanly', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'arq-empty-'));
    try {
      const result = await accessibilityReviewQueue({ courseDir: empty });
      expect(result.open).toBe(0);
      expect(result.text).toContain('empty');
    } finally { rmSync(empty, { recursive: true, force: true }); }
  });
});
