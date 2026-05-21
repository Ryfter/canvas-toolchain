import { importPreviousShell } from 'curriculum-intelligence-mcp/dist/tools/import_previous_shell.js';
import { fetchAcademicCalendar } from 'curriculum-intelligence-mcp/dist/tools/fetch_academic_calendar.js';
import { shiftDates } from 'curriculum-intelligence-mcp/dist/tools/shift_dates.js';
import { generateRecommendedOutline } from 'curriculum-intelligence-mcp/dist/tools/generate_recommended_outline.js';

export interface PlanNextSemesterInput {
  courseId: string;
  sourceSemesterId: string;
  newSemesterId: string;
  source?: 'archive' | 'cds' | 'auto';
  semesterPattern?: string;
  calendarUrl?: string;
  manualDates?: Record<string, string>;
  onBreakCollision?: 'flag' | 'bump-before' | 'bump-after';
  sections?: string[];
}

export interface PlanNextSemesterResult {
  courseId: string;
  newSemesterId: string;
  shell: Awaited<ReturnType<typeof importPreviousShell>>;
  calendar: Awaited<ReturnType<typeof fetchAcademicCalendar>>;
  shift: Awaited<ReturnType<typeof shiftDates>>;
  outline: Awaited<ReturnType<typeof generateRecommendedOutline>>;
  status: 'complete';
}

export async function planNextSemester(input: PlanNextSemesterInput): Promise<PlanNextSemesterResult> {
  const {
    courseId, sourceSemesterId, newSemesterId,
    source = 'auto', semesterPattern, calendarUrl, manualDates,
    onBreakCollision = 'flag', sections,
  } = input;

  const shell = importPreviousShell({ courseId, sourceSemesterId, newSemesterId, source });

  const calendar = await fetchAcademicCalendar({
    courseId,
    semesterId: newSemesterId,
    ...(calendarUrl ? { url: calendarUrl } : {}),
    ...(semesterPattern ? { semesterPattern } : {}),
    ...(manualDates ? { manualDates } : {}),
  });

  const shift = shiftDates({
    courseId,
    semesterId: newSemesterId,
    onBreakCollision,
    ...(sections ? { sections: sections.map((s) => ({ sectionId: s })) } : {}),
  });

  const outline = generateRecommendedOutline({ courseId, semesterId: newSemesterId });

  return { courseId, newSemesterId, shell, calendar, shift, outline, status: 'complete' };
}
