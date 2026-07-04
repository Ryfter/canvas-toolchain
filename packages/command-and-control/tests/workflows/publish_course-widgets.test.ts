import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import { snapshotDir, createSnapshotDir, writeManifest, writeNewHtml, writeState } from '../../src/tools/publish/snapshot_store.js';
import type { PreviewManifest, PublishState } from '../../src/tools/publish/manifest_types.js';

// Set the C&C home env var so snapshot_store writes to a temp location.
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

// Minimal viable spec — the loadWidgetSpec helper only checks top-level fields.
const validSpec = {
  id: 'foo',
  name: 'Foo Widget',
  kind: 'card-flip-reveal',
  purpose: 'test',
  contentSchema: {},
  initialContent: { cards: [{ front: 'Q', back: 'A' }] },
  dimensions: { minHeight: 200, maxHeight: 400 },
  accessibility: { keyboardEquivalent: 'Tab', screenReaderSummary: 'flip', minTouchTarget: 44 },
};

/** Set up the on-disk state publish_course expects: a course dir with widget files,
 *  a snapshot dir with the rendered page HTML referencing the widget. Returns the
 *  snapshot id so tests can pass it to publishCourse. */
function setupCourseWithWidget(opts: {
  pageHtml: string;
  widgets: Array<{ slug: string; id: string; spec?: object; missingHtml?: boolean; missingSpec?: boolean }>;
}): { snapshotId: string; courseDir: string } {
  const courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  for (const w of opts.widgets) {
    const widgetsDir = join(courseDir, w.slug, 'widgets');
    mkdirSync(widgetsDir, { recursive: true });
    if (!w.missingHtml) {
      writeFileSync(join(widgetsDir, `${w.id}.html`), `<!DOCTYPE html>${w.id}`, 'utf-8');
    }
    if (!w.missingSpec) {
      writeFileSync(join(widgetsDir, `${w.id}.spec.json`), JSON.stringify(w.spec ?? { ...validSpec, id: w.id, name: w.id }), 'utf-8');
    }
  }

  const snapshotId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = createSnapshotDir(snapshotId);

  const manifest: PreviewManifest = {
    snapshotId, courseId: 48895, courseDir,
    generatedAt: '2026-06-03T12:00:00.000Z',
    git: { isRepo: false },
    entries: [
      {
        type: 'page', filename: 'assignment.html', pageType: 'assignment',
        intendedTitle: 'Assignment 1', collisionAction: 'create',
        diff: { priorWords: null, newWords: 50, delta: 50, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      },
    ],
    summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writeNewHtml(dir, 'assignment.html', opts.pageHtml);

  const state: PublishState = { phase: 'preview', published: [], lastUpdatedAt: '2026-06-03T12:00:00.000Z' };
  writeState(dir, state);

  return { snapshotId, courseDir };
}

/** Fake the Canvas API endpoints publishToCanvas hits:
 *  - GET /api/v1/courses/X/pages → empty array (no collisions), no Link header
 *  - POST /api/v1/courses/X/pages → returns a created CanvasPage object
 *  - PUT  /api/v1/courses/X/pages/<slug> → returns updated page
 *  Anything else returns 200 {} so unexpected calls don't blow up the test. */
function mockCanvasApi() {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.includes('/api/v1/courses/') && /\/pages(\?|$)/.test(u) && method === 'GET') {
      // listPages — empty array, no pagination
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/api/v1/courses/') && /\/pages(\?|$)/.test(u) && method === 'POST') {
      // createPage
      return new Response(JSON.stringify({
        page_id: 1, url: 'assignment-1', title: 'Assignment 1',
        html_url: 'https://canvas.example/courses/48895/pages/assignment-1',
        body: '', published: true, updated_at: '2026-06-03T12:00:00Z',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/api/v1/courses/') && /\/pages\//.test(u) && method === 'PUT') {
      return new Response(JSON.stringify({
        page_id: 1, url: 'assignment-1', title: 'Assignment 1',
        html_url: 'https://canvas.example/courses/48895/pages/assignment-1',
        body: '', published: true, updated_at: '2026-06-03T12:00:00Z',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

function stubCanvasConfig() {
  // canvas_config_bridge reads ~/.command-and-control/canvas-config.json;
  // setup a fake one in our test home dir.
  const cfgPath = join(ccHome, 'canvas-config.json');
  writeFileSync(cfgPath, JSON.stringify({
    host: 'canvas.example',
    token: 'tk-test',
    configuredAt: '2026-06-03T12:00:00.000Z',
  }), 'utf-8');
}

describe('publishCourse widget integration', () => {
  it('substitutes the iframe src to the Canvas Files URL on successful widget upload', async () => {
    stubCanvasConfig();
    const pageHtml = '<p>Practice:</p>\n<iframe src="assignment/widgets/foo.html" width="100%" height="400" title="Foo Widget" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy">fb</iframe>\n<p>Submit.</p>';
    const { snapshotId } = setupCourseWithWidget({
      pageHtml,
      widgets: [{ slug: 'assignment', id: 'foo', spec: validSpec }],
    });

    // Mock the publishWidget hook — return a successful upload
    const mockPublishWidget = vi.fn().mockResolvedValue({
      canvasFileId: 777,
      embedSrc: 'https://canvas.example/courses/48895/files/777/preview',
      embedHtml: '<iframe ...>',
    });

    vi.stubGlobal('fetch', mockCanvasApi());

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: mockPublishWidget as any },
    );

    expect(result.phase).toBe('published');
    expect(result.published).toHaveLength(1);
    expect(result.published[0]!.widgets).toBeDefined();
    expect(result.published[0]!.widgets!).toHaveLength(1);
    expect(result.published[0]!.widgets![0]!.status).toBe('published');
    expect(result.published[0]!.widgets![0]!.canvasFileId).toBe(777);

    // The Canvas Pages call should have received the rewritten HTML
    expect(mockPublishWidget).toHaveBeenCalledOnce();
    expect(mockPublishWidget).toHaveBeenCalledWith(expect.objectContaining({
      courseId: 48895,
      canvasConfig: { host: 'canvas.example', token: 'tk-test' },
    }));

    // Find the Canvas Pages mutation (POST/PUT) and verify body has the Canvas Files URL
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const mutatingPagesCalls = fetchMock.mock.calls.filter((c: unknown[]) => {
      const url = String(c[0]);
      const init = c[1] as RequestInit | undefined;
      const method = init?.method ?? 'GET';
      return url.includes('/pages') && (method === 'POST' || method === 'PUT');
    });
    expect(mutatingPagesCalls.length).toBeGreaterThan(0);
    const pagesBody = JSON.parse((mutatingPagesCalls[0]![1] as { body: string }).body);
    const submittedHtml = pagesBody.wiki_page?.body ?? pagesBody.body ?? '';
    expect(submittedHtml).toContain('src="https://canvas.example/courses/48895/files/777/preview"');
    expect(submittedHtml).not.toContain('src="assignment/widgets/foo.html"');
  });

  it('per-widget fail-soft: a widget upload failure does not abort the page', async () => {
    stubCanvasConfig();
    const pageHtml = '<iframe src="assignment/widgets/good.html" title="Good Widget">a</iframe><iframe src="assignment/widgets/bad.html" title="Bad Widget">b</iframe>';
    const { snapshotId } = setupCourseWithWidget({
      pageHtml,
      widgets: [
        { slug: 'assignment', id: 'good', spec: { ...validSpec, id: 'good' } },
        { slug: 'assignment', id: 'bad', spec: { ...validSpec, id: 'bad' } },
      ],
    });

    // First call (good) succeeds; second call (bad) throws
    const mockPublishWidget = vi.fn()
      .mockResolvedValueOnce({
        canvasFileId: 100,
        embedSrc: 'https://canvas.example/courses/48895/files/100/preview',
        embedHtml: '<iframe ...>',
      })
      .mockRejectedValueOnce(new Error('CANVAS_UPLOAD_INIT_ERROR: {"status":403}'));

    vi.stubGlobal('fetch', mockCanvasApi());

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: mockPublishWidget as any },
    );

    expect(result.phase).toBe('published'); // page still published despite widget failure
    expect(result.published[0]!.widgets).toHaveLength(2);
    expect(result.published[0]!.widgets!.find(w => w.id === 'good')!.status).toBe('published');
    expect(result.published[0]!.widgets!.find(w => w.id === 'good')!.canvasFileId).toBe(100);
    expect(result.published[0]!.widgets!.find(w => w.id === 'bad')!.status).toBe('failed');
    expect(result.published[0]!.widgets!.find(w => w.id === 'bad')!.error).toMatch(/CANVAS_UPLOAD_INIT_ERROR/);
  });

  it('records widget HTML-not-found as a failure with helpful path', async () => {
    stubCanvasConfig();
    const pageHtml = '<iframe src="assignment/widgets/missing.html" title="Missing Widget">m</iframe>';
    const { snapshotId } = setupCourseWithWidget({
      pageHtml,
      widgets: [{ slug: 'assignment', id: 'missing', missingHtml: true }],
    });

    const mockPublishWidget = vi.fn();
    vi.stubGlobal('fetch', mockCanvasApi());

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: mockPublishWidget as any },
    );

    expect(result.phase).toBe('published');
    expect(mockPublishWidget).not.toHaveBeenCalled();
    expect(result.published[0]!.widgets![0]!.status).toBe('failed');
    expect(result.published[0]!.widgets![0]!.error).toMatch(/widget HTML not found/);
  });

  it('pages without widgets omit the widgets field entirely', async () => {
    stubCanvasConfig();
    const { snapshotId } = setupCourseWithWidget({
      pageHtml: '<p>Plain page, no widgets.</p>',
      widgets: [],
    });

    const mockPublishWidget = vi.fn();
    vi.stubGlobal('fetch', mockCanvasApi());

    const result = await publishCourse(
      { snapshotId, approvals: { 'assignment.html': 'approve' }, gitCommit: false },
      { publishWidget: mockPublishWidget as any },
    );

    expect(result.phase).toBe('published');
    expect(mockPublishWidget).not.toHaveBeenCalled();
    expect(result.published[0]!.widgets).toBeUndefined();
  });
});
