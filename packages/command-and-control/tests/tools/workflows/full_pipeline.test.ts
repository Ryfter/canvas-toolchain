import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fullPipeline } from '../../../src/tools/workflows/full_pipeline.js';

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

vi.mock('../../../src/tools/workflows/analyze_course.js', () => ({
  analyzeCourse: vi.fn().mockResolvedValue({ ingest: {}, status: 'complete' }),
}));
vi.mock('../../../src/tools/workflows/plan_next_semester.js', () => ({
  planNextSemester: vi.fn().mockResolvedValue({ shell: {}, calendar: {}, shift: {}, outline: {}, status: 'complete' }),
}));
vi.mock('../../../src/tools/workflows/update_course_materials.js', () => ({
  updateCourseMaterials: vi.fn().mockResolvedValue({ draftsCompleted: 5, export: {}, status: 'complete' }),
}));

describe('fullPipeline', () => {
  it('runs all three workflows in sequence and reports complete', async () => {
    const result = await fullPipeline({
      courseId: 'ITM370',
      sourceSemesterId: 'Spring2026',
      newSemesterId: 'Fall2026',
      archivePath: '/fake/archive',
      semesterPattern: 'Fall2026',
      onBreakCollision: 'flag',
    });
    expect(result.analyze.status).toBe('complete');
    expect(result.plan.status).toBe('complete');
    expect(result.update.status).toBe('complete');
    expect(result.status).toBe('complete' as const);
  });
});
