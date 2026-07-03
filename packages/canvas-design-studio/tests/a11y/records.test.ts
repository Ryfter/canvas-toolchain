import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendAcknowledgment, loadAcknowledgments,
  loadReviewQueue, upsertReviewEntry, clearReviewEntryIfClean, resolveReviewEntry, sortWorstFirst,
  type AcknowledgmentRecord, type ReviewQueueEntry,
} from '../../src/tools/a11y/records.js';

let courseDir: string;
beforeEach(() => { courseDir = mkdtempSync(join(tmpdir(), 'a11y-records-')); });
afterEach(() => { rmSync(courseDir, { recursive: true, force: true }); });

function ack(over: Partial<AcknowledgmentRecord> = {}): AcknowledgmentRecord {
  return {
    at: '2026-07-02T10:00:00Z', page: 'week-3-lab.html',
    canvasUrl: 'https://example.instructure.com/courses/123/pages/week-3-lab',
    tier: 'fail', scIds: ['1.4.3'], requiredLevel: 'WCAG 2.1 AA', ...over,
  };
}

describe('acknowledgments store', () => {
  it('appends records, creating .a11y/ on demand', () => {
    appendAcknowledgment(courseDir, ack());
    appendAcknowledgment(courseDir, ack({ tier: 'borderline', scIds: [] }));
    const records = loadAcknowledgments(courseDir);
    expect(records).toHaveLength(2);
    expect(records[0].scIds).toEqual(['1.4.3']);
    expect(records[1].tier).toBe('borderline');
  });

  it('returns [] when nothing was ever recorded', () => {
    expect(loadAcknowledgments(courseDir)).toEqual([]);
  });

  it('quarantines a corrupt file instead of overwriting it', () => {
    mkdirSync(join(courseDir, '.a11y'), { recursive: true });
    writeFileSync(join(courseDir, '.a11y', 'acknowledgments.json'), '{not json', 'utf-8');
    appendAcknowledgment(courseDir, ack());
    const files = readdirSync(join(courseDir, '.a11y'));
    expect(files.some(f => f.startsWith('acknowledgments.json.corrupt-'))).toBe(true);
    expect(loadAcknowledgments(courseDir)).toHaveLength(1);
    const corrupt = files.find(f => f.startsWith('acknowledgments.json.corrupt-'))!;
    expect(readFileSync(join(courseDir, '.a11y', corrupt), 'utf-8')).toBe('{not json');
  });
});

describe('review queue store', () => {
  const entry = (page: string, marginRatio?: number): Omit<ReviewQueueEntry, 'status'> => ({
    page,
    reasons: [{ sc: '1.4.3', detail: '4.32:1 measured, 4.5:1 required', ...(marginRatio !== undefined && { marginRatio }) }],
    lastCheckedAt: '2026-07-02',
  });

  it('upserts by page and reopens a reviewed entry on new findings', () => {
    upsertReviewEntry(courseDir, entry('a.html'));
    expect(resolveReviewEntry(courseDir, 'a.html', 'looks fine on screen')).toBe(true);
    expect(loadReviewQueue(courseDir)[0].status).toBe('reviewed-by-human');
    upsertReviewEntry(courseDir, entry('a.html'));
    const q = loadReviewQueue(courseDir);
    expect(q).toHaveLength(1);
    expect(q[0].status).toBe('open');
  });

  it('resolve returns false for an unknown page', () => {
    expect(resolveReviewEntry(courseDir, 'nope.html')).toBe(false);
  });

  it('clearReviewEntryIfClean removes the entry and tolerates absence', () => {
    upsertReviewEntry(courseDir, entry('a.html'));
    clearReviewEntryIfClean(courseDir, 'a.html');
    clearReviewEntryIfClean(courseDir, 'a.html');
    expect(loadReviewQueue(courseDir)).toEqual([]);
  });

  it('sortWorstFirst orders by lowest margin ratio, marginless entries after', () => {
    const entries: ReviewQueueEntry[] = [
      { ...entry('no-margin.html'), status: 'open' },
      { ...entry('close.html', 0.99), status: 'open' },
      { ...entry('worst.html', 0.86), status: 'open' },
    ];
    expect(sortWorstFirst(entries).map(e => e.page)).toEqual(['worst.html', 'close.html', 'no-margin.html']);
  });
});
