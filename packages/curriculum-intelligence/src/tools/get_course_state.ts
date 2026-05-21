import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppConfig } from '../config.js';
import type { CourseConfig, CourseId, SemesterRecord } from '../types.js';

export interface GetCourseStateInput {
  id?: CourseId;
}

export interface CourseStateEntry {
  id: CourseId;
  title: string;
  coursePath: string;
  registeredAt: string;
  semesters: SemesterRecord[];
  rssFeedCount: number;
}

export interface GetCourseStateResult {
  appHome: string;
  courses: CourseStateEntry[];
}

export function getCourseState(input: GetCourseStateInput = {}): GetCourseStateResult {
  const appConfig = loadAppConfig();
  const allIds = Object.keys(appConfig.courses);

  let targetIds: CourseId[];
  if (input.id) {
    if (!appConfig.courses[input.id]) {
      throw new Error(`Course "${input.id}" is not registered. Run setup_course first.`);
    }
    targetIds = [input.id];
  } else {
    targetIds = allIds;
  }

  const courses: CourseStateEntry[] = targetIds.map((id) => {
    const reg = appConfig.courses[id];
    const coursePath = join(reg.courseRoot, id);
    const courseConfigPath = join(coursePath, 'config.json');

    let semesters: SemesterRecord[] = [];
    let rssFeedCount = 0;
    if (existsSync(courseConfigPath)) {
      const courseConfig = JSON.parse(readFileSync(courseConfigPath, 'utf-8')) as CourseConfig;
      semesters = courseConfig.semesters;
      rssFeedCount = courseConfig.rssFeeds.length;
    }

    return {
      id: reg.id,
      title: reg.title,
      coursePath,
      registeredAt: reg.registeredAt,
      semesters,
      rssFeedCount,
    };
  });

  return {
    appHome: process.env.CURRICULUM_INTELLIGENCE_HOME || '',
    courses,
  };
}
