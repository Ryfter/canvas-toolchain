import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCoursePath } from '../kb/course_state.js';
import { getNextPlanPath } from '../kb/next_plan.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import type { CourseId, SemesterId } from '../types.js';

const CI_FIELDS = new Set([
  'verdict', 'currency', 'lastTaught', 'semestersSince', 'newsHits',
  'staleness', 'replacement_recommended', 'originalDue', 'break_collision',
]);

export interface ExportCourseFolderInput {
  courseId: CourseId;
  semesterId: SemesterId;
  outputPath?: string;
  sections?: string[];
  /**
   * When true, writes a planning-manifest.json sidecar at the root of each output folder
   * preserving CI analysis fields (verdict, currency, newsHits, etc.) that are stripped
   * from the YAML front matter for Design Studio compatibility.
   *
   * The sidecar enables lossless CI → CDS → CI roundtripping. Design Studio ignores it.
   * See docs/architecture-review-followups.md P2 for context.
   */
  preserveCiMetadata?: boolean;
}

export interface ExportCourseFolderResult {
  courseId: CourseId;
  semesterId: SemesterId;
  outputPaths: string[];
  sectionCount: number;
  /** Paths to planning-manifest.json sidecars. Present only when preserveCiMetadata was true. */
  planningManifestPaths?: string[];
}

interface PlanningManifest {
  courseId: string;
  semesterId: string;
  exportedAt: string;
  briefs: Record<string, Record<string, unknown>>;
}

function extractCiFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => CI_FIELDS.has(k)));
}

function stripCiFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !CI_FIELDS.has(k)));
}

function exportToDir(
  nextPlanDir: string,
  outputDir: string,
  courseId: string,
  semesterId: string,
  sectionId?: string,
  preserveCiMetadata?: boolean
): string | undefined {
  mkdirSync(outputDir, { recursive: true });

  const configData: Record<string, unknown> = { courseId, semester: semesterId };
  if (sectionId) configData['section'] = sectionId;
  writeFileSync(join(outputDir, 'course-config.md'), serializeBriefFile(configData, ''), 'utf-8');

  const manifest: PlanningManifest = {
    courseId,
    semesterId,
    exportedAt: new Date().toISOString(),
    briefs: {},
  };

  for (const entry of readdirSync(nextPlanDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('week-')) continue;
    const srcWeekDir = join(nextPlanDir, entry.name);
    const dstWeekDir = join(outputDir, entry.name);
    mkdirSync(dstWeekDir, { recursive: true });
    for (const file of readdirSync(srcWeekDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(srcWeekDir, file), 'utf-8');
      const { data, body } = parseBriefFile(content);

      // Preserve CI analysis fields in the sidecar before stripping from YAML.
      if (preserveCiMetadata) {
        const ciData = extractCiFields(data);
        if (Object.keys(ciData).length > 0) {
          manifest.briefs[`${entry.name}/${file}`] = ciData;
        }
      }

      const cdsData = stripCiFields(data);
      if (sectionId && data['due_sections']) {
        const sections = data['due_sections'] as Record<string, string>;
        if (sections[sectionId]) cdsData['due'] = sections[sectionId];
        delete cdsData['due_sections'];
      }
      writeFileSync(join(dstWeekDir, file), serializeBriefFile(cdsData, body), 'utf-8');
    }
  }

  if (preserveCiMetadata) {
    const manifestPath = join(outputDir, 'planning-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    return manifestPath;
  }
  return undefined;
}

export function exportCourseFolder(input: ExportCourseFolderInput): ExportCourseFolderResult {
  const { courseId, semesterId } = input;
  const defaultOutputBase = join(getCoursePath(courseId), 'export', semesterId);
  const outputBase = input.outputPath ?? defaultOutputBase;
  const nextPlanDir = getNextPlanPath(courseId, semesterId);
  const sections = input.sections ?? [];
  const outputPaths: string[] = [];
  const planningManifestPaths: string[] = [];

  if (sections.length > 1) {
    for (const sectionId of sections) {
      const outputDir = join(outputBase, `${semesterId}-${sectionId}`);
      const manifestPath = exportToDir(nextPlanDir, outputDir, courseId, semesterId, sectionId, input.preserveCiMetadata);
      outputPaths.push(outputDir);
      if (manifestPath) planningManifestPaths.push(manifestPath);
    }
  } else {
    const sectionId = sections[0];
    const manifestPath = exportToDir(nextPlanDir, outputBase, courseId, semesterId, sectionId, input.preserveCiMetadata);
    outputPaths.push(outputBase);
    if (manifestPath) planningManifestPaths.push(manifestPath);
  }

  return {
    courseId,
    semesterId,
    outputPaths,
    sectionCount: Math.max(1, sections.length),
    ...(planningManifestPaths.length > 0 ? { planningManifestPaths } : {}),
  };
}
