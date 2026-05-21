import { analyzeCourse } from './analyze_course.js';
import { planNextSemester } from './plan_next_semester.js';
import { updateCourseMaterials } from './update_course_materials.js';
import type { AnalyzeCourseResult } from './analyze_course.js';
import type { PlanNextSemesterResult } from './plan_next_semester.js';
import type { UpdateCourseMaterialsResult } from './update_course_materials.js';

export interface FullPipelineInput {
  courseId: string;
  sourceSemesterId: string;
  newSemesterId: string;
  archivePath: string;
  source?: 'archive' | 'cds' | 'auto';
  semesterPattern?: string;
  calendarUrl?: string;
  manualDates?: Record<string, string>;
  onBreakCollision?: 'flag' | 'bump-before' | 'bump-after';
  sections?: string[];
  outputPath?: string;
}

export interface FullPipelineResult {
  courseId: string;
  newSemesterId: string;
  analyze: AnalyzeCourseResult;
  plan: PlanNextSemesterResult;
  update: UpdateCourseMaterialsResult;
  status: 'complete';
}

export async function fullPipeline(input: FullPipelineInput): Promise<FullPipelineResult> {
  const {
    courseId, sourceSemesterId, newSemesterId, archivePath,
    source, semesterPattern, calendarUrl, manualDates,
    onBreakCollision, sections, outputPath,
  } = input;

  const analyze = await analyzeCourse({ courseId, semesterId: sourceSemesterId, archivePath });
  const plan = await planNextSemester({ courseId, sourceSemesterId, newSemesterId, source, semesterPattern, calendarUrl, manualDates, onBreakCollision, sections });
  const update = await updateCourseMaterials({ courseId, semesterId: newSemesterId, outputPath, sections });

  return { courseId, newSemesterId, analyze, plan, update, status: 'complete' };
}
