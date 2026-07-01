import { existsSync, readFileSync } from 'node:fs';
import { resolve, join, dirname, relative, sep, isAbsolute } from 'node:path';
import { generateCanvasPage, type GenerateInput } from './generate.js';
import type { InstitutionConfig } from '../types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CourseInfo {
  institution: string;
  professor: string;
  courseNumber: string;
  courseName: string;
  assignmentNumber: string;
  semester: string;
}

export interface IngestAssignmentFolderInput {
  folderPath?: string;   // relative to CWD; defaults to "ingest"
}

export interface IngestAssignmentFolderResult {
  html: string;
  filename: string;
  heroImagePrompt?: string;
  courseInfo: CourseInfo;
  sources: {
    brief: string;
    rubric?: string;
    shell?: string;
    styleNotes?: string;
    sourceMap: {
      courseConfig: string;
      brief: string;
      rubric?: string;
      shell?: string;
      styleNotes?: string;
    };
  };
  warnings: string[];
}

// ─── Course config field mapping ─────────────────────────────────────────────

const FIELD_MAP: Record<string, keyof CourseInfo> = {
  'institution': 'institution',
  'professor': 'professor',
  'course number': 'courseNumber',
  'course name': 'courseName',
  'assignment number': 'assignmentNumber',
  'semester': 'semester',
};

const REQUIRED_FIELDS: (keyof CourseInfo)[] = [
  'institution', 'professor', 'courseNumber', 'courseName', 'assignmentNumber', 'semester',
];

// ─── Pure functions: parsing and validation ───────────────────────────────────

export function parseCourseConfig(content: string): Partial<CourseInfo> {
  const result: Partial<CourseInfo> = {};
  for (const line of content.split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (!value) continue;
    const field = FIELD_MAP[key];
    if (field) result[field] = value;
  }
  return result;
}

export function validateCourseInfo(info: CourseInfo): string[] {
  const errors: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = info[field];
    if (!value) {
      errors.push(`Missing required field: ${field}`);
    } else if (/^\[.+\]$/.test(value)) {
      errors.push(`Placeholder not filled in: ${field} = "${value}"`);
    }
  }
  return errors;
}

// ─── Walk helpers ─────────────────────────────────────────────────────────────

function getWalkRoot(absoluteFolderPath: string): string {
  const rel = relative(process.cwd(), absoluteFolderPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path is outside the project directory: ${absoluteFolderPath}`);
  }
  const firstSegment = rel.split(sep)[0];
  return resolve(process.cwd(), firstSegment);
}

function walkDirs(fromDir: string, rootDir: string): string[] {
  const dirs: string[] = [];
  let current = resolve(fromDir);
  const root = resolve(rootDir);
  while (true) {
    dirs.push(current);
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

// ─── File discovery ────────────────────────────────────────────────────────────

function resolveFolderPath(folderPath: string): string {
  const resolved = resolve(folderPath);
  const rel = relative(process.cwd(), resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Folder path must be within the project directory: ${folderPath}`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`Folder not found: ${folderPath}`);
  }
  return resolved;
}

function findBrief(folderPath: string): { content: string; resolvedPath: string } {
  const filePath = join(folderPath, 'assignment-brief.md');
  if (!existsSync(filePath)) {
    throw new Error(
      `assignment-brief.md not found in ${relative(process.cwd(), folderPath)}. ` +
      `This file is required and must be in the target folder (it is not inherited).`,
    );
  }
  return {
    content: readFileSync(filePath, 'utf-8'),
    resolvedPath: relative(process.cwd(), filePath),
  };
}

export function findFileWithInheritance(
  filename: string,
  folderPath: string,
): { content: string; resolvedPath: string } | null {
  const root = getWalkRoot(folderPath);
  const dirs = walkDirs(folderPath, root);
  for (const dir of dirs) {
    const filePath = join(dir, filename);
    if (existsSync(filePath)) {
      return {
        content: readFileSync(filePath, 'utf-8'),
        resolvedPath: relative(process.cwd(), filePath),
      };
    }
  }
  return null;
}

function findStyleNotes(folderPath: string): { content: string; resolvedPath: string } | null {
  const filePath = join(folderPath, 'style-notes.md');
  if (!existsSync(filePath)) return null;
  return {
    content: readFileSync(filePath, 'utf-8'),
    resolvedPath: relative(process.cwd(), filePath),
  };
}

export function findCourseConfig(
  folderPath: string,
): { merged: Partial<CourseInfo>; resolvedPath: string } {
  const root = getWalkRoot(folderPath);
  const dirs = walkDirs(folderPath, root);
  const configs: Array<{ path: string; parsed: Partial<CourseInfo> }> = [];

  for (const dir of dirs) {
    const filePath = join(dir, 'course-config.md');
    if (existsSync(filePath)) {
      configs.push({
        path: relative(process.cwd(), filePath),
        parsed: parseCourseConfig(readFileSync(filePath, 'utf-8')),
      });
    }
  }

  if (configs.length === 0) {
    throw new Error(
      `course-config.md not found anywhere in the folder tree from ` +
      `${relative(process.cwd(), folderPath)}`,
    );
  }

  // Merge: closest (first in array, lowest in tree) wins on each field
  const merged: Partial<CourseInfo> = {};
  for (const cfg of configs) {
    for (const [key, value] of Object.entries(cfg.parsed) as [keyof CourseInfo, string][]) {
      if (!(key in merged) && value) merged[key] = value;
    }
  }

  return { merged, resolvedPath: configs[0].path };
}

// ─── Main exported function ───────────────────────────────────────────────────

export async function ingestAssignmentFolder(
  input: IngestAssignmentFolderInput,
  config: InstitutionConfig,
): Promise<IngestAssignmentFolderResult> {
  const raw = input.folderPath?.trim();
  const folderPath = resolveFolderPath(raw && raw.length > 0 ? raw : 'ingest');

  // Discover files — brief is required, others are optional or inherited
  const brief = findBrief(folderPath);
  const rubricResult = findFileWithInheritance('rubric.md', folderPath);
  const shellResult = findFileWithInheritance('shell.md', folderPath);
  const styleNotesResult = findStyleNotes(folderPath);
  const courseConfigResult = findCourseConfig(folderPath);

  // Validate merged course config — throws descriptive error if invalid
  const configErrors = validateCourseInfo(courseConfigResult.merged as CourseInfo);
  if (configErrors.length > 0) {
    throw new Error(
      `Course config errors in ${courseConfigResult.resolvedPath}:\n` +
      `${configErrors.map(e => `  • ${e}`).join('\n')}`,
    );
  }
  // validateCourseInfo guarantees all fields are populated and non-placeholder
  const courseInfo = courseConfigResult.merged as CourseInfo;

  // Assemble sources object
  const sources: IngestAssignmentFolderResult['sources'] = {
    brief: brief.content,
    rubric: rubricResult?.content,
    shell: shellResult?.content,
    styleNotes: styleNotesResult?.content,
    sourceMap: {
      courseConfig: courseConfigResult.resolvedPath,
      brief: brief.resolvedPath,
      rubric: rubricResult?.resolvedPath,
      shell: shellResult?.resolvedPath,
      styleNotes: styleNotesResult?.resolvedPath,
    },
  };

  // Combine style-notes with shell as generation context.
  // Note: generateCanvasPage() currently does not use styleNotes in HTML output —
  // it is passed for forward compatibility. The shell's primary value is being
  // returned in sources.shell for Claude to use when reviewing the generated page.
  const combinedStyleNotes = [
    sources.styleNotes,
    sources.shell
      ? `Existing page structure (use as a guide):\n\n${sources.shell}`
      : null,
  ].filter(Boolean).join('\n\n') || undefined;

  const generateInput: GenerateInput = {
    assignmentBrief: sources.brief,
    courseName: courseInfo.courseName,
    courseNumber: courseInfo.courseNumber,
    assignmentNumber: courseInfo.assignmentNumber,
    professorName: courseInfo.professor,
    semester: courseInfo.semester,
    styleNotes: combinedStyleNotes,
  };

  const generated = await generateCanvasPage(generateInput, config);

  // Carry forward generation warnings and add any brief-level warnings
  const warnings = [...generated.warnings];
  if (/\[[A-Z ]{3,}\]/.test(sources.brief)) {
    warnings.push('assignment-brief.md contains unfilled placeholder text — review before publishing');
  }

  return {
    html: generated.html,
    filename: generated.filename,
    heroImagePrompt: generated.heroImagePrompt,
    courseInfo,
    sources,
    warnings,
  };
}
