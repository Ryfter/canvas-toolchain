import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('canvas-design-mcp/dist/tools/generate-course.js', () => ({
  generateCourse: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/list-canvas-objects.js', () => ({
  listCanvasPages: vi.fn(),
  listCanvasAssignments: vi.fn(),
}));
vi.mock('../../../src/tools/publish/canvas_config_bridge.js', () => ({
  loadInstitutionConfig: vi.fn().mockReturnValue({ canvasUrl: 'https://x', apiToken: 't' }),
}));
vi.mock('canvas-design-mcp/dist/canvas-api.js', () => ({
  CanvasApiClient: vi.fn().mockImplementation(() => ({ getPageBody: vi.fn().mockResolvedValue('') })),
  CanvasApiError: class extends Error {},
}));

import { generateCourse } from 'canvas-design-mcp/dist/tools/generate-course.js';
import { listCanvasPages, listCanvasAssignments } from 'canvas-design-mcp/dist/tools/list-canvas-objects.js';
import { previewCoursePublish } from '../../../src/tools/workflows/preview_course_publish.js';

let cc: string;
let course: string;
beforeEach(() => {
  cc = mkdtempSync(join(tmpdir(), 'cc-'));
  course = mkdtempSync(join(tmpdir(), 'course-'));
  mkdirSync(join(course, 'output'), { recursive: true });
  process.env.CC_HOME = cc;
});
afterEach(() => {
  rmSync(cc, { recursive: true, force: true });
  rmSync(course, { recursive: true, force: true });
  delete process.env.CC_HOME;
  vi.clearAllMocks();
});

describe('previewCoursePublish', () => {
  it('produces a manifest with pages, assignments, and skipped buckets', async () => {
    writeFileSync(join(course, 'output', 'overview.html'), '<h2>Week 1</h2><p>hello</p>');
    writeFileSync(join(course, 'output', 'do-the-thing.html'), '<p>do the thing</p>');
    writeFileSync(join(course, 'output', 'quiz.html'), '<p>quiz</p>');
    vi.mocked(generateCourse).mockReturnValue({
      totalPages: 3, outputDir: join(course, 'output'), warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: join(course, 'output'), warnings: [],
        pages: [
          { html: '<h2>Week 1</h2><p>hello</p>', filename: 'overview.html', weekNumber: 1, pageType: 'overview', savedTo: join(course, 'output', 'overview.html') },
          { html: '<p>do the thing</p>', filename: 'do-the-thing.html', weekNumber: 1, pageType: 'assignment', savedTo: join(course, 'output', 'do-the-thing.html') },
          { html: '<p>quiz</p>', filename: 'quiz.html', weekNumber: 1, pageType: 'weekly-quiz', savedTo: join(course, 'output', 'quiz.html') },
        ],
      }],
    });
    vi.mocked(listCanvasPages).mockResolvedValue([
      { url: 'week-1-overview', title: 'Week 1 Overview', html_url: 'https://x/p/wk1' } as any,
    ]);
    vi.mocked(listCanvasAssignments).mockResolvedValue([
      { id: 7, name: 'do the thing', description: '<p>old</p>' },
    ]);

    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });

    const types = r.manifest!.entries.map(e => e.type);
    expect(types.sort()).toEqual(['assignment', 'page', 'skipped']);
    const asn = r.manifest!.entries.find(e => e.type === 'assignment');
    expect(asn).toBeDefined();
    if (asn?.type === 'assignment') expect(asn.canvasMatch.assignmentId).toBe(7);
    expect(r.snapshotId).toBeDefined();
  });

  it('refuses with GENERATE_FAILED when generateCourse throws', async () => {
    vi.mocked(generateCourse).mockImplementation(() => { throw new Error('course-config.md not found in ' + course); });
    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });
    expect(r.error).toBe('GENERATE_FAILED');
  });

  it('attaches a block-severity warning when getPageBody fails (rollback safety)', async () => {
    const { CanvasApiClient } = await import('canvas-design-mcp/dist/canvas-api.js');
    vi.mocked(CanvasApiClient as any).mockImplementationOnce(() => ({
      getPageBody: vi.fn().mockRejectedValue(new Error('429 rate limited')),
    }));
    writeFileSync(join(course, 'output', 'wk1-overview.html'), '<h2>Week 1</h2>');
    vi.mocked(generateCourse).mockReturnValue({
      totalPages: 1, outputDir: join(course, 'output'), warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: join(course, 'output'), warnings: [],
        pages: [{ html: '<h2>Week 1</h2>', filename: 'wk1-overview.html', weekNumber: 1, pageType: 'overview', savedTo: join(course, 'output', 'wk1-overview.html') }],
      }],
    });
    vi.mocked(listCanvasPages).mockResolvedValue([
      { url: 'wk1-overview', title: 'Wk1 Overview', html_url: 'https://x/wk1' } as any,
    ]);
    vi.mocked(listCanvasAssignments).mockResolvedValue([]);

    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });

    const page = r.manifest!.entries.find(e => e.type === 'page');
    expect(page?.type).toBe('page');
    if (page?.type === 'page') {
      const blocking = page.warnings.find(w => w.severity === 'block' && /Could not fetch current Canvas body/.test(w.message));
      expect(blocking).toBeDefined();
    }
  });

  it('uses front-matter title when present so wk1-overview.html matches "Week 1 Overview"', async () => {
    writeFileSync(join(course, 'output', 'wk1-overview.html'), '<h2>Week 1</h2>');
    vi.mocked(generateCourse).mockReturnValue({
      totalPages: 1, outputDir: join(course, 'output'), warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: join(course, 'output'), warnings: [],
        pages: [{
          html: '<h2>Week 1</h2>', filename: 'wk1-overview.html', weekNumber: 1,
          pageType: 'overview', savedTo: join(course, 'output', 'wk1-overview.html'),
          title: 'Week 1 Overview',  // ← from front-matter
        }],
      }],
    });
    vi.mocked(listCanvasPages).mockResolvedValue([
      { url: 'week-1-overview', title: 'Week 1 Overview', html_url: 'https://x/wk1' } as any,
    ]);
    vi.mocked(listCanvasAssignments).mockResolvedValue([]);

    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });

    const page = r.manifest!.entries.find(e => e.type === 'page');
    expect(page?.type).toBe('page');
    if (page?.type === 'page') {
      expect(page.intendedTitle).toBe('Week 1 Overview');
      expect(page.canvasMatch).toBeDefined();
      expect(page.collisionAction).toBe('update'); // matched → update, not create
    }
  });

  it('embeds inline unified diff on entries whose filenames appear in fullDiffFor', async () => {
    writeFileSync(join(course, 'output', 'wk1-overview.html'), '<h2>Week 1 NEW</h2>');
    writeFileSync(join(course, 'output', 'wk2-overview.html'), '<h2>Week 2 NEW</h2>');
    vi.mocked(generateCourse).mockReturnValue({
      totalPages: 2, outputDir: join(course, 'output'), warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: join(course, 'output'), warnings: [],
        pages: [
          { html: '<h2>Week 1 NEW</h2>', filename: 'wk1-overview.html', weekNumber: 1, pageType: 'overview', savedTo: join(course, 'output', 'wk1-overview.html'), title: 'Week 1 Overview' },
          { html: '<h2>Week 2 NEW</h2>', filename: 'wk2-overview.html', weekNumber: 2, pageType: 'overview', savedTo: join(course, 'output', 'wk2-overview.html'), title: 'Week 2 Overview' },
        ],
      }],
    });
    vi.mocked(listCanvasPages).mockResolvedValue([]);
    vi.mocked(listCanvasAssignments).mockResolvedValue([]);

    const r = await previewCoursePublish({
      courseDir: course, courseId: 12345,
      fullDiffFor: ['wk1-overview.html'],
    });

    const w1 = r.manifest!.entries.find(e => e.type === 'page' && e.filename === 'wk1-overview.html');
    const w2 = r.manifest!.entries.find(e => e.type === 'page' && e.filename === 'wk2-overview.html');
    expect(w1?.type).toBe('page');
    expect(w2?.type).toBe('page');
    if (w1?.type === 'page') {
      expect(w1.diff.fullDiff).toBeDefined();
      expect(w1.diff.fullDiff).toContain('Week 1 NEW');
    }
    if (w2?.type === 'page') {
      expect(w2.diff.fullDiff).toBeUndefined();
    }
  });

  it('flags an unmatched assignment as skipped with reason unmatched-assignment', async () => {
    writeFileSync(join(course, 'output', 'asn.html'), '<p>do</p>');
    vi.mocked(generateCourse).mockReturnValue({
      totalPages: 1, outputDir: join(course, 'output'), warnings: [],
      weekResults: [{
        weekNumber: 1, outputDir: join(course, 'output'), warnings: [],
        pages: [{ html: '<p>do</p>', filename: 'asn.html', weekNumber: 1, pageType: 'assignment', savedTo: join(course, 'output', 'asn.html') }],
      }],
    });
    vi.mocked(listCanvasPages).mockResolvedValue([]);
    vi.mocked(listCanvasAssignments).mockResolvedValue([]);
    const r = await previewCoursePublish({ courseDir: course, courseId: 12345 });
    const skipped = r.manifest!.entries.find(e => e.type === 'skipped');
    expect(skipped?.type).toBe('skipped');
    if (skipped?.type === 'skipped') expect(skipped.reason).toBe('unmatched-assignment');
  });
});
