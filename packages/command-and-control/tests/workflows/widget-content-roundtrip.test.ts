import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCoursePublish } from '../../src/tools/workflows/preview_course_publish.js';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';

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

/** CDS-shaped course tree with one overview page referencing one widget. */
function setupCourse(opts: { widgetBody: string }): string {
  const cd = join(courseDir, 'course');
  mkdirSync(cd, { recursive: true });
  writeFileSync(join(cd, 'course-config.md'), `---
institution: Test U
course_name: Round Trip Test
course_number: RT 101
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
| 01 | Round | Trip |
`, 'utf-8');

  mkdirSync(join(cd, 'week-01'), { recursive: true });
  writeFileSync(join(cd, 'week-01', 'overview.md'), `---
week: 1
title: "Round Trip"
---

## Learning Objectives

{{ widget:sort-the-phases }}

## Activities

Submit via Canvas.
`, 'utf-8');

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

describe('widget content lifecycle round-trip', () => {
  it('preview → publish → rollback restores Canvas to the pre-preview widget content', async () => {
    const newWidgetBody = '<p>NEW widget content</p>';
    const priorWidgetBody = '<p>PRIOR widget content</p>';
    const cd = setupCourse({ widgetBody: newWidgetBody });

    // In-memory Canvas state — pre-seeded with prior widget at file_id 100.
    const canvasFiles = new Map<number, string>();
    canvasFiles.set(100, priorWidgetBody);
    let nextFileId = 200;
    let livePageBody = '<iframe src="/courses/48895/files/100/preview"></iframe>';

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';

      // listPages
      if (u.match(/\/pages(\?|$)/) && method === 'GET') {
        return new Response(JSON.stringify([{
          page_id: 1, url: 'overview', title: 'Round Trip',
          html_url: 'https://canvas.example/courses/48895/pages/overview',
          body: '', published: true, updated_at: '',
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // listAssignments
      if (u.includes('/assignments')) {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // page GET/PUT for body
      if (u.match(/\/pages\/overview$/)) {
        if (method === 'GET') {
          return new Response(JSON.stringify({
            page_id: 1, url: 'overview', title: 'Round Trip', html_url: '', body: livePageBody, published: true, updated_at: '',
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (method === 'PUT') {
          const parsed = JSON.parse(String((init?.body as any) ?? '{}'));
          livePageBody = parsed?.wiki_page?.body ?? livePageBody;
          return new Response(JSON.stringify({ page_id: 1, url: 'overview', title: 'Round Trip', html_url: '', body: livePageBody, published: true, updated_at: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
      }
      // File DELETE (check before metadata GET so the same /files/ID pattern is disambiguated by method).
      const fileDeleteMatch = u.match(/\/files\/(\d+)$/);
      if (fileDeleteMatch && method === 'DELETE') {
        canvasFiles.delete(Number(fileDeleteMatch[1]));
        return new Response('{}', { status: 200 });
      }
      // File metadata
      const fileMetaMatch = u.match(/\/files\/(\d+)$/);
      if (fileMetaMatch && method === 'GET') {
        const id = Number(fileMetaMatch[1]);
        if (!canvasFiles.has(id)) return new Response('not found', { status: 404 });
        return new Response(JSON.stringify({
          id, url: `https://canvas.example/files/${id}/download?verifier=x`,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      // File download
      const fileDownloadMatch = u.match(/\/files\/(\d+)\/download/);
      if (fileDownloadMatch) {
        const id = Number(fileDownloadMatch[1]);
        return new Response(canvasFiles.get(id) ?? '', { status: 200 });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    // publishWidget stub: allocates new file_id, writes the htmlPath content into canvasFiles map.
    const publishWidgetStub = vi.fn().mockImplementation(async (input: any) => {
      const fileId = nextFileId++;
      const content = readFileSync(input.htmlPath, 'utf-8');
      canvasFiles.set(fileId, content);
      return {
        canvasFileId: fileId,
        embedSrc: `https://canvas.example/courses/48895/files/${fileId}/preview`,
        embedHtml: `<iframe src="https://canvas.example/courses/48895/files/${fileId}/preview"></iframe>`,
      };
    });

    // --- 1. Preview ---
    const preview = await previewCoursePublish({ courseDir: cd, courseId: 48895 });
    expect(preview.manifest).toBeDefined();
    const page = preview.manifest!.entries.find(e => e.type === 'page')! as any;
    expect(page.widgets[0].status).toBe('changed');

    // --- 2. Publish ---
    const publish = await publishCourse(
      { snapshotId: preview.snapshotId!, approvals: { 'overview.html': 'approve' }, gitCommit: false },
      { publishWidget: publishWidgetStub as any },
    );
    // eslint-disable-next-line no-console
    console.log('PUBLISH RESULT:', JSON.stringify(publish, null, 2));
    // eslint-disable-next-line no-console
    console.log('PREVIEW MANIFEST ENTRIES:', JSON.stringify(preview.manifest!.entries.map(e => ({ filename: e.filename, type: e.type })), null, 2));
    expect(publish.phase).toBe('published');

    // After publish, the live page should reference the NEW widget file_id (200 first allocated).
    const newFileId = publish.published.find(p => p.filename === 'overview.html')!.widgets![0]!.canvasFileId!;
    expect(canvasFiles.get(newFileId)).toBe(newWidgetBody);
    expect(livePageBody).toContain(`/files/${newFileId}/preview`);

    // --- 3. Rollback ---
    const rollback = await rollbackCoursePublish(
      { snapshotId: preview.snapshotId! },
      { publishWidget: publishWidgetStub as any },
    );
    expect(rollback.phase).toBe('rolled-back');

    // After rollback, the live page should reference a file whose content matches
    // the PRIOR widget body (the restore re-uploaded prior/widgets/.../sort-the-phases.html).
    const restoredEntry = rollback.widgetsCleaned.find(w => w.id === 'sort-the-phases')!;
    expect(restoredEntry.status).toBe('restored');
    const restoredFileId = restoredEntry.canvasFileId!;
    expect(canvasFiles.get(restoredFileId)).toBe(priorWidgetBody);
    expect(livePageBody).toContain(`/files/${restoredFileId}/preview`);
    expect(livePageBody).not.toContain(`/files/${newFileId}/preview`);
  });
});
