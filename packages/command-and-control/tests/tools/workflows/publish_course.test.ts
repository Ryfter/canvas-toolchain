import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('@canvas-toolchain/canvas-design-studio/dist/tools/publish.js', () => ({
  publishToCanvas: vi.fn(),
  titleSimilarity: vi.fn(),
}));
vi.mock('@canvas-toolchain/canvas-design-studio/dist/tools/update-assignment-description.js', () => ({
  updateAssignmentDescription: vi.fn(),
}));
vi.mock('@canvas-toolchain/canvas-design-studio/dist/canvas-api.js', () => ({
  CanvasApiClient: vi.fn().mockImplementation(() => ({})),
  CanvasApiError: class extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
  },
}));
vi.mock('../../../src/tools/publish/canvas_config_bridge.js', () => ({
  loadInstitutionConfig: vi.fn().mockReturnValue({ canvasUrl: 'https://x', apiToken: 't' }),
}));
vi.mock('../../../src/tools/publish/git_state.js', () => ({
  detectGitState: vi.fn().mockReturnValue({ isRepo: false }),
  gitCommitPrePublish: vi.fn(),
  gitTagSuccess: vi.fn(),
  gitPushTag: vi.fn(() => ({ ok: true })),
}));

import { publishToCanvas } from '@canvas-toolchain/canvas-design-studio/dist/tools/publish.js';
import { updateAssignmentDescription } from '@canvas-toolchain/canvas-design-studio/dist/tools/update-assignment-description.js';
import {
  createSnapshotDir, writeManifest, writeState, writePriorHtml, writeNewHtml,
} from '../../../src/tools/publish/snapshot_store.js';
import { publishCourse } from '../../../src/tools/workflows/publish_course.js';
import type { PreviewManifest } from '../../../src/tools/publish/manifest_types.js';

let cc: string;
beforeEach(() => {
  cc = mkdtempSync(join(tmpdir(), 'cc-'));
  process.env.CC_HOME = cc;
});
afterEach(() => {
  rmSync(cc, { recursive: true, force: true });
  delete process.env.CC_HOME;
  vi.clearAllMocks();
});

function seedSnapshot(snapshotId: string, entries: PreviewManifest['entries']): void {
  const dir = createSnapshotDir(snapshotId);
  const m: PreviewManifest = {
    snapshotId, courseId: 42, courseDir: join(cc, 'course'), generatedAt: '2026-05-30T00:00:00Z',
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

const PAGE_ENTRY = (filename: string, title: string): PreviewManifest['entries'][number] => ({
  type: 'page', filename, pageType: 'overview', intendedTitle: title, collisionAction: 'update',
  diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
  warnings: [], canvasMatch: { pageId: filename, url: 'https://x/' + filename, existingTitle: title, similarity: 1 },
});

describe('publishCourse', () => {
  it('publishes every approved page in order on the happy path', async () => {
    seedSnapshot('snap-1', [PAGE_ENTRY('a.html', 'A'), PAGE_ENTRY('b.html', 'B')]);
    vi.mocked(publishToCanvas).mockResolvedValue({ url: 'https://x', action: 'updated', pageTitle: 'A', tip: '' });

    // canvasBreadcrumbs:false suppresses the breadcrumb POST, which would otherwise
    // try to hit real Canvas (no fetch stub in this test file).
    const r = await publishCourse({ snapshotId: 'snap-1', approvals: { 'a.html': 'approve', 'b.html': 'approve' }, canvasBreadcrumbs: false });

    expect(r.published).toHaveLength(2);
    expect(r.failed).toBeUndefined();
    expect(r.phase).toBe('published');
  });

  it('stops on the first failure and records it in state.json', async () => {
    seedSnapshot('snap-2', [PAGE_ENTRY('a.html', 'A'), PAGE_ENTRY('b.html', 'B')]);
    vi.mocked(publishToCanvas)
      .mockResolvedValueOnce({ url: 'https://x', action: 'updated', pageTitle: 'A', tip: '' })
      .mockResolvedValueOnce({ error: 'rate limited', code: 'CANVAS_RATE_LIMITED' });

    const r = await publishCourse({ snapshotId: 'snap-2', approvals: { 'a.html': 'approve', 'b.html': 'approve' }, canvasBreadcrumbs: false });

    expect(r.published).toHaveLength(1);
    expect(r.failed?.filename).toBe('b.html');
    expect(r.phase).toBe('partial');
  });

  it('refuses APPROVALS_INCOMPLETE when approvals miss a manifest entry', async () => {
    seedSnapshot('snap-3', [PAGE_ENTRY('a.html', 'A'), PAGE_ENTRY('b.html', 'B')]);
    const r = await publishCourse({ snapshotId: 'snap-3', approvals: { 'a.html': 'approve' } });
    expect(r.error).toBe('APPROVALS_INCOMPLETE');
  });

  it('resumes from the failed entry when resume:true', async () => {
    seedSnapshot('snap-4', [PAGE_ENTRY('a.html', 'A'), PAGE_ENTRY('b.html', 'B')]);
    writeState(join(cc, 'publish-snapshots', 'snap-4'), {
      phase: 'partial',
      published: [{ filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' }],
      failed: { filename: 'b.html', type: 'page', reason: '429', code: 'CANVAS_RATE_LIMITED', failedAt: '2026-05-30T00:00:01Z' },
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });
    vi.mocked(publishToCanvas).mockResolvedValueOnce({ url: 'https://x/b', action: 'updated', pageTitle: 'B', tip: '' });

    const r = await publishCourse({ snapshotId: 'snap-4', approvals: { 'a.html': 'approve', 'b.html': 'approve' }, resume: true, canvasBreadcrumbs: false });

    expect(publishToCanvas).toHaveBeenCalledTimes(1);
    expect(r.published.find(p => p.filename === 'b.html')).toBeDefined();
    expect(r.phase).toBe('published');
  });

  it('refuses PARTIAL_SNAPSHOT_REQUIRES_RESUME when called without resume on a partial snapshot', async () => {
    seedSnapshot('snap-partial', [PAGE_ENTRY('a.html', 'A'), PAGE_ENTRY('b.html', 'B')]);
    writeState(join(cc, 'publish-snapshots', 'snap-partial'), {
      phase: 'partial',
      published: [{ filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' }],
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });
    const r = await publishCourse({ snapshotId: 'snap-partial', approvals: { 'a.html': 'approve', 'b.html': 'approve' } });
    expect(r.error).toBe('PARTIAL_SNAPSHOT_REQUIRES_RESUME');
    expect(publishToCanvas).not.toHaveBeenCalled();
  });

  it('refuses ALREADY_PUBLISHED on a fully-published snapshot', async () => {
    seedSnapshot('snap-pub', [PAGE_ENTRY('a.html', 'A')]);
    writeState(join(cc, 'publish-snapshots', 'snap-pub'), {
      phase: 'published',
      published: [{ filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' }],
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });
    const r = await publishCourse({ snapshotId: 'snap-pub', approvals: { 'a.html': 'approve' } });
    expect(r.error).toBe('ALREADY_PUBLISHED');
  });

  it('refuses ALREADY_ROLLED_BACK on a rolled-back snapshot', async () => {
    seedSnapshot('snap-rb', [PAGE_ENTRY('a.html', 'A')]);
    writeState(join(cc, 'publish-snapshots', 'snap-rb'), {
      phase: 'rolled-back', published: [], lastUpdatedAt: '2026-05-30T00:00:00Z',
    });
    const r = await publishCourse({ snapshotId: 'snap-rb', approvals: { 'a.html': 'approve' } });
    expect(r.error).toBe('ALREADY_ROLLED_BACK');
  });
});
