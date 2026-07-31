import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planNextSemester } from '../../../src/tools/workflows/plan_next_semester.js';

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

vi.mock('@canvas-toolchain/curriculum-intelligence/dist/tools/import_previous_shell.js', () => ({
  importPreviousShell: vi.fn().mockReturnValue({ briefsCreated: 15, briefPaths: [] }),
}));
vi.mock('@canvas-toolchain/curriculum-intelligence/dist/tools/fetch_academic_calendar.js', () => ({
  fetchAcademicCalendar: vi.fn().mockResolvedValue({ semesterId: 'Fall2026', classesBegin: '2026-08-25', breaks: [] }),
}));
vi.mock('@canvas-toolchain/curriculum-intelligence/dist/tools/shift_dates.js', () => ({
  shiftDates: vi.fn().mockReturnValue({ shiftsApplied: 15, collisions: 0, shiftedPaths: [] }),
}));
vi.mock('@canvas-toolchain/curriculum-intelligence/dist/tools/generate_recommended_outline.js', () => ({
  generateRecommendedOutline: vi.fn().mockReturnValue({ topics: new Array(16), outlinePath: '/tmp/plan-outline.md' }),
}));

describe('planNextSemester', () => {
  it('runs shell → calendar → shift → outline in sequence', async () => {
    const result = await planNextSemester({
      courseId: 'ITM370',
      sourceSemesterId: 'Spring2026',
      newSemesterId: 'Fall2026',
      semesterPattern: 'Fall2026',
      onBreakCollision: 'flag',
    });
    expect(result.shell.briefsCreated).toBe(15);
    expect(result.shift.shiftsApplied).toBe(15);
    expect(result.outline.topics).toHaveLength(16);
    expect(result.status).toBe('complete');
  });
});
