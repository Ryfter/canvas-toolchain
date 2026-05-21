import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { draftAssignmentBrief } from 'curriculum-intelligence-mcp/dist/tools/draft_assignment_brief.js';
import { updateExamples } from 'curriculum-intelligence-mcp/dist/tools/update_examples.js';
import { exportCourseFolder } from 'curriculum-intelligence-mcp/dist/tools/export_course_folder.js';

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

export interface UpdateCourseMaterialsResult {
  courseId: string;
  semesterId: string;
  draftsCompleted: number;
  export: Awaited<ReturnType<typeof exportCourseFolder>>;
  status: 'complete';
}

export async function updateCourseMaterials(input: UpdateCourseMaterialsInput): Promise<UpdateCourseMaterialsResult> {
  const { courseId, semesterId, outputPath, sections } = input;

  const briefPaths = getBriefPaths(courseId, semesterId);

  let draftsCompleted = 0;
  for (const briefPath of briefPaths) {
    await draftAssignmentBrief({ courseId, semesterId, briefPath });
    updateExamples({ courseId, semesterId, briefPath });
    draftsCompleted++;
  }

  const exportResult = exportCourseFolder({
    courseId,
    semesterId,
    ...(outputPath ? { outputPath } : {}),
    ...(sections ? { sections } : {}),
  });

  return { courseId, semesterId, draftsCompleted, export: exportResult, status: 'complete' };
}
