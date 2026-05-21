import { join } from 'node:path';
import { saveCalendar, getNextPlanPath } from '../kb/next_plan.js';
import { parseCalendarHtml, inferCalendarFromPattern } from '../parsers/academic_calendar.js';
import type { CourseId, SemesterId, BreakRange, SemesterCalendar } from '../types.js';

type HtmlFetcher = (url: string) => Promise<string>;

export interface FetchAcademicCalendarInput {
  courseId: CourseId;
  semesterId: SemesterId;
  url?: string;
  startDate?: string;
  endDate?: string;
  breaks?: BreakRange[];
  semesterPattern?: string;
  htmlFetcher?: HtmlFetcher;
}

export interface FetchAcademicCalendarResult {
  courseId: CourseId;
  semesterId: SemesterId;
  calendarPath: string;
  partial: boolean;
  missing?: string[];
}

async function defaultFetcher(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

export async function fetchAcademicCalendar(
  input: FetchAcademicCalendarInput
): Promise<FetchAcademicCalendarResult> {
  const { courseId, semesterId } = input;
  const fetcher = input.htmlFetcher ?? defaultFetcher;
  let cal: SemesterCalendar;

  if (input.url) {
    const html = await fetcher(input.url);
    cal = parseCalendarHtml(html, semesterId);
    if (input.startDate) { cal.classesBegin = input.startDate; cal.partial = false; }
    if (input.endDate) { cal.classesEnd = input.endDate; }
    if (input.breaks) cal.breaks = [...cal.breaks, ...input.breaks];
  } else if (input.startDate || input.endDate) {
    cal = {
      semesterId,
      classesBegin: input.startDate ?? '',
      classesEnd: input.endDate ?? '',
      breaks: input.breaks ?? [],
      source: 'manual',
      partial: !input.startDate || !input.endDate,
      ...(!input.startDate || !input.endDate
        ? { missing: [...(!input.startDate ? ['classesBegin'] : []), ...(!input.endDate ? ['classesEnd'] : [])] }
        : {}),
    };
  } else if (input.semesterPattern) {
    cal = inferCalendarFromPattern(input.semesterPattern);
    cal.semesterId = semesterId;
    if (input.breaks) cal.breaks = [...cal.breaks, ...input.breaks];
  } else {
    throw new Error('fetch_academic_calendar: provide url, startDate/endDate, or semesterPattern.');
  }

  saveCalendar(courseId, semesterId, cal);
  const calendarPath = join(getNextPlanPath(courseId, semesterId), 'calendar.json');
  return { courseId, semesterId, calendarPath, partial: cal.partial, ...(cal.missing ? { missing: cal.missing } : {}) };
}
