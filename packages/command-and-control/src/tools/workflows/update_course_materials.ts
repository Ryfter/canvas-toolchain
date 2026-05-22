import { readdirSync, existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';
import type {
  UpdateCourseMaterialsResult,
  UpdateCourseMaterialsPage,
  PendingTemplateSelection,
  Verdict,
} from '@canvas-toolchain/shared-types';
import { loadKb } from '../../lib/kb-bridge.js';
import { resolveResources } from '../../lib/verdict-template-resolver.js';
import type { TemplatePreferences } from '../../lib/verdict-template-resolver.js';
import { renderPageWithA11y } from '../../lib/page-renderer.js';

export type { UpdateCourseMaterialsResult } from '@canvas-toolchain/shared-types';

export interface UpdateCourseMaterialsInput {
  courseId: string;
  semesterId: string;
  outputPath?: string;
  sections?: string[];
  /** 'auto' resolves templates by verdict and renders immediately.
   *  'review' returns pendingSelections on the first call; pass selections on re-invoke to render.
   *  Default: 'auto'. */
  mode?: 'auto' | 'review';
  /** Course-level template preferences: per-family overrides, per-assignment overrides, theme/prompt-set. */
  prefs?: TemplatePreferences;
  /** Provided on the second call in review mode — one entry per assignment to render. */
  selections?: Array<{ assignmentName: string; templateId: string; templateVersion: string }>;
}

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

export async function updateCourseMaterials(input: UpdateCourseMaterialsInput): Promise<UpdateCourseMaterialsResult> {
  const { courseId, semesterId, outputPath, sections, mode = 'auto', prefs = {}, selections } = input;

  const kb = loadKb();

  // Build verdict map from the most recent trajectory entry
  const trajectoryEntries = kb.courseTrajectory(courseId);
  const latestEntry = trajectoryEntries?.[trajectoryEntries.length - 1] ?? null;
  const verdictMap = new Map<string, Verdict>();
  if (latestEntry?.perAssignment) {
    for (const pa of latestEntry.perAssignment) {
      verdictMap.set(pa.topic, pa.verdict);
    }
  }

  const briefPaths = getBriefPaths(courseId, semesterId);

  // Review mode, first call: return pending template selections for user confirmation
  if (mode === 'review' && !selections) {
    const pendingSelections: PendingTemplateSelection[] = [];
    for (const briefPath of briefPaths) {
      const assignmentName = assignmentNameFromPath(briefPath);
      const verdict = verdictMap.get(assignmentName) ?? 'KEEP';
      if (verdict === 'DROP') continue;
      const resolved = resolveResources(verdict, assignmentName, prefs);
      if (!resolved) continue;
      pendingSelections.push({
        assignmentName,
        verdict,
        candidates: [
          {
            templateId: resolved.templateId,
            templateVersion: resolved.templateVersion,
            reason: 'Resolved by registry or cds-defaults fallback',
          },
        ],
      });
    }
    return {
      courseId,
      semesterId,
      pendingSelections,
      pages: [],
      droppedAssignments: [],
      export: { exportPath: '' },
      summary: {
        totalAssignments: briefPaths.length,
        cleanCount: 0,
        needsReviewCount: 0,
        droppedCount: 0,
        skippedCount: 0,
      },
      status: 'pending-selections',
    };
  }

  // Build override map for review mode second call
  const selectionMap = new Map<string, { templateId: string; templateVersion: string }>();
  if (selections) {
    for (const s of selections) {
      selectionMap.set(s.assignmentName, { templateId: s.templateId, templateVersion: s.templateVersion });
    }
  }

  const courseDesignFolder = kb.courseDesignFolder(courseId);
  const pages: UpdateCourseMaterialsPage[] = [];
  const droppedAssignments: Array<{ name: string; rationale: string }> = [];

  for (const briefPath of briefPaths) {
    const assignmentName = assignmentNameFromPath(briefPath);
    const verdict = verdictMap.get(assignmentName) ?? 'KEEP';

    if (verdict === 'DROP') {
      droppedAssignments.push({ name: assignmentName, rationale: 'Marked DROP in trajectory log' });
      continue;
    }

    const resolved = resolveResources(verdict, assignmentName, prefs);
    if (!resolved) {
      droppedAssignments.push({ name: assignmentName, rationale: 'Unable to resolve template resources' });
      continue;
    }

    // Apply selection override from review mode second call
    const selectionOverride = selectionMap.get(assignmentName);
    const finalResolved = selectionOverride
      ? { ...resolved, templateId: selectionOverride.templateId, templateVersion: selectionOverride.templateVersion }
      : resolved;

    try {
      const page = renderPageWithA11y({
        briefPath,
        assignmentName,
        verdict,
        resolved: finalResolved,
        outputDir: outputPath,
        courseDir: courseDesignFolder ?? undefined,
      });
      pages.push(page);
    } catch (err) {
      pages.push({
        assignmentName,
        verdict,
        templateUsed: { id: finalResolved.templateId, version: finalResolved.templateVersion },
        themeUsed: { id: finalResolved.themeId, version: finalResolved.themeVersion },
        promptSetUsed: { id: finalResolved.promptSetId, version: finalResolved.promptSetVersion },
        htmlPath: '',
        status: 'skipped',
        needsReviewReasons: [`Render error: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
  }

  const exportResult = exportCourseFolder({
    courseId,
    semesterId,
    ...(outputPath ? { outputPath } : {}),
    ...(sections ? { sections } : {}),
  });

  return {
    courseId,
    semesterId,
    pages,
    droppedAssignments,
    export: { exportPath: exportPathFromResult(exportResult, outputPath) },
    summary: {
      totalAssignments: briefPaths.length,
      cleanCount: pages.filter((p) => p.status === 'clean').length,
      needsReviewCount: pages.filter((p) => p.status === 'needs-review').length,
      droppedCount: droppedAssignments.length,
      skippedCount: pages.filter((p) => p.status === 'skipped').length,
    },
    status: 'complete',
  };
}
