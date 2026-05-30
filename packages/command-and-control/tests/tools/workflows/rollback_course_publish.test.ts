import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('canvas-design-mcp/dist/tools/restore-page.js', () => ({ restorePage: vi.fn() }));
vi.mock('canvas-design-mcp/dist/tools/update-assignment-description.js', () => ({ updateAssignmentDescription: vi.fn() }));
vi.mock('canvas-design-mcp/dist/canvas-api.js', () => ({
  CanvasApiClient: vi.fn().mockImplementation(() => ({})),
  CanvasApiError: class extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
  },
}));
vi.mock('../../../src/tools/publish/canvas_config_bridge.js', () => ({
  loadInstitutionConfig: vi.fn().mockReturnValue({ canvasUrl: 'https://x', apiToken: 't' }),
}));

import { restorePage } from 'canvas-design-mcp/dist/tools/restore-page.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { createSnapshotDir, writeManifest, writeState, writePriorHtml } from '../../../src/tools/publish/snapshot_store.js';
import { rollbackCoursePublish } from '../../../src/tools/workflows/rollback_course_publish.js';

let cc: string;
beforeEach(() => { cc = mkdtempSync(join(tmpdir(), 'cc-')); process.env.CC_HOME = cc; });
afterEach(() => { rmSync(cc, { recursive: true, force: true }); delete process.env.CC_HOME; vi.clearAllMocks(); });

describe('rollbackCoursePublish', () => {
  it('reverse-iterates published[] and restores each entry', async () => {
    const dir = createSnapshotDir('snap');
    writeManifest(dir, {
      snapshotId: 'snap', courseId: 1, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
      git: { isRepo: false },
      entries: [
        // Need a matching manifest entry for the assignment so the lookup works.
        { type: 'assignment', filename: 'b.html', pageType: 'assignment', intendedTitle: 'B',
          canvasMatch: { assignmentId: 99, name: 'B', similarity: 1 },
          diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: true },
          warnings: [],
        },
      ],
      summary: { total: 1, pages: 0, assignments: 1, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    });
    writePriorHtml(dir, 'a.html', '<p>old-a</p>');
    writePriorHtml(dir, 'b.html', '<p>old-b</p>');
    writeState(dir, {
      phase: 'partial',
      published: [
        { filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' },
        { filename: 'b.html', type: 'assignment', action: 'updated', publishedAt: '2026-05-30T00:00:01Z' },
      ],
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });

    const r = await rollbackCoursePublish({ snapshotId: 'snap' });

    expect(r.restored.map(x => x.filename)).toEqual(['b.html', 'a.html']);
    expect(restorePage).toHaveBeenCalled();
    expect(updateAssignmentDescription).toHaveBeenCalled();
  });

  it('accumulates per-entry failures into restoreFailed[]', async () => {
    const dir = createSnapshotDir('snap');
    writeManifest(dir, {
      snapshotId: 'snap', courseId: 1, courseDir: '/x', generatedAt: '2026-05-30T00:00:00Z',
      git: { isRepo: false }, entries: [],
      summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    });
    writePriorHtml(dir, 'a.html', '<p>old-a</p>');
    writeState(dir, {
      phase: 'partial',
      published: [{ filename: 'a.html', type: 'page', canvasUrl: 'https://x/a', action: 'updated', publishedAt: '2026-05-30T00:00:00Z' }],
      lastUpdatedAt: '2026-05-30T00:00:01Z',
    });
    vi.mocked(restorePage).mockRejectedValue(new Error('429'));

    const r = await rollbackCoursePublish({ snapshotId: 'snap' });

    expect(r.restored).toHaveLength(0);
    expect(r.restoreFailed).toHaveLength(1);
    expect(r.restoreFailed[0].filename).toBe('a.html');
  });
});
