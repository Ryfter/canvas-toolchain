import { loadTopicMap } from '../kb/topic_map.js';
import type { CourseId, PageInfo, SemesterId } from '../types.js';

export interface ListPagesInput {
  courseId: CourseId;
  semesterId: SemesterId;
  publishedOnly?: boolean;
}

export interface ListPagesResult {
  courseId: CourseId;
  semesterId: SemesterId;
  pages: PageInfo[];
}

export function listPages(input: ListPagesInput): ListPagesResult {
  const map = loadTopicMap(input.courseId, input.semesterId);
  const filtered = input.publishedOnly ? map.pages.filter((p) => p.published) : map.pages;
  return { courseId: input.courseId, semesterId: input.semesterId, pages: filtered };
}
