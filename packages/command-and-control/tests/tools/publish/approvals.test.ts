import { describe, it, expect } from 'vitest';
import { validateApprovals } from '../../../src/tools/publish/approvals.js';
import type { PreviewManifest } from '../../../src/tools/publish/manifest_types.js';

function manifest(filenames: string[], skippedFilenames: string[] = []): PreviewManifest {
  return {
    snapshotId: 'x', courseId: 1, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
    git: { isRepo: false },
    entries: [
      ...filenames.map(f => ({ type: 'page' as const, filename: f, pageType: 'overview' as const, intendedTitle: f, collisionAction: 'update' as const, diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true }, warnings: [] })),
      ...skippedFilenames.map(f => ({ type: 'skipped' as const, filename: f, pageType: 'weekly-quiz' as const, reason: 'out-of-scope-v0.9' as const, recommendation: 'x' })),
    ],
    summary: { total: filenames.length + skippedFilenames.length, pages: filenames.length, assignments: 0, skipped: skippedFilenames.length, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
}

describe('validateApprovals', () => {
  it('accepts a complete approval map covering every non-skipped entry', () => {
    const m = manifest(['a.html', 'b.html']);
    const r = validateApprovals(m, { 'a.html': 'approve', 'b.html': 'skip' });
    expect(r.ok).toBe(true);
  });

  it('rejects when manifest entries are missing from approvals', () => {
    const m = manifest(['a.html', 'b.html']);
    const r = validateApprovals(m, { 'a.html': 'approve' });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['b.html']);
  });

  it('rejects unknown filenames in approvals', () => {
    const m = manifest(['a.html']);
    const r = validateApprovals(m, { 'a.html': 'approve', 'unknown.html': 'skip' });
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual(['unknown.html']);
  });

  it('ignores skipped-entry filenames in approvals (they need not be approved/skipped)', () => {
    const m = manifest(['a.html'], ['quiz.html']);
    const r = validateApprovals(m, { 'a.html': 'approve' });
    expect(r.ok).toBe(true);
  });
});
