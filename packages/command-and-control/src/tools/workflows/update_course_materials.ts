import { readdirSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { draftAssignmentBrief } from 'curriculum-intelligence-mcp/dist/tools/draft_assignment_brief.js';
import { updateExamples } from 'curriculum-intelligence-mcp/dist/tools/update_examples.js';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';
import type { UpdateCourseMaterialsResult } from '@canvas-toolchain/shared-types';
import { loadKb } from '../../lib/kb-bridge.js';

export type { UpdateCourseMaterialsResult } from '@canvas-toolchain/shared-types';

function getNextPlanDir(courseId: string, semesterId: string): string {
  const home = process.env.CURRICULUM_INTELLIGENCE_HOME ?? join(homedir(), '.curriculum-intelligence');
  return join(home, 'courses', courseId, 'semesters', semesterId, 'next-plan');
}

function getBriefPaths(courseId: string, semesterId: string): string[] {
  const nextPlanDir = getNextPlanDir(courseId, semesterId);
  if (!existsSync(nextPlanDir)) return [];
  const paths: string[] = [];
  for (const entry of readdirSync(nextPlanDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('week-')) continue;
    const weekDir = join(nextPlanDir, entry.name);
    for (const file of readdirSync(weekDir)) {
      if (file.endsWith('.md')) paths.push(join(weekDir, file));
    }
  }
  return paths;
}

export interface UpdateCourseMaterialsInput {
  courseId: string;
  semesterId: string;
  outputPath?: string;
  sections?: string[];
}

export async function updateCourseMaterials(input: UpdateCourseMaterialsInput): Promise<UpdateCourseMaterialsResult> {
  const { courseId, semesterId, outputPath, sections } = input;

  const kb = loadKb();
  const philosophyKb = kb.philosophyKb() ?? undefined;
  const studentPersonas = kb.studentPersonas() ?? undefined;
  const context = philosophyKb || studentPersonas ? { philosophyKb, studentPersonas } : undefined;

  const briefPaths = getBriefPaths(courseId, semesterId);

  for (const briefPath of briefPaths) {
    await draftAssignmentBrief({ courseId, semesterId, briefPath });
    updateExamples({ courseId, semesterId, briefPath });
  }

  const exportResult = exportCourseFolder({
    courseId,
    semesterId,
    ...(outputPath ? { outputPath } : {}),
    ...(sections ? { sections } : {}),
  });

  const pages: UpdateCourseMaterialsResult['pages'] = briefPaths.map((briefPath) => ({
    assignmentName: assignmentNameFromPath(briefPath),
    verdict: 'UPDATE' as const,
    templateUsed: { id: 'not-selected', version: '0.0.0' },
    themeUsed: { id: 'not-selected', version: '0.0.0' },
    promptSetUsed: { id: 'not-selected', version: '0.0.0' },
    htmlPath: '',
    status: 'skipped' as const,
    needsReviewReasons: ['HTML rendering is pending full update_course_materials orchestration.'],
  }));

  return {
    courseId,
    semesterId,
    pages,
    droppedAssignments: [],
    export: { exportPath: exportPathFromResult(exportResult, outputPath) },
    summary: {
      totalAssignments: pages.length,
      cleanCount: pages.filter((page) => page.status === 'clean').length,
      needsReviewCount: pages.filter((page) => page.status === 'needs-review').length,
      droppedCount: 0,
      skippedCount: pages.filter((page) => page.status === 'skipped').length,
    },
    status: 'complete',
  };
}

function assignmentNameFromPath(briefPath: string): string {
  const fileName = basename(briefPath);
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function exportPathFromResult(
  exportResult: Awaited<ReturnType<typeof exportCourseFolder>>,
  requestedOutputPath: string | undefined,
): string {
  if (
    exportResult &&
    typeof exportResult === 'object' &&
    'outputPaths' in exportResult &&
    Array.isArray(exportResult.outputPaths) &&
    typeof exportResult.outputPaths[0] === 'string'
  ) {
    return exportResult.outputPaths[0];
  }

  return requestedOutputPath ?? '';
}
