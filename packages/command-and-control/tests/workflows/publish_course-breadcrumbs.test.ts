import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import {
  createSnapshotDir, writeManifest, writePriorHtml, writeNewHtml, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { readPagesMeta } from '../../src/tools/publish/pages_meta.js';
import { readWidgetsMeta, writeWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';
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
    snapshotId, courseId: 20255, courseDir,
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
          html_url: 'https://canvas.example/courses/20255/pages/course-overview',
          body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // Normal publish PUT/POST
      return new Response(JSON.stringify({
        page_id: 1, url: 'course-overview', title: 'Course Overview',
        html_url: 'https://canvas.example/courses/20255/pages/course-overview',
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
          html_url: 'https://canvas.example/courses/20255/pages/course-overview',
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
          html_url: 'https://canvas.example/courses/20255/pages/course-overview',
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
          html_url: 'https://canvas.example/courses/20255/pages/course-overview',
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

// =============================================================================
// Widget breadcrumb tests (V&R C4.2)
// =============================================================================

function seedWidgetPageManifest(dir: string, snapshotId: string): void {
  // Page with one widget iframe; collisionAction 'create' so no page breadcrumb fires.
  const manifest: PreviewManifest = {
    snapshotId, courseId: 20255, courseDir,
    generatedAt: '2026-06-04T12:00:00.000Z',
    git: { isRepo: false },
    entries: [{
      type: 'page', filename: 'assignment.html', pageType: 'assignment',
      intendedTitle: 'Assignment 1', collisionAction: 'create',
      diff: { priorWords: null, newWords: 20, delta: 20, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
      warnings: [],
    }],
    summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writePriorHtml(dir, 'assignment.html', '<p>old</p>');
  writeNewHtml(dir, 'assignment.html', '<iframe src="assignment/widgets/sort.html" title="Sort Widget"></iframe>');
  writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' });

  // Course-dir widget files (HTML + spec)
  mkdirSync(join(courseDir, 'assignment', 'widgets'), { recursive: true });
  writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.html'), '<p>new widget</p>');
  writeFileSync(join(courseDir, 'assignment', 'widgets', 'sort.spec.json'), JSON.stringify({
    id: 'sort', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
    contentSchema: {}, initialContent: {},
    dimensions: { minHeight: 200, maxHeight: 400 },
    accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
  }));

  // Seed widgets-meta (Plan B preview-time record).
  writeWidgetsMeta(dir, {
    widgets: {
      'assignment__sort': {
        priorCanvasFileId: 7000, priorContentHash: 'h-prior', newContentHash: 'h-new',
      },
    },
  });
}

function buildWidgetCanvasMock() {
  const calls: { url: string; method: string; body?: string }[] = [];
  let createdFolderCount = 0;

  const fn = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    calls.push({ url: u, method, body: typeof init?.body === 'string' ? init.body : undefined });

    // List pages (used by publishToCanvas for collision lookup)
    if (/\/api\/v1\/courses\/\d+\/pages(\?|$)/.test(u) && method === 'GET') {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // Folder root
    if (/\/folders\/root$/.test(u) && method === 'GET') {
      return new Response(JSON.stringify({ id: 100 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // List child folders — always empty so the breadcrumb code creates new folders
    if (/\/folders\/\d+\/folders$/.test(u) && method === 'GET') {
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // POST /folders — create folder
    if (/\/api\/v1\/courses\/\d+\/folders$/.test(u) && method === 'POST') {
      createdFolderCount++;
      return new Response(JSON.stringify({ id: 200 + createdFolderCount }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    // File init (POST /courses/<id>/files) — returns upload URL
    if (/\/api\/v1\/courses\/\d+\/files$/.test(u) && method === 'POST') {
      return new Response(JSON.stringify({
        upload_url: 'https://upload.example/x',
        upload_params: { k: 'v' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    // Upload step
    if (u.startsWith('https://upload.example/x')) {
      return new Response(JSON.stringify({ id: 9999 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    // Normal page publish
    return new Response(JSON.stringify({
      page_id: 1, url: 'assignment', title: 'Assignment 1',
      html_url: 'https://canvas.example/courses/20255/pages/assignment',
      body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  return { fn, calls };
}

describe('publishCourse — widget breadcrumbs (V&R C4.2)', () => {
  it('uploads widget prior content to /canvas-toolchain-archive folder', async () => {
    const snapshotId = 'snap-wbc-1';
    const dir = createSnapshotDir(snapshotId);
    seedWidgetPageManifest(dir, snapshotId);

    // Plan B preview captured the prior widget bytes here:
    writeFileSync(join(dir, 'prior', 'widgets', 'assignment__sort.html'), '<p>PRIOR WIDGET BYTES</p>', 'utf-8');

    const mock = buildWidgetCanvasMock();
    vi.stubGlobal('fetch', mock.fn);

    const publishWidgetFn = vi.fn().mockResolvedValue({
      canvasFileId: 1234,
      embedSrc: 'https://canvas.example/courses/20255/files/1234/preview',
      embedHtml: '<iframe src="https://canvas.example/courses/20255/files/1234/preview"></iframe>',
    });

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetFn as any },
    );

    expect(result.phase).toBe('published');

    // Folder discovery touched /folders/root.
    expect(mock.calls.some(c => /\/folders\/root$/.test(c.url))).toBe(true);
    // At least one POST to /files (the breadcrumb file-init step).
    const filesInit = mock.calls.filter(c => /\/api\/v1\/courses\/\d+\/files$/.test(c.url) && c.method === 'POST');
    expect(filesInit.length).toBeGreaterThanOrEqual(1);

    // The widget meta got a canvasBreadcrumb entry pointing at file id 9999.
    const meta = readWidgetsMeta(dir);
    const bc = meta.widgets['assignment__sort']?.canvasBreadcrumb;
    expect(bc).toBeDefined();
    expect(bc?.breadcrumbFileId).toBe(9999);
    expect(bc?.filePath).toBe('/canvas-toolchain-archive/2026-06-04/assignment__sort.html');
    expect(typeof bc?.folderId).toBe('number');
  });

  it('silently skips widget breadcrumb when prior/widgets/<key>.html does not exist', async () => {
    const snapshotId = 'snap-wbc-2';
    const dir = createSnapshotDir(snapshotId);
    seedWidgetPageManifest(dir, snapshotId);
    // No prior/widgets/assignment__sort.html written -> no breadcrumb attempt.

    const mock = buildWidgetCanvasMock();
    vi.stubGlobal('fetch', mock.fn);

    const publishWidgetFn = vi.fn().mockResolvedValue({
      canvasFileId: 1234,
      embedSrc: 'https://canvas.example/courses/20255/files/1234/preview',
      embedHtml: '<iframe></iframe>',
    });

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetFn as any },
    );

    expect(result.phase).toBe('published');
    // No breadcrumb-side folder lookup attempted (no /folders/root call).
    expect(mock.calls.some(c => /\/folders\/root$/.test(c.url))).toBe(false);
    const meta = readWidgetsMeta(dir);
    expect(meta.widgets['assignment__sort']?.canvasBreadcrumb).toBeUndefined();
  });

  it('respects canvasBreadcrumbs: "disabled" in setup config when input override is absent (V&R C6.1)', async () => {
    // Rewrite canvas-config.json with disabled breadcrumbs; omit the input field
    // so the setup-config default is what gates behavior.
    writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
      host: 'canvas.example', token: 'tk',
      configuredAt: '2026-06-04T00:00:00.000Z',
      canvasBreadcrumbs: 'disabled',
    }), 'utf-8');

    const snapshotId = 'snap-bc-config-disabled';
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
          html_url: 'https://canvas.example/courses/20255/pages/course-overview',
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
    const meta = readPagesMeta(dir);
    expect(meta.pages['overview.html']?.canvasBreadcrumb).toBeUndefined();
  });
});
