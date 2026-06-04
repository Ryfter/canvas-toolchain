import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';
import { createSnapshotDir, writeManifest, writePriorHtml, writeState } from '../../src/tools/publish/snapshot_store.js';
import type { PreviewManifest, PublishState, PublishedEntry } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubCanvasConfig(): void {
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example',
    token: 'tk-test',
    configuredAt: '2026-06-03T12:00:00.000Z',
  }), 'utf-8');
}

/** Build a snapshot with a published page entry whose `widgets` array reflects
 *  whatever the test wants to roll back. */
function setupSnapshot(published: PublishedEntry[]): string {
  const snapshotId = `roll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = createSnapshotDir(snapshotId);
  const manifest: PreviewManifest = {
    snapshotId, courseId: 48895, courseDir: '/course',
    generatedAt: '2026-06-03T12:00:00.000Z',
    git: { isRepo: false },
    entries: [
      {
        type: 'page', filename: 'overview.html', pageType: 'overview',
        intendedTitle: 'Overview', collisionAction: 'update',
        canvasMatch: { pageId: 'overview', url: 'https://canvas/courses/48895/pages/overview', existingTitle: 'Overview', similarity: 1 },
        diff: { priorWords: 10, newWords: 20, delta: 10, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      },
    ],
    summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writePriorHtml(dir, 'overview.html', '<p>prior content</p>');
  const state: PublishState = { phase: 'published', published, lastUpdatedAt: '2026-06-03T12:01:00.000Z' };
  writeState(dir, state);
  return snapshotId;
}

describe('rollbackCoursePublish widget cleanup', () => {
  it('deletes every successfully-published widget from Canvas Files', async () => {
    stubCanvasConfig();
    // Mock the Canvas page rollback (PUT to /pages/<slug>) to succeed
    // Use mockImplementation so each fetch call returns a fresh Response (Response
    // bodies are single-read; drift detection in rollback_course_publish.ts adds an
    // extra GET before restorePage's PUT, so a shared Response would deadlock).
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('{}', { status: 200 })));

    const snapshotId = setupSnapshot([{
      filename: 'overview.html', type: 'page', canvasUrl: 'x',
      canvasPageSlug: 'overview', action: 'updated', publishedAt: '2026-06-03T12:01:00.000Z',
      widgets: [
        { id: 'foo', status: 'published', canvasFileId: 100 },
        { id: 'bar', status: 'published', canvasFileId: 200 },
      ],
    }]);

    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const result = await rollbackCoursePublish({ snapshotId }, { deleteCanvasFile: mockDelete });

    expect(result.phase).toBe('rolled-back');
    expect(mockDelete).toHaveBeenCalledTimes(2);
    expect(mockDelete).toHaveBeenCalledWith('canvas.example', 'tk-test', 100);
    expect(mockDelete).toHaveBeenCalledWith('canvas.example', 'tk-test', 200);
    expect(result.widgetsCleaned).toHaveLength(2);
    expect(result.widgetsCleaned.every(w => w.status === 'deleted')).toBe(true);
  });

  it('skips widgets that failed to publish (no file_id to delete)', async () => {
    stubCanvasConfig();
    // Use mockImplementation so each fetch call returns a fresh Response (Response
    // bodies are single-read; drift detection in rollback_course_publish.ts adds an
    // extra GET before restorePage's PUT, so a shared Response would deadlock).
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('{}', { status: 200 })));

    const snapshotId = setupSnapshot([{
      filename: 'overview.html', type: 'page', canvasUrl: 'x',
      canvasPageSlug: 'overview', action: 'updated', publishedAt: '2026-06-03T12:01:00.000Z',
      widgets: [
        { id: 'goodwidget', status: 'published', canvasFileId: 100 },
        { id: 'badwidget', status: 'failed', error: 'CANVAS_UPLOAD_INIT_ERROR' },
      ],
    }]);

    const mockDelete = vi.fn().mockResolvedValue(undefined);
    const result = await rollbackCoursePublish({ snapshotId }, { deleteCanvasFile: mockDelete });

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('canvas.example', 'tk-test', 100);
    expect(result.widgetsCleaned.find(w => w.id === 'goodwidget')!.status).toBe('deleted');
    expect(result.widgetsCleaned.find(w => w.id === 'badwidget')!.status).toBe('skipped');
  });

  it('records widget delete failures without aborting the rollback', async () => {
    stubCanvasConfig();
    // Use mockImplementation so each fetch call returns a fresh Response (Response
    // bodies are single-read; drift detection in rollback_course_publish.ts adds an
    // extra GET before restorePage's PUT, so a shared Response would deadlock).
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('{}', { status: 200 })));

    const snapshotId = setupSnapshot([{
      filename: 'overview.html', type: 'page', canvasUrl: 'x',
      canvasPageSlug: 'overview', action: 'updated', publishedAt: '2026-06-03T12:01:00.000Z',
      widgets: [
        { id: 'survives', status: 'published', canvasFileId: 100 },
        { id: 'breaks', status: 'published', canvasFileId: 200 },
      ],
    }]);

    const mockDelete = vi.fn()
      .mockResolvedValueOnce(undefined)            // first delete succeeds
      .mockRejectedValueOnce(new Error('500 Internal'));  // second delete fails

    const result = await rollbackCoursePublish({ snapshotId }, { deleteCanvasFile: mockDelete });

    expect(result.phase).toBe('rolled-back');
    expect(result.widgetsCleaned.find(w => w.id === 'survives')!.status).toBe('deleted');
    expect(result.widgetsCleaned.find(w => w.id === 'breaks')!.status).toBe('failed');
    expect(result.widgetsCleaned.find(w => w.id === 'breaks')!.error).toMatch(/500/);
    expect(result.restored).toHaveLength(1); // page was still restored
  });

  it('omits widgetsCleaned entries for pages with no widgets', async () => {
    stubCanvasConfig();
    // Use mockImplementation so each fetch call returns a fresh Response (Response
    // bodies are single-read; drift detection in rollback_course_publish.ts adds an
    // extra GET before restorePage's PUT, so a shared Response would deadlock).
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('{}', { status: 200 })));

    const snapshotId = setupSnapshot([{
      filename: 'overview.html', type: 'page', canvasUrl: 'x',
      canvasPageSlug: 'overview', action: 'updated', publishedAt: '2026-06-03T12:01:00.000Z',
      // no widgets field
    }]);

    const mockDelete = vi.fn();
    const result = await rollbackCoursePublish({ snapshotId }, { deleteCanvasFile: mockDelete });

    expect(mockDelete).not.toHaveBeenCalled();
    expect(result.widgetsCleaned).toEqual([]);
  });
});
