import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTopicMap } from '../kb/topic_map.js';
import { savePlanConfig, getWeekDir, getNextPlanPath } from '../kb/next_plan.js';
import { parseCdsCourseFolder } from '../parsers/cds_course_folder.js';
import { serializeBriefFile } from '../parsers/front_matter.js';
import type { CourseId, SemesterId, PlanSource, ModuleInfo } from '../types.js';

export interface ImportPreviousShellInput {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  newSemesterId: SemesterId;
  source: PlanSource;
  cdsPath?: string;
}

export interface ImportPreviousShellResult {
  courseId: CourseId;
  sourceSemesterId: SemesterId;
  targetSemesterId: SemesterId;
  sourceUsed: 'archive' | 'cds';
  briefsCreated: number;
  briefPaths: string[];
  planConfigPath: string;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildModuleMap(modules: ModuleInfo[]): Map<number, ModuleInfo> {
  const map = new Map<number, ModuleInfo>();
  for (const mod of modules) {
    for (const item of mod.items) {
      if (item.type === 'Assignment' && item.contentId != null) map.set(item.contentId, mod);
    }
  }
  return map;
}

function defaultFrontMatter(
  title: string, week: number, type: string, points: number | null | undefined,
  originalDue: string | undefined, sourceSemesterId: SemesterId
): Record<string, unknown> {
  return {
    title, week, type,
    ...(points != null ? { points } : {}),
    due: 'TBD',
    ...(originalDue ? { originalDue } : {}),
    verdict: 'UPDATE',
    currency: 'evergreen',
    lastTaught: sourceSemesterId,
    semestersSince: 1,
    newsHits: 0,
    staleness: 'moderate',
    replacement_recommended: false,
  };
}

export function importPreviousShell(input: ImportPreviousShellInput): ImportPreviousShellResult {
  const { courseId, sourceSemesterId, newSemesterId } = input;
  const briefPaths: string[] = [];
  let sourceUsed: 'archive' | 'cds';

  const useCds = input.source === 'cds' || (input.source === 'auto' && input.cdsPath != null);

  if (useCds && input.cdsPath) {
    sourceUsed = 'cds';
    for (const brief of parseCdsCourseFolder(input.cdsPath).briefs) {
      const filePath = join(getWeekDir(courseId, newSemesterId, brief.week), `${toSlug(brief.title)}.md`);
      writeFileSync(filePath, serializeBriefFile(
        defaultFrontMatter(brief.title, brief.week, brief.type, brief.points, brief.due, sourceSemesterId),
        brief.body
      ), 'utf-8');
      briefPaths.push(filePath);
    }
  } else {
    sourceUsed = 'archive';
    const topicMap = loadTopicMap(courseId, sourceSemesterId);
    const modMap = buildModuleMap(topicMap.modules);
    for (const a of topicMap.assignments) {
      const week = modMap.get(a.canvasId)?.position ?? 1;
      const filePath = join(getWeekDir(courseId, newSemesterId, week), `${toSlug(a.name)}.md`);
      writeFileSync(filePath, serializeBriefFile(
        defaultFrontMatter(a.name, week, 'assignment', a.pointsPossible, a.dueAt?.slice(0, 10), sourceSemesterId),
        `\n${a.descriptionExcerpt}\n`
      ), 'utf-8');
      briefPaths.push(filePath);
    }
  }

  savePlanConfig({
    courseId, sourceSemesterId, targetSemesterId: newSemesterId,
    source: input.source, sections: [], status: 'draft', toolsRun: ['import_previous_shell']
  });

  return {
    courseId, sourceSemesterId, targetSemesterId: newSemesterId, sourceUsed,
    briefsCreated: briefPaths.length, briefPaths,
    planConfigPath: join(getNextPlanPath(courseId, newSemesterId), 'plan-config.json'),
  };
}
