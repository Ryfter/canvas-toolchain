import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import {
  getNextPlanPath,
  savePlanConfig,
  loadPlanConfig,
  saveCalendar,
  loadCalendar,
  getWeekDir,
} from '../../src/kb/next_plan.js';
import type { PlanConfig, SemesterCalendar } from '../../src/types.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('getNextPlanPath', () => {
  test('returns path inside the target semester folder', () => {
    const p = getNextPlanPath('TEST101', 'Fall2026');
    expect(p).toContain(join('semesters', 'Fall2026', 'next-plan'));
  });
});

describe('savePlanConfig / loadPlanConfig', () => {
  test('round-trips a PlanConfig', () => {
    const cfg: PlanConfig = {
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2026',
      targetSemesterId: 'Fall2026',
      source: 'archive',
      sections: ['01'],
      status: 'draft',
      toolsRun: ['import_previous_shell'],
    };
    savePlanConfig(cfg);
    expect(loadPlanConfig('TEST101', 'Fall2026')).toEqual(cfg);
  });
});

describe('saveCalendar / loadCalendar', () => {
  test('round-trips a SemesterCalendar', () => {
    const cal: SemesterCalendar = {
      semesterId: 'Fall2026',
      classesBegin: '2026-08-24',
      classesEnd: '2026-12-11',
      breaks: [{ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' }],
      source: 'manual',
      partial: false,
    };
    saveCalendar('TEST101', 'Fall2026', cal);
    expect(loadCalendar('TEST101', 'Fall2026')).toEqual(cal);
  });
});

describe('getWeekDir', () => {
  test('creates directory and returns path with zero-padded week', () => {
    const dir = getWeekDir('TEST101', 'Fall2026', 3);
    expect(dir).toContain('week-03');
    expect(existsSync(dir)).toBe(true);
  });
});
