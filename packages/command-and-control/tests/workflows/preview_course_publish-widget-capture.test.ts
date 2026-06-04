import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCoursePublish } from '../../src/tools/workflows/preview_course_publish.js';
import { snapshotsRootFor } from '../../src/tools/publish/snapshot_store.js';
import { readWidgetsMeta } from '../../src/tools/publish/widgets_meta.js';
import { sha256 } from '../../src/tools/publish/hash.js';

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

/** Build a minimal CDS course tree (course-config.md + one overview page with one widget). */
function setupMinimalCourse(opts: { widgetBody: string }): string {
  const cd = join(courseDir, 'course');
  mkdirSync(cd, { recursive: true });
  writeFileSync(join(cd, 'course-config.md'), `---
institution: Test U
course_name: Widget Test
course_number: WGT 101
professor: Test
semester: Fall 2026
weeks: 1

page_types:
  - overview

layout_fixed: true

colors:
  primary: ""
  secondary: ""

hero_images:
  overview: ""
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
| 01 | Widget Week | Test |
`, 'utf-8');

  mkdirSync(join(cd, 'week-01'), { recursive: true });
  writeFileSync(join(cd, 'week-01', 'overview.md'), `---
week: 1
title: "Widget Demo"
---

## Learning Objectives

{{ widget:sort-the-phases }}

## Activities

Submit via Canvas.
`, 'utf-8');

  // Widget files under <courseDir>/overview/widgets/ per Plan A authoring convention.
  mkdirSync(join(cd, 'overview', 'widgets'), { recursive: true });
  writeFileSync(join(cd, 'overview', 'widgets', 'sort-the-phases.html'), opts.widgetBody);
  writeFileSync(join(cd, 'overview', 'widgets', 'sort-the-phases.spec.json'), JSON.stringify({
    id: 'sort-the-phases', name: 'Sort', kind: 'sortable-ordering', purpose: 'p',
    contentSchema: {}, initialContent: {},
    dimensions: { minHeight: 300, maxHeight: 500 },
    accessibility: { keyboardEquivalent: 'k', screenReaderSummary: 's', minTouchTarget: 44 },
  }));
  return cd;
}

describe('previewCoursePublish widget content capture', () => {
  it('sets status="new" when no prior page exists', async () => {
    const cd = setupMinimalCourse({ widgetBody: '<p>new body</p>' });
    // Fresh Response per call — single Response can only be body-read once.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));

    const result = await previewCoursePublish({ courseDir: cd, courseId: 48895 });
    expect(result.manifest).toBeDefined();
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('new');
  });

  it('sets status="unchanged" when prior widget content matches new', async () => {
    const body = '<p>same body</p>';
    const cd = setupMinimalCourse({ widgetBody: body });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/pages') && !u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'overview', title: 'Widget Demo', html_url: 'https://canvas.example/courses/48895/pages/overview', body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/assignments')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify({
          page_id: 1, url: 'overview', title: 'Widget Demo', html_url: '', body: '<iframe src="/courses/48895/files/12345/preview" title="Sort"></iframe>', published: true, updated_at: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345') && !u.includes('/download')) {
        return new Response(JSON.stringify({
          id: 12345, url: 'https://canvas.example/files/12345/download?verifier=x',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345/download')) {
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('not found', { status: 404 });
    }));

    const result = await previewCoursePublish({ courseDir: cd, courseId: 48895 });
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('unchanged');

    const snapshotsRoot = snapshotsRootFor(cd);
    const snapshotDir = join(snapshotsRoot, result.snapshotId!);
    const meta = readWidgetsMeta(snapshotDir);
    const entry = meta.widgets['overview__sort-the-phases'];
    expect(entry).toBeDefined();
    expect(entry!.priorCanvasFileId).toBe(12345);
    expect(entry!.priorContentHash).toBe(sha256(body));
    expect(entry!.newContentHash).toBe(sha256(body));

    const priorPath = join(snapshotDir, 'prior', 'widgets', 'overview__sort-the-phases.html');
    expect(existsSync(priorPath)).toBe(true);
    expect(readFileSync(priorPath, 'utf-8')).toBe(body);
  });

  it('sets status="changed" when prior content differs from new', async () => {
    const cd = setupMinimalCourse({ widgetBody: '<p>new body</p>' });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/pages') && !u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'overview', title: 'Widget Demo', html_url: '', body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/assignments')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify({
          page_id: 1, url: 'overview', title: 'Widget Demo', html_url: '', body: '<iframe src="/courses/48895/files/12345/preview"></iframe>', published: true, updated_at: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345') && !u.includes('/download')) {
        return new Response(JSON.stringify({ id: 12345, url: 'https://canvas.example/files/12345/download?verifier=x' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/files/12345/download')) {
        return new Response('<p>old body</p>', { status: 200 });
      }
      return new Response('404', { status: 404 });
    }));

    const result = await previewCoursePublish({ courseDir: cd, courseId: 48895 });
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('changed');
  });

  it('falls back to status="new" with a logged warning when getFileContent fails', async () => {
    const cd = setupMinimalCourse({ widgetBody: '<p>new</p>' });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/pages') && !u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'overview', title: 'Widget Demo', html_url: '', body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('/assignments')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.match(/\/pages\/[^/]+$/)) {
        return new Response(JSON.stringify({
          page_id: 1, url: 'overview', title: 'Widget Demo', html_url: '', body: '<iframe src="/courses/48895/files/12345/preview"></iframe>', published: true, updated_at: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('boom', { status: 500 });
    }));

    const result = await previewCoursePublish({ courseDir: cd, courseId: 48895 });
    const page = result.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('new');
    expect(page.warnings.some((w: any) => w.message.includes('WIDGET_FETCH_FAILED') || /fetch.*widget/i.test(w.message))).toBe(true);
  });
});
