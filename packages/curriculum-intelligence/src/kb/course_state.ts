import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppConfig } from '../config.js';
import type { CourseConfig, CourseId, SemesterId } from '../types.js';

/**
 * Resolve the absolute path to <courseRoot>/<courseId>/ for a registered course.
 * Throws if the course is not registered.
 */
export function getCoursePath(courseId: CourseId): string {
  const app = loadAppConfig();
  const reg = app.courses[courseId];
  if (!reg) {
    throw new Error(`Course "${courseId}" is not registered. Run setup_course first.`);
  }
  return join(reg.courseRoot, courseId);
}

export function getCourseConfigPath(courseId: CourseId): string {
  return join(getCoursePath(courseId), 'config.json');
}

export function loadCourseConfig(courseId: CourseId): CourseConfig {
  const path = getCourseConfigPath(courseId);
  if (!existsSync(path)) {
    throw new Error(`Course config not found at ${path}. The course folder may be corrupted.`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as CourseConfig;
}

export function saveCourseConfig(config: CourseConfig): void {
  const path = getCourseConfigPath(config.id);
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
}

export function getSemesterPath(courseId: CourseId, semesterId: SemesterId): string {
  return join(getCoursePath(courseId), 'semesters', semesterId);
}

export function ensureSemesterFolders(courseId: CourseId, semesterId: SemesterId): string {
  const semDir = getSemesterPath(courseId, semesterId);
  mkdirSync(join(semDir, 'transcripts'), { recursive: true });
  return semDir;
}
