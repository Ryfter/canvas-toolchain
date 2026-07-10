import { describe, it, expect } from 'vitest';
import { validateApprovals } from '../../../src/tools/publish/approvals.js';
import type { PreviewManifest, ManifestEntry } from '../../../src/tools/publish/manifest_types.js';

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

// Phase 3 (Task 8): canonical relPath keys, with unambiguous-filename aliasing for
// back-compat. Local fixture helpers below adapt this file's flat `manifest([filenames])`
// style to per-entry relPath control, matching PAGE_ENTRY's optional 4th arg in the
// a11y-gate suite.
function pageEntry(filename: string, opts: { relPath?: string } = {}): ManifestEntry {
  return {
    type: 'page', filename, ...(opts.relPath !== undefined && { relPath: opts.relPath }),
    pageType: 'overview', intendedTitle: filename, collisionAction: 'update',
    diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
    warnings: [],
  };
}

function manifestWith(entries: ManifestEntry[]): PreviewManifest {
  return {
    snapshotId: 'x', courseId: 1, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
    git: { isRepo: false },
    entries,
    summary: {
      total: entries.length,
      pages: entries.filter(e => e.type === 'page').length,
      assignments: entries.filter(e => e.type === 'assignment').length,
      skipped: entries.filter(e => e.type === 'skipped').length,
      warningsCount: 0, ferpaCount: 0, collisionsCount: 0,
    },
  };
}

describe('validateApprovals — canonical relPath keys (Phase 3)', () => {
  it('accepts approvals keyed by relPath', () => {
    const manifest = manifestWith([
      pageEntry('overview.html', { relPath: 'week-01/overview.html' }),
      pageEntry('overview2.html', { relPath: 'week-02/overview.html' }),
    ]);
    const v = validateApprovals(manifest, {
      'week-01/overview.html': 'approve',
      'week-02/overview.html': 'skip',
    });
    expect(v.ok).toBe(true);
  });

  it('still accepts a filename key when it is unambiguous', () => {
    const manifest = manifestWith([pageEntry('overview.html', { relPath: 'week-01/overview.html' })]);
    expect(validateApprovals(manifest, { 'overview.html': 'approve' }).ok).toBe(true);
  });

  it('reports missing entries by their canonical relPath', () => {
    const manifest = manifestWith([pageEntry('overview.html', { relPath: 'week-01/overview.html' })]);
    const v = validateApprovals(manifest, {});
    expect(v.missing).toEqual(['week-01/overview.html']);
  });

  it('rejects a filename alias that matches two entries (ambiguous across weeks)', () => {
    const manifest = manifestWith([
      pageEntry('overview.html', { relPath: 'week-01/overview.html' }),
      pageEntry('overview.html', { relPath: 'week-02/overview.html' }),
    ]);
    const v = validateApprovals(manifest, { 'overview.html': 'approve' });
    expect(v.ok).toBe(false);
    expect(v.unknown).toContain('overview.html');
    expect(v.missing).toEqual(['week-01/overview.html', 'week-02/overview.html']);
  });
});
