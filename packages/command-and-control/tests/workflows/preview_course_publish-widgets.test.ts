import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCoursePublish } from '../../src/tools/workflows/preview_course_publish.js';

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

const validSpec = {
  id: 'foo', name: 'Foo Widget', kind: 'card-flip-reveal', purpose: '',
  contentSchema: {}, initialContent: { cards: [{ front: 'Q', back: 'A' }] },
  dimensions: { minHeight: 200, maxHeight: 400 },
  accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
};

/** Stub the Canvas API calls preview hits — listPages, listAssignments — with
 *  empty arrays so preview proceeds without trying to match. */
function mockCanvasApi() {
  return vi.fn().mockImplementation(async (url: string) => {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

/** Create a minimal course folder + course-config.md with one page that has
 *  widget placeholders, then return paths so tests can populate widget files. */
function setupCourse(opts: { briefBody: string; addWidgets: Array<{ slug: string; id: string; missingHtml?: boolean; missingSpec?: boolean }> }): { courseDir: string } {
  const courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  writeFileSync(join(courseDir, 'course-config.md'), `---
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

  mkdirSync(join(courseDir, 'week-01'), { recursive: true });
  writeFileSync(join(courseDir, 'week-01', 'overview.md'), `---
week: 1
title: "Widget Demo"
---

## Learning Objectives

${opts.briefBody}

## Activities

Submit via Canvas.
`, 'utf-8');

  for (const w of opts.addWidgets) {
    const widgetsDir = join(courseDir, w.slug, 'widgets');
    mkdirSync(widgetsDir, { recursive: true });
    if (!w.missingHtml) {
      writeFileSync(join(widgetsDir, `${w.id}.html`), `<!DOCTYPE html>${w.id}`, 'utf-8');
    }
    if (!w.missingSpec) {
      writeFileSync(join(widgetsDir, `${w.id}.spec.json`), JSON.stringify({ ...validSpec, id: w.id, name: w.id }), 'utf-8');
    }
  }

  return { courseDir };
}

describe('previewCoursePublish widget surfacing', () => {
  it('lists every widget reference under the page entry with ready status', async () => {
    stubCanvasConfig();
    vi.stubGlobal('fetch', mockCanvasApi());
    const { courseDir } = setupCourse({
      briefBody: 'Practice:\n\n{{ widget:foo }}\n\nThen submit.',
      addWidgets: [{ slug: 'overview', id: 'foo' }],
    });

    const result = await previewCoursePublish({ courseDir, courseId: 48895 });

    expect(result.error).toBeUndefined();
    expect(result.manifest).toBeDefined();
    const pageEntry = result.manifest!.entries.find(e => e.type === 'page') as any;
    expect(pageEntry).toBeDefined();
    expect(pageEntry.widgets).toBeDefined();
    expect(pageEntry.widgets).toHaveLength(1);
    expect(pageEntry.widgets[0].id).toBe('foo');
    expect(pageEntry.widgets[0].slug).toBe('overview');
    expect(pageEntry.widgets[0].status).toBe('ready');
    expect(pageEntry.widgets[0].htmlPath).toContain('foo.html');
    expect(pageEntry.widgets[0].specPath).toContain('foo.spec.json');
  });

  it('reports status missing-html when the widget HTML file is absent', async () => {
    stubCanvasConfig();
    vi.stubGlobal('fetch', mockCanvasApi());
    const { courseDir } = setupCourse({
      briefBody: '{{ widget:gone }}',
      addWidgets: [{ slug: 'overview', id: 'gone', missingHtml: true }],
    });

    const result = await previewCoursePublish({ courseDir, courseId: 48895 });

    const pageEntry = result.manifest!.entries.find(e => e.type === 'page') as any;
    expect(pageEntry.widgets[0].status).toBe('missing-html');
    expect(pageEntry.warnings.some((w: any) => w.message.includes('Widget "gone"'))).toBe(true);
  });

  it('reports status missing-spec when only the spec.json is absent', async () => {
    stubCanvasConfig();
    vi.stubGlobal('fetch', mockCanvasApi());
    const { courseDir } = setupCourse({
      briefBody: '{{ widget:spec-only-missing }}',
      addWidgets: [{ slug: 'overview', id: 'spec-only-missing', missingSpec: true }],
    });

    const result = await previewCoursePublish({ courseDir, courseId: 48895 });

    const pageEntry = result.manifest!.entries.find(e => e.type === 'page') as any;
    expect(pageEntry.widgets[0].status).toBe('missing-spec');
    expect(pageEntry.warnings.some((w: any) => w.severity === 'warn' && w.message.includes('spec.json'))).toBe(true);
  });

  it('omits widgets field when the page has no placeholders', async () => {
    stubCanvasConfig();
    vi.stubGlobal('fetch', mockCanvasApi());
    const { courseDir } = setupCourse({
      briefBody: 'Plain page with no widgets.',
      addWidgets: [],
    });

    const result = await previewCoursePublish({ courseDir, courseId: 48895 });

    const pageEntry = result.manifest!.entries.find(e => e.type === 'page') as any;
    expect(pageEntry.widgets).toBeUndefined();
  });

  it('lists multiple widgets and per-widget status independently', async () => {
    stubCanvasConfig();
    vi.stubGlobal('fetch', mockCanvasApi());
    const { courseDir } = setupCourse({
      briefBody: '{{ widget:first }}\n\nmiddle\n\n{{ widget:second }}',
      addWidgets: [
        { slug: 'overview', id: 'first' },
        { slug: 'overview', id: 'second', missingHtml: true },
      ],
    });

    const result = await previewCoursePublish({ courseDir, courseId: 48895 });

    const pageEntry = result.manifest!.entries.find(e => e.type === 'page') as any;
    expect(pageEntry.widgets).toHaveLength(2);
    expect(pageEntry.widgets.find((w: any) => w.id === 'first').status).toBe('ready');
    expect(pageEntry.widgets.find((w: any) => w.id === 'second').status).toBe('missing-html');
  });
});
