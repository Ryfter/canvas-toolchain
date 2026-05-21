import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from './course_state.js';
import type { CourseId, SemesterId, PlanConfig, SemesterCalendar } from '../types.js';

export function getNextPlanPath(courseId: CourseId, semesterId: SemesterId): string {
  return join(getSemesterPath(courseId, semesterId), 'next-plan');
}

function ensureNextPlanDir(courseId: CourseId, semesterId: SemesterId): string {
  const dir = getNextPlanPath(courseId, semesterId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function savePlanConfig(cfg: PlanConfig): void {
  const dir = ensureNextPlanDir(cfg.courseId, cfg.targetSemesterId);
  writeFileSync(join(dir, 'plan-config.json'), JSON.stringify(cfg, null, 2), 'utf-8');
}

export function loadPlanConfig(courseId: CourseId, semesterId: SemesterId): PlanConfig {
  const path = join(getNextPlanPath(courseId, semesterId), 'plan-config.json');
  if (!existsSync(path)) {
    throw new Error(`No plan-config.json at ${path}. Run import_previous_shell first.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as PlanConfig;
}

export function saveCalendar(courseId: CourseId, semesterId: SemesterId, cal: SemesterCalendar): void {
  const dir = ensureNextPlanDir(courseId, semesterId);
  writeFileSync(join(dir, 'calendar.json'), JSON.stringify(cal, null, 2), 'utf-8');
}

export function loadCalendar(courseId: CourseId, semesterId: SemesterId): SemesterCalendar {
  const path = join(getNextPlanPath(courseId, semesterId), 'calendar.json');
  if (!existsSync(path)) {
    throw new Error(`No calendar.json at ${path}. Run fetch_academic_calendar first.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as SemesterCalendar;
}

export function getWeekDir(courseId: CourseId, semesterId: SemesterId, weekNum: number): string {
  const dir = join(getNextPlanPath(courseId, semesterId), `week-${String(weekNum).padStart(2, '0')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
