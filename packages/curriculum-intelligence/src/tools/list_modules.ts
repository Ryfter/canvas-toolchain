import { loadTopicMap } from '../kb/topic_map.js';
import type { CourseId, ModuleItem, SemesterId } from '../types.js';

export interface ListModulesInput {
  courseId: CourseId;
  semesterId: SemesterId;
  expandItems?: boolean;
}

export interface ModuleListEntry {
  canvasId: number;
  position: number;
  name: string;
  published: boolean;
  itemCount: number;
  items?: ModuleItem[];        // present when expandItems is true
}

export interface ListModulesResult {
  courseId: CourseId;
  semesterId: SemesterId;
  modules: ModuleListEntry[];
}

export function listModules(input: ListModulesInput): ListModulesResult {
  const map = loadTopicMap(input.courseId, input.semesterId);
  const modules: ModuleListEntry[] = map.modules.map((m) => ({
    canvasId: m.canvasId,
    position: m.position,
    name: m.name,
    published: m.published,
    itemCount: m.items.length,
    items: input.expandItems ? m.items : undefined,
  }));
  return { courseId: input.courseId, semesterId: input.semesterId, modules };
}
