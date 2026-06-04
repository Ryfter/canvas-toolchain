import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';
import {
  createSnapshotDir, writeManifest, writePriorHtml, writeNewHtml, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { writeWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';
import type { PreviewManifest } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('rollbackCoursePublish widget content restore', () => {
  it('re-uploads prior widget content and rewrites page iframe src to the new file_id', async () => {
    // Legacy createSnapshotDir lands in CC_HOME so rollback's snapshotDir() lookup finds it.
    const snapshotId = 'snap-1';
    const dir = createSnapshotDir(snapshotId);

    // Local spec file (publishWidget needs it for re-upload).
    mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
      id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
      contentSchema: {}, initialContent: {},
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
    }));

    // Prior widget content captured at preview time.
    const priorWidgetHtml = '<p>prior widget content</p>';
    writeFileSync(join(dir, 'prior', 'widgets', 'assignment__sort.html'), priorWidgetHtml, 'utf-8');

    // widgets-meta has both prior and published file_ids.
    writeWidgetsMeta(dir, {
      widgets: {
        'assignment__sort': {
          priorCanvasFileId: 100,
          priorContentHash: 'h-prior',
          newContentHash: 'h-new',
          publishedCanvasFileId: 200,
        },
      },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 48895, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'A', collisionAction: 'update',
        canvasMatch: { pageId: 'assignment', url: '', existingTitle: 'A', similarity: 1 },
        diff: { priorWords: 1, newWords: 1, delta: 0, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
        widgets: [{ id: 'sort', slug: 'assignment', htmlPath: join(courseDir, 'assignment', 'widgets', 'sort.html'), specPath: join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), status: 'changed' }],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '<iframe src="/courses/48895/files/100/preview"></iframe>');
    writeNewHtml(dir, 'assignment.html', '<iframe src="/courses/48895/files/200/preview"></iframe>');
    writeState(dir, {
      phase: 'published',
      published: [{
        filename: 'assignment.html', type: 'page', canvasUrl: '', canvasPageSlug: 'assignment',
        action: 'updated', publishedAt: '2026-06-04T12:00:00.000Z',
        widgets: [{ id: 'sort', status: 'published', canvasFileId: 200 }],
      }],
      lastUpdatedAt: '2026-06-04T12:00:00.000Z',
    });

    // Capture EVERY page PUT body. The last one is the rewritten one (after widget restore).
    const allPutBodies: string[] = [];

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.match(/\/pages\/assignment$/) && method === 'PUT') {
        const parsed = JSON.parse(String((init?.body as any) ?? '{}'));
        allPutBodies.push(parsed?.wiki_page?.body ?? '');
        return new Response(JSON.stringify({ page_id: 1, url: 'assignment', title: 'A', html_url: '', body: parsed?.wiki_page?.body ?? '', published: true, updated_at: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.match(/\/pages\/assignment$/) && method === 'GET') {
        // getPageBody during widget restore returns the prior HTML (just restored above).
        return new Response(JSON.stringify({ page_id: 1, url: 'assignment', title: 'A', html_url: '', body: '<iframe src="/courses/48895/files/100/preview"></iframe>', published: true, updated_at: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    // Stub publishWidget — returns a new file_id distinct from both 100 and 200.
    const publishWidgetFn = vi.fn().mockResolvedValue({
      canvasFileId: 333,
      embedSrc: 'https://canvas.example/courses/48895/files/333/preview',
      embedHtml: '<iframe src="https://canvas.example/courses/48895/files/333/preview"></iframe>',
    });

    const result = await rollbackCoursePublish(
      { snapshotId },
      { publishWidget: publishWidgetFn as any },
    );

    expect(result.phase).toBe('rolled-back');

    // Widget restore was attempted with the prior content from snapshot.
    expect(publishWidgetFn).toHaveBeenCalledTimes(1);
    const call = publishWidgetFn.mock.calls[0]![0];
    expect(call.htmlPath).toBe(join(dir, 'prior', 'widgets', 'assignment__sort.html'));

    // Last page PUT body should have the iframe src rewritten from publish-time
    // file_id (100, from snapshot's prior HTML) to the just-restored file_id (333).
    expect(allPutBodies.length).toBeGreaterThanOrEqual(2);  // restore + rewrite
    const finalBody = allPutBodies[allPutBodies.length - 1]!;
    expect(finalBody).toContain('/files/333/preview');
    expect(finalBody).not.toContain('/files/100/preview');

    // widgetsCleaned should report status='restored' with the new file_id.
    const restored = result.widgetsCleaned.find(w => w.id === 'sort');
    expect(restored).toBeDefined();
    expect(restored!.status).toBe('restored');
    expect(restored!.canvasFileId).toBe(333);
  });

  it('falls back to delete-only behavior when no prior widget content exists', async () => {
    const snapshotId = 'snap-2';
    const dir = createSnapshotDir(snapshotId);

    // No prior widget content (status was 'new' at preview).
    writeWidgetsMeta(dir, {
      widgets: {
        'assignment__sort': {
          priorCanvasFileId: null,
          priorContentHash: null,
          newContentHash: 'h-new',
          publishedCanvasFileId: 200,
        },
      },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 48895, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'A', collisionAction: 'create',
        diff: { priorWords: null, newWords: 1, delta: 1, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
        widgets: [{ id: 'sort', slug: 'assignment', htmlPath: 'x', specPath: 'y', status: 'new' }],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '');
    writeNewHtml(dir, 'assignment.html', '');
    writeState(dir, {
      phase: 'published',
      published: [{
        filename: 'assignment.html', type: 'page', canvasUrl: '', canvasPageSlug: 'assignment',
        action: 'created', publishedAt: '2026-06-04T12:00:00.000Z',
        widgets: [{ id: 'sort', status: 'published', canvasFileId: 200 }],
      }],
      lastUpdatedAt: '2026-06-04T12:00:00.000Z',
    });

    let deletedFileId: number | undefined;
    const deleteFn = vi.fn().mockImplementation(async (_host: string, _tok: string, id: number) => {
      deletedFileId = id;
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));

    const publishWidgetFn = vi.fn();

    const result = await rollbackCoursePublish(
      { snapshotId },
      { publishWidget: publishWidgetFn as any, deleteCanvasFile: deleteFn },
    );

    expect(publishWidgetFn).not.toHaveBeenCalled();
    expect(deletedFileId).toBe(200);
    expect(result.widgetsCleaned.find(w => w.id === 'sort')!.status).toBe('deleted');
  });
});
