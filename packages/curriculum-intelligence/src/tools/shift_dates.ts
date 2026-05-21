import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCalendar, loadPlanConfig, getNextPlanPath } from '../kb/next_plan.js';
import { loadTopicMap } from '../kb/topic_map.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import { inferCalendarFromPattern } from '../parsers/academic_calendar.js';
import type { CourseId, SemesterId, BreakCollision, SectionCalendarOverride, SemesterCalendar } from '../types.js';

export interface ShiftDatesInput {
  courseId: CourseId;
  semesterId: SemesterId;
  onBreakCollision: BreakCollision;
  sections?: SectionCalendarOverride[];
}

export interface ShiftDatesResult {
  courseId: CourseId;
  semesterId: SemesterId;
  shiftsApplied: number;
  collisions: number;
  shiftedPaths: string[];
}

/** Parse any ISO date/datetime string to a UTC midnight Date using only the date portion. */
function parseIsoDate(iso: string): Date {
  return new Date(iso.slice(0, 10) + 'T00:00:00Z');
}

function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / 86400000);
}

function isOnBreak(iso: string, cal: SemesterCalendar): boolean {
  return cal.breaks.some((b) => iso >= b.start && iso <= b.end);
}

function resolveCollision(iso: string, cal: SemesterCalendar, mode: BreakCollision): string {
  if (mode === 'bump-after') {
    let d = iso;
    while (isOnBreak(d, cal)) d = addDays(d, 1);
    return d;
  }
  if (mode === 'bump-before') {
    let d = iso;
    while (isOnBreak(d, cal)) d = addDays(d, -1);
    return d;
  }
  return iso;
}

function computeTargetDate(
  originalDue: string,
  sourceStart: string,
  targetCal: SemesterCalendar,
  mode: BreakCollision
): { due: string; collision: boolean } {
  const offset = daysBetween(sourceStart, originalDue);
  const raw = addDays(targetCal.classesBegin, offset);
  const collision = isOnBreak(raw, targetCal);
  const due = collision ? resolveCollision(raw, targetCal, mode) : raw;
  return { due, collision: collision && mode === 'flag' };
}

export function shiftDates(input: ShiftDatesInput): ShiftDatesResult {
  const { courseId, semesterId, onBreakCollision } = input;
  const planConfig = loadPlanConfig(courseId, semesterId);
  const targetCal = loadCalendar(courseId, semesterId);
  const sourceTopicMap = loadTopicMap(courseId, planConfig.sourceSemesterId);
  // termStart may be a full ISO datetime; slice to date portion. When absent, infer from the
  // semester ID string (e.g. "Spring2026") so we never pass a non-date string to parseIsoDate.
  const rawStart = sourceTopicMap.course.termStart;
  const sourceStart: string = rawStart
    ? rawStart.slice(0, 10)
    : inferCalendarFromPattern(planConfig.sourceSemesterId).classesBegin;

  const shiftedPaths: string[] = [];
  let shiftsApplied = 0;
  let collisions = 0;

  const nextPlanDir = getNextPlanPath(courseId, semesterId);
  for (const weekEntry of readdirSync(nextPlanDir, { withFileTypes: true })) {
    if (!weekEntry.isDirectory() || !weekEntry.name.startsWith('week-')) continue;
    const weekDir = join(nextPlanDir, weekEntry.name);
    for (const file of readdirSync(weekDir)) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(weekDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const { data, body } = parseBriefFile(content);
      const originalDue = data['originalDue'] as string | undefined;
      if (!originalDue) continue;

      if (input.sections && input.sections.length > 0) {
        const dueSections: Record<string, string> = {};
        for (const sec of input.sections) {
          const secCal: SemesterCalendar = { ...targetCal, ...(sec.calendarOverrides ?? {}) };
          const { due } = computeTargetDate(originalDue, sourceStart, secCal, onBreakCollision);
          dueSections[sec.sectionId] = due;
        }
        data['due'] = Object.values(dueSections)[0] ?? 'TBD';
        data['due_sections'] = dueSections;
      } else {
        const { due, collision } = computeTargetDate(originalDue, sourceStart, targetCal, onBreakCollision);
        data['due'] = due;
        if (collision) {
          data['break_collision'] = true;
          collisions++;
        }
      }

      writeFileSync(filePath, serializeBriefFile(data, body), 'utf-8');
      shiftedPaths.push(filePath);
      shiftsApplied++;
    }
  }

  return { courseId, semesterId, shiftsApplied, collisions, shiftedPaths };
}
