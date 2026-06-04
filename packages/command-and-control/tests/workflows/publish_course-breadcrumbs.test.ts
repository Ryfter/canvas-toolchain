import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import {
  createSnapshotDir, writeManifest, writePriorHtml, writeNewHtml, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { readPagesMeta } from '../../src/tools/publish/pages_meta.js';
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

function seedPageManifest(dir: string, snapshotId: string, opts: { withCanvasMatch: boolean }): void {
  const entry: PreviewManifest['entries'][number] = opts.withCanvasMatch
    ? {
      type: 'page', filename: 'overview.html', pageType: 'overview',
      intendedTitle: 'Course Overview', collisionAction: 'update',
      canvasMatch: { pageId: 'course-overview', url: '', existingTitle: 'Course Overview', similarity: 1 },
      diff: { priorWords: 10, newWords: 20, delta: 10, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
      warnings: [],
    }
    : {
      type: 'page', filename: 'overview.html', pageType: 'overview',
      intendedTitle: 'Course Overview', collisionAction: 'create',
      diff: { priorWords: null, newWords: 20, delta: 20, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
      warnings: [],
    };
  const manifest: PreviewManifest = {
    snapshotId, courseId: 48895, courseDir,
    generatedAt: '2026-06-04T12:00:00.000Z',
    git: { isRepo: false },
    entries: [entry],
    summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writePriorHtml(dir, 'overview.html', '<p>OLD BODY</p>');
  writeNewHtml(dir, 'overview.html', '<p>new</p>');
  writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' });
}

/** Recognize a Canvas POST to /api/v1/courses/<id>/pages with an [ARCHIVED] title in the body. */
function isArchivedPagePost(url: string, init?: RequestInit): boolean {
  if (init?.method !== 'POST') return false;
  if (!/\/api\/v1\/courses\/\d+\/pages(\?|$)/.test(url)) return false;
  const body = typeof init.body === 'string' ? init.body : '';
  return body.includes('[ARCHIVED]');
}

describe('publishCourse — page breadcrumbs (V&R C4.1)', () => {
  it('creates [ARCHIVED] copy and records in pages-meta when page exists and breadcrumbs enabled', async () => {
    const snapshotId = 'snap-bc-1';
    const dir = createSnapshotDir(snapshotId);
    seedPageManifest(dir, snapshotId, { withCanvasMatch: true });

    let archivePostCount = 0;
    let capturedArchiveBody = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (isArchivedPagePost(u, init)) {
        archivePostCount++;
        capturedArchiveBody = typeof init?.body === 'string' ? init.body : '';
        return new Response(JSON.stringify({
          url: 'archived-course-overview-20260604-abc',
          page_id: 9000,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/pages') && method === 'GET') {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'course-overview', title: 'Course Overview',
          html_url: 'https://canvas.example/courses/48895/pages/course-overview',
          body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // Normal publish PUT/POST
      return new Response(JSON.stringify({
        page_id: 1, url: 'course-overview', title: 'Course Overview',
        html_url: 'https://canvas.example/courses/48895/pages/course-overview',
        body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const result = await publishCourse({
      snapshotId, approvals: { 'overview.html': 'approve' }, gitCommit: false,
    });

    expect(result.phase).toBe('published');
    expect(archivePostCount).toBe(1);
    expect(capturedArchiveBody).toContain('[ARCHIVED]');
    expect(capturedArchiveBody).toContain('Course Overview');
    // Prior body got into the archived page body
    expect(capturedArchiveBody).toContain('OLD BODY');
    // published:false ensures the archived copy is hidden from students by default
    expect(capturedArchiveBody).toMatch(/"published":\s*false/);

    const meta = readPagesMeta(dir);
    expect(meta.pages['overview.html']?.canvasBreadcrumb).toEqual({
      archivedPageSlug: 'archived-course-overview-20260604-abc',
      archivedPageId: '9000',
    });
  });

  it('skips breadcrumb when canvasBreadcrumbs: false in input', async () => {
    const snapshotId = 'snap-bc-2';
    const dir = createSnapshotDir(snapshotId);
    seedPageManifest(dir, snapshotId, { withCanvasMatch: true });

    let archivePostCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (isArchivedPagePost(u, init)) {
        archivePostCount++;
        return new Response(JSON.stringify({ url: 'x', page_id: 1 }), { status: 200 });
      }
      if (u.includes('/pages') && method === 'GET') {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'course-overview', title: 'Course Overview',
          html_url: 'https://canvas.example/courses/48895/pages/course-overview',
          body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'course-overview', title: 'Course Overview',
        html_url: '', body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const result = await publishCourse({
      snapshotId, approvals: { 'overview.html': 'approve' }, gitCommit: false,
      canvasBreadcrumbs: false,
    });

    expect(result.phase).toBe('published');
    expect(archivePostCount).toBe(0);
    const meta = readPagesMeta(dir);
    expect(meta.pages['overview.html']?.canvasBreadcrumb).toBeUndefined();
  });

  it('skips breadcrumb when page is new (no canvasMatch)', async () => {
    const snapshotId = 'snap-bc-3';
    const dir = createSnapshotDir(snapshotId);
    seedPageManifest(dir, snapshotId, { withCanvasMatch: false });

    let archivePostCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (isArchivedPagePost(u, init)) {
        archivePostCount++;
        return new Response(JSON.stringify({ url: 'x', page_id: 1 }), { status: 200 });
      }
      if (u.includes('/pages') && method === 'GET') {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'course-overview', title: 'Course Overview',
          html_url: 'https://canvas.example/courses/48895/pages/course-overview',
          body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'course-overview', title: 'Course Overview',
        html_url: '', body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const result = await publishCourse({
      snapshotId, approvals: { 'overview.html': 'approve' }, gitCommit: false,
    });

    expect(result.phase).toBe('published');
    expect(archivePostCount).toBe(0);
  });

  it('continues publish when breadcrumb POST fails (non-fatal)', async () => {
    const snapshotId = 'snap-bc-4';
    const dir = createSnapshotDir(snapshotId);
    seedPageManifest(dir, snapshotId, { withCanvasMatch: true });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (isArchivedPagePost(u, init)) {
        return new Response('boom', { status: 500 });
      }
      if (u.includes('/pages') && method === 'GET') {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'course-overview', title: 'Course Overview',
          html_url: 'https://canvas.example/courses/48895/pages/course-overview',
          body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'course-overview', title: 'Course Overview',
        html_url: '', body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const result = await publishCourse({
      snapshotId, approvals: { 'overview.html': 'approve' }, gitCommit: false,
    });

    expect(result.phase).toBe('published');
    const meta = readPagesMeta(dir);
    expect(meta.pages['overview.html']?.canvasBreadcrumb).toBeUndefined();
  });
});
