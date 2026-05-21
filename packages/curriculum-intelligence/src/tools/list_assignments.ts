import { loadTopicMap } from '../kb/topic_map.js';
import type { AssignmentInfo, CourseId, SemesterId } from '../types.js';

export interface ListAssignmentsInput {
  courseId: CourseId;
  semesterId: SemesterId;
  publishedOnly?: boolean;
}

export interface ListAssignmentsResult {
  courseId: CourseId;
  semesterId: SemesterId;
  assignments: AssignmentInfo[];
}

export function listAssignments(input: ListAssignmentsInput): ListAssignmentsResult {
  const map = loadTopicMap(input.courseId, input.semesterId);
  const filtered = input.publishedOnly
    ? map.assignments.filter((a) => a.published)
    : map.assignments;
  return { courseId: input.courseId, semesterId: input.semesterId, assignments: filtered };
}
