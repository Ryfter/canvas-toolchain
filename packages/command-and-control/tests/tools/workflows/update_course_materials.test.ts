import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateCourseMaterials } from '../../../src/tools/workflows/update_course_materials.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = tmpHome;
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CC_HOME;
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

vi.mock('curriculum-intelligence-mcp/dist/tools/draft_assignment_brief.js', () => ({
  draftAssignmentBrief: vi.fn().mockResolvedValue({ replacementRecommended: false }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/update_examples.js', () => ({
  updateExamples: vi.fn().mockReturnValue({ replacementsApplied: 2, proposedRewrites: [] }),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/export_course_folder.js', () => ({
  exportCourseFolder: vi.fn().mockReturnValue({ outputPaths: ['/tmp/export'], sectionCount: 1 }),
}));

describe('updateCourseMaterials', () => {
  it('returns the comprehensive update-course-materials report shape', async () => {
    const planDir = join(tmpHome, 'courses', 'ITM370', 'semesters', 'Fall2026', 'next-plan', 'week-01');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, 'test-assignment.md'), '---\ntitle: Test\n---\nbody');

    const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });
    expect(result).toMatchObject({
      courseId: 'ITM370',
      semesterId: 'Fall2026',
      pages: [
        {
          assignmentName: 'test-assignment',
          verdict: 'UPDATE',
          templateUsed: { id: 'not-selected', version: '0.0.0' },
          themeUsed: { id: 'not-selected', version: '0.0.0' },
          promptSetUsed: { id: 'not-selected', version: '0.0.0' },
          htmlPath: '',
          status: 'skipped',
        },
      ],
      droppedAssignments: [],
      export: { exportPath: '/tmp/export' },
      summary: {
        totalAssignments: 1,
        cleanCount: 0,
        needsReviewCount: 0,
        droppedCount: 0,
        skippedCount: 1,
      },
      status: 'complete',
    });
    expect(result.pages[0].needsReviewReasons).toContain(
      'HTML rendering is pending full update_course_materials orchestration.',
    );
    expect(result.pendingSelections).toBeUndefined();
    expect(result.status).toBe('complete');
  });
});
