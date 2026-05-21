import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from '../kb/course_state.js';
import { loadTopicMap } from '../kb/topic_map.js';
import type { CourseId, SemesterId, TopicMap } from '../types.js';

export interface DiffSemestersInput {
  courseId: CourseId;
  leftSemesterId: SemesterId;        // e.g. "last semester"
  rightSemesterId: SemesterId;       // e.g. "this/next semester"
}

export interface SemesterDiff {
  version: 1;
  courseId: CourseId;
  leftSemesterId: SemesterId;
  rightSemesterId: SemesterId;
  generatedAt: string;
  modules: ModuleDiff;
  assignments: AssignmentDiff;
  pages: PageDiff;
  resources: ResourceDiff;
}

export interface ModuleDiff {
  added: { name: string; position: number }[];
  removed: { name: string; position: number }[];
  common: { leftName: string; rightName: string }[];
}

export interface AssignmentDiff {
  added: { name: string; pointsPossible: number | null }[];
  removed: { name: string; pointsPossible: number | null }[];
  reusedVerbatim: { name: string; pointsPossible: number | null }[];
  rewritten: { name: string; leftExcerpt: string; rightExcerpt: string }[];
}

export interface PageDiff {
  added: { url: string; title: string }[];
  removed: { url: string; title: string }[];
  commonCount: number;
}

export interface ResourceDiff {
  added: string[];
  removed: string[];
}

export interface DiffSemestersResult extends SemesterDiff {
  diffPath: string;
}

export function diffSemesters(input: DiffSemestersInput): DiffSemestersResult {
  const left = loadTopicMap(input.courseId, input.leftSemesterId);
  const right = loadTopicMap(input.courseId, input.rightSemesterId);

  const diff: SemesterDiff = {
    version: 1,
    courseId: input.courseId,
    leftSemesterId: input.leftSemesterId,
    rightSemesterId: input.rightSemesterId,
    generatedAt: new Date().toISOString(),
    modules: diffModules(left, right),
    assignments: diffAssignments(left, right),
    pages: diffPages(left, right),
    resources: diffResources(left, right),
  };

  const semDir = getSemesterPath(input.courseId, input.leftSemesterId);
  const diffPath = join(semDir, `diff-vs-${input.rightSemesterId}.json`);
  writeFileSync(diffPath, JSON.stringify(diff, null, 2), 'utf-8');

  return { ...diff, diffPath };
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function diffModules(left: TopicMap, right: TopicMap): ModuleDiff {
  const leftByKey = new Map(left.modules.map((m) => [normalizeName(m.name), m]));
  const rightByKey = new Map(right.modules.map((m) => [normalizeName(m.name), m]));

  const added: ModuleDiff['added'] = [];
  const removed: ModuleDiff['removed'] = [];
  const common: ModuleDiff['common'] = [];

  for (const [k, m] of leftByKey) {
    if (rightByKey.has(k)) {
      const r = rightByKey.get(k)!;
      common.push({ leftName: m.name, rightName: r.name });
    } else {
      removed.push({ name: m.name, position: m.position });
    }
  }
  for (const [k, m] of rightByKey) {
    if (!leftByKey.has(k)) {
      added.push({ name: m.name, position: m.position });
    }
  }
  return { added, removed, common };
}

function diffAssignments(left: TopicMap, right: TopicMap): AssignmentDiff {
  const leftByKey = new Map(left.assignments.map((a) => [normalizeName(a.name), a]));
  const rightByKey = new Map(right.assignments.map((a) => [normalizeName(a.name), a]));

  const added: AssignmentDiff['added'] = [];
  const removed: AssignmentDiff['removed'] = [];
  const reusedVerbatim: AssignmentDiff['reusedVerbatim'] = [];
  const rewritten: AssignmentDiff['rewritten'] = [];

  for (const [k, a] of leftByKey) {
    const r = rightByKey.get(k);
    if (!r) {
      removed.push({ name: a.name, pointsPossible: a.pointsPossible });
      continue;
    }
    if (a.descriptionExcerpt === r.descriptionExcerpt) {
      reusedVerbatim.push({ name: a.name, pointsPossible: a.pointsPossible });
    } else {
      rewritten.push({
        name: a.name,
        leftExcerpt: a.descriptionExcerpt,
        rightExcerpt: r.descriptionExcerpt,
      });
    }
  }
  for (const [k, a] of rightByKey) {
    if (!leftByKey.has(k)) {
      added.push({ name: a.name, pointsPossible: a.pointsPossible });
    }
  }
  return { added, removed, reusedVerbatim, rewritten };
}

function diffPages(left: TopicMap, right: TopicMap): PageDiff {
  const leftUrls = new Set(left.pages.map((p) => p.url));
  const rightUrls = new Set(right.pages.map((p) => p.url));

  const added: PageDiff['added'] = [];
  const removed: PageDiff['removed'] = [];
  let commonCount = 0;

  for (const p of right.pages) {
    if (!leftUrls.has(p.url)) added.push({ url: p.url, title: p.title });
  }
  for (const p of left.pages) {
    if (!rightUrls.has(p.url)) removed.push({ url: p.url, title: p.title });
    else commonCount++;
  }
  return { added, removed, commonCount };
}

function diffResources(left: TopicMap, right: TopicMap): ResourceDiff {
  const leftSet = new Set(left.resourceLinks.map((r) => r.url));
  const rightSet = new Set(right.resourceLinks.map((r) => r.url));

  const added: string[] = [];
  const removed: string[] = [];

  for (const u of rightSet) if (!leftSet.has(u)) added.push(u);
  for (const u of leftSet) if (!rightSet.has(u)) removed.push(u);
  return { added, removed };
}
