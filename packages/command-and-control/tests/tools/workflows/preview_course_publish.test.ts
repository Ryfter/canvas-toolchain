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
