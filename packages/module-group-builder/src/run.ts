import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Diagnostics, Grouping, StrategyId } from './types.js';
import { CanvasClient } from './data/canvas-client.js';
import { loadCanvasCreds } from './data/canvas-client.js';
import { parseRosterFile } from './data/roster.js';
import { buildStudentRecords } from './data/merge.js';
import { getStrategy } from './strategies/index.js';
import type { StrategyOpts } from './strategies/types.js';
import { resolveGroupSpec } from './spec.js';
import { loadHistory, appendGrouping } from './history/store.js';
import { optimize } from './engine/optimize.js';
import { renderGroupsCsv, renderGroupsMarkdown } from './output/file.js';
import { pushGroupsToCanvas } from './output/canvas-push.js';
import { loadMajorBuckets } from './buckets/store.js';

export interface CreateGroupsInput {
  courseId: string;
  strategy: StrategyId;
  groupSize?: number;
  groupCount?: number;
  rosterFile?: string;
  assignmentIds?: number[];   // for assignmentsCompleted
  metric?: string;
  weights?: Record<string, number>;
  weightedMode?: 'balance' | 'cluster';
  majorBuckets?: Record<string, string>;
  seed?: number;
  outputDir?: string;
  pushToCanvas?: boolean;
  canvasCategoryName?: string;
}
export interface CreateGroupsResult { grouping: Grouping; diagnostics: Diagnostics; csvPath: string; markdownPath: string; canvasPush?: { categoryId: number; groupIds: number[] }; }

export interface RunDeps { client?: { listStudentEnrollments: CanvasClient['listStudentEnrollments']; listSubmissions: CanvasClient['listSubmissions']; createGroupCategory: CanvasClient['createGroupCategory']; createGroup: CanvasClient['createGroup']; addGroupMember: CanvasClient['addGroupMember'] }; }

export async function createGroups(input: CreateGroupsInput, deps: RunDeps = {}): Promise<CreateGroupsResult> {
  const courseIdNum = Number(input.courseId);
  const client = deps.client ?? new CanvasClient(loadCanvasCreds());
  const enrollments = await client.listStudentEnrollments(courseIdNum);
  const submissions = input.assignmentIds?.length ? await client.listSubmissions(courseIdNum, input.assignmentIds) : [];
  const roster = input.rosterFile ? parseRosterFile(input.rosterFile) : [];
  const { records } = buildStudentRecords({ enrollments, submissions, roster });

  const spec = resolveGroupSpec({ groupSize: input.groupSize, groupCount: input.groupCount }, records.length);
  const opts: StrategyOpts = {
    metric: input.metric,
    weights: input.weights,
    weightedMode: input.weightedMode,
    majorBuckets: input.majorBuckets ?? loadMajorBuckets(input.courseId),
  };
  const { grouping, diagnostics } = optimize({
    records, spec, strategy: getStrategy(input.strategy), history: loadHistory(input.courseId),
    opts, seed: input.seed ?? 1,
  });

  const outDir = input.outputDir ?? join(process.env.CC_HOME ?? '.', 'groups', input.courseId, 'output');
  mkdirSync(outDir, { recursive: true });
  const csvPath = join(outDir, `groups-${input.strategy}.csv`);
  const markdownPath = join(outDir, `groups-${input.strategy}.md`);
  writeFileSync(csvPath, renderGroupsCsv(grouping, records), 'utf-8');
  writeFileSync(markdownPath, renderGroupsMarkdown(grouping, records, diagnostics), 'utf-8');

  const result: CreateGroupsResult = { grouping, diagnostics, csvPath, markdownPath };
  if (input.pushToCanvas) {
    result.canvasPush = await pushGroupsToCanvas(client, courseIdNum, input.canvasCategoryName ?? `${input.strategy} groups`, grouping);
  }
  return result; // NOTE: never appends history — that's record_groups
}

export function recordGroups(courseId: string, grouping: Grouping): string {
  return appendGrouping(courseId, grouping);
}
