import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDefaultCourseRoot, loadAppConfig, saveAppConfig } from '../config.js';
import type { CourseConfig, CourseId } from '../types.js';

export interface SetupCourseInput {
  id: CourseId;
  title: string;
  courseRoot?: string;       // optional override; defaults to <appHome>/courses
}

export interface SetupCourseResult {
  id: CourseId;
  title: string;
  courseRoot: string;
  coursePath: string;        // absolute path to <courseRoot>/<id>/
}

const COURSE_ID_RE = /^[A-Za-z0-9._-]+$/;

export function setupCourse(input: SetupCourseInput): SetupCourseResult {
  if (!input.id || !COURSE_ID_RE.test(input.id)) {
    throw new Error(
      `Invalid course id "${input.id}". Use letters, digits, dot, dash, or underscore (e.g. "ITM370").`
    );
  }
  if (!input.title || !input.title.trim()) {
    throw new Error('Course title is required.');
  }

  const appConfig = loadAppConfig();
  if (appConfig.courses[input.id]) {
    throw new Error(`Course "${input.id}" is already registered.`);
  }

  const courseRoot = input.courseRoot || getDefaultCourseRoot();
  const coursePath = join(courseRoot, input.id);
  const semestersDir = join(coursePath, 'semesters');

  mkdirSync(semestersDir, { recursive: true });

  const courseConfig: CourseConfig = {
    version: 1,
    id: input.id,
    title: input.title,
    semesters: [],
    rssFeeds: [],
  };
  writeFileSync(
    join(coursePath, 'config.json'),
    JSON.stringify(courseConfig, null, 2),
    'utf-8'
  );

  appConfig.courses[input.id] = {
    id: input.id,
    title: input.title,
    courseRoot,
    registeredAt: new Date().toISOString(),
  };
  saveAppConfig(appConfig);

  return {
    id: input.id,
    title: input.title,
    courseRoot,
    coursePath,
  };
}
