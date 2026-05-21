import { loadTopicMap } from '../kb/topic_map.js';
import type { CourseId, ResourceLink, SemesterId } from '../types.js';

export interface ListResourcesInput {
  courseId: CourseId;
  semesterId: SemesterId;
  sourceKind?: ResourceLink['source'];        // page | assignment | discussion
  externalOnly?: boolean;                     // default true: drops Canvas-internal URLs
}

export interface ListResourcesResult {
  courseId: CourseId;
  semesterId: SemesterId;
  resources: ResourceLink[];
}

export function listResources(input: ListResourcesInput): ListResourcesResult {
  const map = loadTopicMap(input.courseId, input.semesterId);
  let resources = map.resourceLinks;

  const externalOnly = input.externalOnly ?? true;
  if (externalOnly) {
    resources = resources.filter((r) => !r.url.includes('instructure.com'));
  }
  if (input.sourceKind) {
    resources = resources.filter((r) => r.source === input.sourceKind);
  }

  return { courseId: input.courseId, semesterId: input.semesterId, resources };
}
