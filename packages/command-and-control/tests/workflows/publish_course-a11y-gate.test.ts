import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('canvas-design-mcp/dist/tools/publish.js', () => ({
  publishToCanvas: vi.fn(),
  titleSimilarity: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/update-assignment-description.js', () => ({
  updateAssignmentDescription: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/canvas-api.js', () => ({
  CanvasApiClient: vi.fn().mockImplementation(() => ({})),
  CanvasApiError: class extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
  },
}));
vi.mock('../../src/tools/publish/canvas_config_bridge.js', () => ({
  loadInstitutionConfig: vi.fn().mockReturnValue({ canvasUrl: 'https://x', apiToken: 't' }),
}));
vi.mock('../../src/tools/publish/git_state.js', () => ({
  detectGitState: vi.fn().mockReturnValue({ isRepo: false }),
  gitCommitPrePublish: vi.fn(),
  gitTagSuccess: vi.fn(),
  gitPushTag: vi.fn(() => ({ ok: true })),
}));

import { publishToCanvas } from 'canvas-design-mcp/dist/tools/publish.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import {
  appendAcknowledgment, loadAcknowledgments, loadReviewQueue, upsertReviewEntry, sortWorstFirst,
  type AcknowledgmentRecord,
} from 'canvas-design-mcp/dist/tools/a11y/records.js';
import {
  createSnapshotDir, writeManifest, writeState, writePriorHtml, writeNewHtml,
} from '../../src/tools/publish/snapshot_store.js';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import type { PreviewManifest, ManifestEntry, Warning } from '../../src/tools/publish/manifest_types.js';

const CLEAR_WARNING: Warning = {
  kind: 'a11y', severity: 'block',
  message: '1.3.1 Info and Relationships — table has no header cells',
  sc: '1.3.1', a11yTier: 'clear',
};
const BORDERLINE_WARNING: Warning = {
  kind: 'a11y', severity: 'warn',
  message: '2.4.4 Link Purpose — vague link text',
  sc: '2.4.4', a11yTier: 'borderline',
};
const BORDERLINE_WARNING_WITH_MARGIN: Warning = {
  kind: 'a11y', severity: 'warn',
  message: '1.4.3 Contrast (Minimum) — near-miss contrast',
  sc: '1.4.3', a11yTier: 'borderline', marginRatio: 0.92,
};
const FERPA_BLOCK: Warning = { kind: 'ferpa', severity: 'block', message: 'possible student ID' };

let cc: string;
let courseDir: string;

beforeEach(() => {
  cc = mkdtempSync(join(tmpdir(), 'cc-a11y-'));
  process.env.CC_HOME = cc;
  courseDir = join(cc, 'course');

  // Realistic-but-mocked CDS publishToCanvas: appends an acknowledgment record
  // when acknowledgeAccessibility + courseDir are supplied, accurately simulating
  // CDS behavior. This suite verifies C&C's wiring by asserting on the mock's
  // received arguments (the tier/scIds are derived by the mock to simulate CDS).
  vi.mocked(publishToCanvas).mockImplementation(async (input: any) => {
    const result: any = {
      url: `https://x/${input.pageTitle}`,
      action: input.collisionAction === 'create' ? 'created' : 'updated',
      pageTitle: input.pageTitle,
      tip: '',
    };
    if (input.acknowledgeAccessibility !== undefined && input.courseDir) {
      const tier: 'borderline' | 'fail' = input.acknowledgeAccessibility === true ? 'borderline' : 'fail';
      const scIds: string[] = Array.isArray(input.acknowledgeAccessibility) ? input.acknowledgeAccessibility : [];
      const record: AcknowledgmentRecord = {
        at: new Date().toISOString(), page: input.pageTitle, canvasUrl: result.url,
        tier, scIds, requiredLevel: 'WCAG 2.1 AA',
      };
      appendAcknowledgment(input.courseDir, record);
      result.acknowledgment = record;
    }
    return result;
  });
  vi.mocked(updateAssignmentDescription).mockResolvedValue(undefined as any);
});

afterEach(() => {
  rmSync(cc, { recursive: true, force: true });
  delete process.env.CC_HOME;
  vi.clearAllMocks();
});

function seedSnapshot(snapshotId: string, entries: PreviewManifest['entries']): void {
  const dir = createSnapshotDir(snapshotId);
  const m: PreviewManifest = {
    snapshotId, courseId: 42, courseDir, generatedAt: '2026-07-03T00:00:00Z',
    git: { isRepo: false }, entries,
    summary: { total: entries.length, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, m);
  writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: m.generatedAt });
  for (const e of entries) {
    if (e.type === 'skipped') continue;
    writePriorHtml(dir, e.filename, '<p>old</p>');
    writeNewHtml(dir, e.filename, '<p>new</p>');
  }
}

const PAGE_ENTRY = (filename: string, title: string, warnings: Warning[], relPath?: string): ManifestEntry => ({
  type: 'page', filename, ...(relPath !== undefined && { relPath }),
  pageType: 'overview', intendedTitle: title, collisionAction: 'update',
  diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
  warnings, canvasMatch: { pageId: filename, url: 'https://x/' + filename, existingTitle: title, similarity: 1 },
});

const ASSIGNMENT_ENTRY = (filename: string, title: string, warnings: Warning[]): ManifestEntry => ({
  type: 'assignment', filename, pageType: 'assignment', intendedTitle: title,
  canvasMatch: { assignmentId: 55, name: title, similarity: 1 },
  diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
  warnings,
});

describe('publishCourse — per-entry accessibility gate (Task 5)', () => {
  it('blocks an approved file with clear a11y failures when no acknowledgment covers it', async () => {
    seedSnapshot('snap-clear-noack', [PAGE_ENTRY('week-1.html', 'Week 1', [CLEAR_WARNING])]);

    const result = await publishCourse(
      { snapshotId: 'snap-clear-noack', approvals: { 'week-1.html': 'approve' }, canvasBreadcrumbs: false },
    );

    expect(result.failed?.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
    expect(result.phase).toBe('partial');
    expect(result.fix?.[0]).toContain('a11yAcknowledgments');
    expect(result.fix?.[0]).toContain('"1.3.1"');
    expect(publishToCanvas).not.toHaveBeenCalled();
  });

  it('blocks borderline without ack; publishes with { file: true } and writes the record + queue entry', async () => {
    seedSnapshot('snap-borderline-1', [PAGE_ENTRY('week-1.html', 'Week 1', [BORDERLINE_WARNING])]);
    const blocked = await publishCourse(
      { snapshotId: 'snap-borderline-1', approvals: { 'week-1.html': 'approve' }, canvasBreadcrumbs: false },
    );
    expect(blocked.failed?.code).toBe('ACCESSIBILITY_ACK_REQUIRED');
    expect(publishToCanvas).not.toHaveBeenCalled();

    seedSnapshot('snap-borderline-2', [PAGE_ENTRY('week-1.html', 'Week 1', [BORDERLINE_WARNING])]);
    const ok = await publishCourse(
      {
        snapshotId: 'snap-borderline-2', approvals: { 'week-1.html': 'approve' },
        a11yAcknowledgments: { 'week-1.html': true }, canvasBreadcrumbs: false,
      },
    );
    expect(ok.phase).toBe('published');

    // Verify C&C passed the correct acknowledgeAccessibility argument to publishToCanvas
    const borderlineCall = vi.mocked(publishToCanvas).mock.calls.find(
      call => call[0].pageTitle === 'Week 1'
    );
    expect(borderlineCall).toBeDefined();
    expect(borderlineCall![0].acknowledgeAccessibility).toBe(true);
    expect(borderlineCall![0].courseDir).toBe(courseDir);

    const acks = loadAcknowledgments(courseDir);
    expect(acks).toHaveLength(1);

    const queue = loadReviewQueue(courseDir);
    expect(queue.map(q => q.page)).toContain('week-1.html');
  });

  it('publishes clear failures with the named-SC array and keeps FERPA blocks absolute', async () => {
    seedSnapshot('snap-mixed', [
      PAGE_ENTRY('week-1.html', 'Week 1', [CLEAR_WARNING]),
      PAGE_ENTRY('week-2.html', 'Week 2', [FERPA_BLOCK]),
    ]);

    const result = await publishCourse({
      snapshotId: 'snap-mixed',
      approvals: { 'week-1.html': 'approve', 'week-2.html': 'approve' },
      a11yAcknowledgments: { 'week-1.html': ['1.3.1'], 'week-2.html': ['1.3.1'] },
      canvasBreadcrumbs: false,
    });

    expect(result.published).toHaveLength(1);
    expect(result.published[0]!.filename).toBe('week-1.html');
    expect(result.failed?.filename).toBe('week-2.html');
    expect(result.failed?.code).toBe('BLOCKING_WARNINGS');
    expect(result.phase).toBe('partial');

    // Verify C&C passed the correct acknowledgeAccessibility array argument to publishToCanvas
    const failCall = vi.mocked(publishToCanvas).mock.calls.find(
      call => call[0].pageTitle === 'Week 1'
    );
    expect(failCall).toBeDefined();
    expect(failCall![0].acknowledgeAccessibility).toEqual(['1.3.1']);
    expect(failCall![0].courseDir).toBe(courseDir);

    const acks = loadAcknowledgments(courseDir);
    expect(acks).toHaveLength(1);
  });

  it('a clean published file clears its stale review-queue entry', async () => {
    upsertReviewEntry(courseDir, {
      page: 'week-1.html',
      reasons: [{ sc: '2.4.4', detail: 'stale finding' }],
      lastCheckedAt: '2026-01-01',
    });
    expect(loadReviewQueue(courseDir)).toHaveLength(1);

    seedSnapshot('snap-clean', [PAGE_ENTRY('week-1.html', 'Week 1', [])]);
    const result = await publishCourse(
      { snapshotId: 'snap-clean', approvals: { 'week-1.html': 'approve' }, canvasBreadcrumbs: false },
    );

    expect(result.phase).toBe('published');
    expect(loadReviewQueue(courseDir)).toEqual([]);
  });

  it('assignment branch appends the acknowledgment record directly (no CDS call needed)', async () => {
    seedSnapshot('snap-assign', [ASSIGNMENT_ENTRY('hw1.html', 'HW1', [BORDERLINE_WARNING])]);

    const result = await publishCourse({
      snapshotId: 'snap-assign', approvals: { 'hw1.html': 'approve' },
      a11yAcknowledgments: { 'hw1.html': true }, canvasBreadcrumbs: false,
    });

    expect(result.phase).toBe('published');
    expect(publishToCanvas).not.toHaveBeenCalled();
    expect(updateAssignmentDescription).toHaveBeenCalledOnce();

    const acks = loadAcknowledgments(courseDir);
    expect(acks).toHaveLength(1);
    expect(acks[0]!.tier).toBe('borderline');

    const queue = loadReviewQueue(courseDir);
    expect(queue.map(q => q.page)).toContain('hw1.html');
  });

  it('legacy warnings without a11yTier do not gate (back-compat)', async () => {
    const legacyWarning: Warning = { kind: 'a11y', severity: 'warn', message: 'old-format warning' };
    seedSnapshot('snap-legacy', [PAGE_ENTRY('week-1.html', 'Week 1', [legacyWarning])]);

    const result = await publishCourse(
      { snapshotId: 'snap-legacy', approvals: { 'week-1.html': 'approve' }, canvasBreadcrumbs: false },
    );

    expect(result.phase).toBe('published');
    expect(result.failed).toBeUndefined();
  });
});

describe('publishCourse — review-queue page keys use the output-relative path (#111)', () => {
  it('keys the queue entry by relPath when the manifest carries one', async () => {
    seedSnapshot('snap-relpath', [
      PAGE_ENTRY('overview.html', 'Week 1 Overview', [BORDERLINE_WARNING], 'week-01/overview.html'),
    ]);

    const result = await publishCourse({
      snapshotId: 'snap-relpath', approvals: { 'overview.html': 'approve' },
      a11yAcknowledgments: { 'overview.html': true }, canvasBreadcrumbs: false,
    });

    expect(result.phase).toBe('published');
    const pages = loadReviewQueue(courseDir).map(q => q.page);
    expect(pages).toContain('week-01/overview.html');
    expect(pages).not.toContain('overview.html');
  });

  it('a clean publish clears an audit-created entry stored under the relPath key', async () => {
    // Simulate audit_course_accessibility's keying (output-relative path) — same key
    // format a real course audit would use for <outDir>/week-01/overview.html.
    upsertReviewEntry(courseDir, {
      page: 'week-01/overview.html',
      reasons: [{ sc: '2.4.4', detail: 'stale audit finding' }],
      lastCheckedAt: '2026-01-01',
    });
    expect(loadReviewQueue(courseDir)).toHaveLength(1);

    seedSnapshot('snap-relpath-clean', [
      PAGE_ENTRY('overview.html', 'Week 1 Overview', [], 'week-01/overview.html'),
    ]);
    const result = await publishCourse(
      { snapshotId: 'snap-relpath-clean', approvals: { 'overview.html': 'approve' }, canvasBreadcrumbs: false },
    );

    expect(result.phase).toBe('published');
    expect(loadReviewQueue(courseDir)).toEqual([]);
  });

  it('the direct assignment-branch acknowledgment record is keyed by relPath too', async () => {
    seedSnapshot('snap-assign-relpath', [
      { ...ASSIGNMENT_ENTRY('hw1.html', 'HW1', [BORDERLINE_WARNING]), relPath: 'week-02/hw1.html' } as ManifestEntry,
    ]);

    const result = await publishCourse({
      snapshotId: 'snap-assign-relpath', approvals: { 'hw1.html': 'approve' },
      a11yAcknowledgments: { 'hw1.html': true }, canvasBreadcrumbs: false,
    });

    expect(result.phase).toBe('published');
    const acks = loadAcknowledgments(courseDir);
    expect(acks.at(-1)?.page).toBe('week-02/hw1.html');

    const pages = loadReviewQueue(courseDir).map(q => q.page);
    expect(pages).toContain('week-02/hw1.html');
  });

  it('pre-#111 snapshots without relPath still key by filename (back-compat)', async () => {
    seedSnapshot('snap-legacy-key', [PAGE_ENTRY('week-1.html', 'Week 1', [BORDERLINE_WARNING])]);

    const result = await publishCourse({
      snapshotId: 'snap-legacy-key', approvals: { 'week-1.html': 'approve' },
      a11yAcknowledgments: { 'week-1.html': true }, canvasBreadcrumbs: false,
    });

    expect(result.phase).toBe('published');
    expect(loadReviewQueue(courseDir).map(q => q.page)).toContain('week-1.html');
  });
});

describe('publishCourse — margin flows from Warning into the review queue (#111)', () => {
  it('carries marginRatio from the warning into the queue reason', async () => {
    seedSnapshot('snap-margin', [
      PAGE_ENTRY('week-1.html', 'Week 1', [BORDERLINE_WARNING_WITH_MARGIN], 'week-01/overview.html'),
    ]);

    const result = await publishCourse({
      snapshotId: 'snap-margin', approvals: { 'week-1.html': 'approve' },
      a11yAcknowledgments: { 'week-1.html': true }, canvasBreadcrumbs: false,
    });

    expect(result.phase).toBe('published');
    const entry = loadReviewQueue(courseDir).find(q => q.page === 'week-01/overview.html');
    expect(entry).toBeDefined();
    expect(entry!.reasons[0]!.marginRatio).toBe(0.92);
  });

  it('sorts a publish-sourced margin entry ahead of a marginless entry (not marginless-last)', async () => {
    // A marginless (e.g. legacy audit-sourced) entry already in the queue.
    upsertReviewEntry(courseDir, {
      page: 'week-02/other.html',
      reasons: [{ sc: '1.3.1', detail: 'no margin data' }],
      lastCheckedAt: '2026-01-01',
    });

    seedSnapshot('snap-margin-sort', [
      PAGE_ENTRY('week-1.html', 'Week 1', [BORDERLINE_WARNING_WITH_MARGIN], 'week-01/overview.html'),
    ]);
    await publishCourse({
      snapshotId: 'snap-margin-sort', approvals: { 'week-1.html': 'approve' },
      a11yAcknowledgments: { 'week-1.html': true }, canvasBreadcrumbs: false,
    });

    const sorted = sortWorstFirst(loadReviewQueue(courseDir));
    expect(sorted[0]!.page).toBe('week-01/overview.html');
  });
});
