import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from '../kb/course_state.js';
import { loadTopicMap } from '../kb/topic_map.js';
import { loadTranscripts } from '../kb/transcripts.js';
import type { CourseId, SemesterId } from '../types.js';

export interface MapTranscriptsToWeeksInput {
  courseId: CourseId;
  semesterId: SemesterId;
}

export type MatchedBy = 'weekHint' | 'dateHint' | 'unmatched';

export interface WeekMapping {
  transcriptId: string;
  filename: string;
  week: number | null;
  matchedBy: MatchedBy;
  reason: string;
}

export interface MapTranscriptsToWeeksResult {
  courseId: CourseId;
  semesterId: SemesterId;
  mappings: WeekMapping[];
  unmatched: WeekMapping[];
  weekMapPath: string;
}

export function mapTranscriptsToWeeks(
  input: MapTranscriptsToWeeksInput
): MapTranscriptsToWeeksResult {
  const transcripts = loadTranscripts(input.courseId, input.semesterId);
  const map = loadTopicMap(input.courseId, input.semesterId);
  const termStart = map.course.termStart ? new Date(map.course.termStart) : null;

  const mappings: WeekMapping[] = transcripts.map((t) => {
    if (t.weekHint != null) {
      return {
        transcriptId: t.id,
        filename: t.filename,
        week: t.weekHint,
        matchedBy: 'weekHint',
        reason: `Filename contained a week number (${t.weekHint}).`,
      };
    }
    if (t.dateHint && termStart) {
      const dt = new Date(t.dateHint);
      const diffDays = Math.floor((dt.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0) {
        const week = Math.floor(diffDays / 7) + 1;
        return {
          transcriptId: t.id,
          filename: t.filename,
          week,
          matchedBy: 'dateHint',
          reason: `Filename date ${t.dateHint} is ${diffDays} days after term start (${map.course.termStart}).`,
        };
      }
    }
    return {
      transcriptId: t.id,
      filename: t.filename,
      week: null,
      matchedBy: 'unmatched',
      reason: 'No week hint in filename and no usable date hint vs. term start.',
    };
  });

  const unmatched = mappings.filter((m) => m.matchedBy === 'unmatched');
  const weekMapPath = join(getSemesterPath(input.courseId, input.semesterId), 'week-map.json');
  writeFileSync(weekMapPath, JSON.stringify({ mappings }, null, 2), 'utf-8');

  return {
    courseId: input.courseId,
    semesterId: input.semesterId,
    mappings,
    unmatched,
    weekMapPath,
  };
}
