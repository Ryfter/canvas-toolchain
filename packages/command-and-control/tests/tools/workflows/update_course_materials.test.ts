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
  it('returns complete status with draft, examples, and export results', async () => {
    const planDir = join(tmpHome, 'courses', 'ITM370', 'semesters', 'Fall2026', 'next-plan', 'week-01');
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, 'test-assignment.md'), '---\ntitle: Test\n---\nbody');

    const result = await updateCourseMaterials({ courseId: 'ITM370', semesterId: 'Fall2026' });
    expect(result.draftsCompleted).toBeGreaterThanOrEqual(0);
    expect(result.export.sectionCount).toBe(1);
    expect(result.status).toBe('complete');
  });
});
