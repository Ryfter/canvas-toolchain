import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from './course_state.js';
import type { CourseId, SemesterId, TopicMap } from '../types.js';

export function getTopicMapPath(courseId: CourseId, semesterId: SemesterId): string {
  return join(getSemesterPath(courseId, semesterId), 'topic-map.json');
}

export function loadTopicMap(courseId: CourseId, semesterId: SemesterId): TopicMap {
  const path = getTopicMapPath(courseId, semesterId);
  if (!existsSync(path)) {
    throw new Error(
      `No topic-map.json found at ${path}. Run ingest_canvas_archive for ${courseId} / ${semesterId} first.`
    );
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as TopicMap;
}
