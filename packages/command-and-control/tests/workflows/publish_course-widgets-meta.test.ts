import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import {
  createSnapshotDir, writeManifest, writePriorHtml, writeNewHtml, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { writeWidgetsMeta, readWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';
import type { PreviewManifest, PublishState } from '../../src/tools/publish/manifest_types.js';

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

describe('publishCourse widgets-meta recording', () => {
  it('writes publishedCanvasFileId after each publishWidget call', async () => {
    // Use createSnapshotDir (legacy global) since publish_course's snapshotDir() lookup uses
    // the legacy global path — same pattern as the existing publish_course tests.
    const snapshotId = 'snap-1';
    const dir = createSnapshotDir(snapshotId);

    mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.html'), '<p>w</p>');
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
      id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
      contentSchema: {}, initialContent: {},
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
    }));

    writeWidgetsMeta(dir, {
      widgets: {
        'assignment__sort': {
          priorCanvasFileId: null, priorContentHash: null, newContentHash: 'h',
        },
      },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 48895, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'Assignment', collisionAction: 'create',
        diff: { priorWords: null, newWords: 20, delta: 20, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '<p>old</p>');
    writeNewHtml(dir, 'assignment.html', '<iframe src="assignment/widgets/sort.html" title="Sort Widget"></iframe>');
    writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.includes('/api/v1/courses/') && /\/pages(\?|$)/.test(u) && method === 'GET') {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'assignment', title: 'A', html_url: '', body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const publishWidgetFn = vi.fn().mockResolvedValue({
      canvasFileId: 9999,
      embedSrc: 'https://canvas.example/courses/48895/files/9999/preview',
      embedHtml: '<iframe src="https://canvas.example/courses/48895/files/9999/preview"></iframe>',
    });

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetFn as any },
    );

    expect(result.phase).toBe('published');
    const meta = readWidgetsMeta(dir);
    expect(meta.widgets['assignment__sort']!.publishedCanvasFileId).toBe(9999);
  });

  it('does not record publishedCanvasFileId when publishWidget fails', async () => {
    const snapshotId = 'snap-2';
    const dir = createSnapshotDir(snapshotId);

    mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.html'), '<p>w</p>');
    writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
      id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
      contentSchema: {}, initialContent: {},
      dimensions: { minHeight: 200, maxHeight: 400 },
      accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
    }));

    writeWidgetsMeta(dir, {
      widgets: { 'assignment__sort': { priorCanvasFileId: null, priorContentHash: null, newContentHash: 'h' } },
    });

    const manifest: PreviewManifest = {
      snapshotId, courseId: 48895, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'A', collisionAction: 'update',
        canvasMatch: { pageId: 'assignment', url: '', existingTitle: 'A', similarity: 1 },
        diff: { priorWords: 0, newWords: 1, delta: 1, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'assignment.html', '');
    writeNewHtml(dir, 'assignment.html', '<iframe src="assignment/widgets/sort.html"></iframe>');
    writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.includes('/api/v1/courses/') && /\/pages(\?|$)/.test(u) && method === 'GET') {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'assignment', title: 'A', html_url: '', body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const publishWidgetFn = vi.fn().mockRejectedValue(new Error('Canvas Files boom'));

    await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetFn as any },
    );

    const meta = readWidgetsMeta(dir);
    expect(meta.widgets['assignment__sort']!.publishedCanvasFileId).toBeUndefined();
  });
});
