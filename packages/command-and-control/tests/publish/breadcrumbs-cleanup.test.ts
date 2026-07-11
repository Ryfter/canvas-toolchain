import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupCanvasBreadcrumbsForSnapshot } from '../../src/tools/publish/breadcrumbs.js';
import { createSnapshotDir } from '../../src/tools/publish/snapshot_store.js';
import { writePagesMeta } from '../../src/tools/publish/pages_meta.js';
import { writeWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';

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

function seedMetaWithBreadcrumbs(dir: string): void {
  writePagesMeta(dir, {
    pages: {
      'overview.html': {
        priorCanvasPageSlug: 'overview', priorContentHash: 'h', newContentHash: 'n',
        canvasBreadcrumb: { archivedPageSlug: 'archived-overview-20260604-abc', archivedPageId: '9000' },
      },
      'syllabus.html': {
        priorCanvasPageSlug: 'syllabus', priorContentHash: 'h2', newContentHash: 'n2',
        canvasBreadcrumb: { archivedPageSlug: 'archived-syllabus-20260604-def', archivedPageId: '9001' },
      },
    },
  });
  writeWidgetsMeta(dir, {
    widgets: {
      'assignment__sort': {
        priorCanvasFileId: 7000, priorContentHash: 'h', newContentHash: 'n',
        canvasBreadcrumb: { folderId: 202, filePath: '/canvas-toolchain-archive/2026-06-04/assignment__sort.html', breadcrumbFileId: 9999 },
      },
    },
  });
}

describe('cleanupCanvasBreadcrumbsForSnapshot (V&R C4.3)', () => {
  it('deletes archived pages and files recorded in meta sidecars', async () => {
    const snapshotId = 'snap-cleanup-1';
    const dir = createSnapshotDir(snapshotId);
    seedMetaWithBreadcrumbs(dir);

    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      calls.push({ url: u, method });
      // Folder listing returns empty so the date folder gets cleaned up too.
      if (/\/folders\/\d+\/files$/.test(u) && method === 'GET') {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // Everything else: 204 No Content
      return new Response(null, { status: 204 });
    }));

    const result = await cleanupCanvasBreadcrumbsForSnapshot({
      snapshotId, courseId: 20255, courseDir,
    });

    expect(result.canvasBreadcrumbsCleaned).toBe(true);
    expect(result.errors).toEqual([]);

    // Two page DELETEs
    const pageDeletes = calls.filter(c => /\/courses\/20255\/pages\/archived-/.test(c.url) && c.method === 'DELETE');
    expect(pageDeletes.length).toBe(2);
    expect(pageDeletes.some(c => c.url.includes('archived-overview-20260604-abc'))).toBe(true);
    expect(pageDeletes.some(c => c.url.includes('archived-syllabus-20260604-def'))).toBe(true);

    // One file DELETE
    const fileDeletes = calls.filter(c => /\/files\/9999$/.test(c.url) && c.method === 'DELETE');
    expect(fileDeletes.length).toBe(1);

    // Empty date folder also got DELETEd (force=true)
    const folderDeletes = calls.filter(c => /\/folders\/202\?force=true$/.test(c.url) && c.method === 'DELETE');
    expect(folderDeletes.length).toBe(1);
  });

  it('returns errors list when DELETE fails but keeps going', async () => {
    const snapshotId = 'snap-cleanup-2';
    const dir = createSnapshotDir(snapshotId);
    seedMetaWithBreadcrumbs(dir);

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      // First page DELETE fails 500; second page DELETE succeeds; file DELETE succeeds.
      if (/\/pages\/archived-overview-/.test(u) && method === 'DELETE') {
        return new Response('boom', { status: 500 });
      }
      if (/\/folders\/\d+\/files$/.test(u) && method === 'GET') {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(null, { status: 204 });
    }));

    const result = await cleanupCanvasBreadcrumbsForSnapshot({
      snapshotId, courseId: 20255, courseDir,
    });

    // 1 error recorded, but processing continued
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.resource).toBe('page:archived-overview-20260604-abc');
    expect(result.errors[0]!.reason).toBe('500');
    // canvasBreadcrumbsCleaned is false when errors are present
    expect(result.canvasBreadcrumbsCleaned).toBe(false);
  });

  it('returns MISSING_API_TOKEN error when canvas-config is absent', async () => {
    const snapshotId = 'snap-cleanup-3';
    createSnapshotDir(snapshotId);
    // Clobber the canvas-config so loadInstitutionConfig throws.
    rmSync(join(ccHome, 'canvas-config.json'));

    const result = await cleanupCanvasBreadcrumbsForSnapshot({
      snapshotId, courseId: 20255, courseDir,
    });

    expect(result.canvasBreadcrumbsCleaned).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.resource).toBe('canvas-config');
    expect(result.errors[0]!.reason).toBe('MISSING_API_TOKEN');
  });
});
