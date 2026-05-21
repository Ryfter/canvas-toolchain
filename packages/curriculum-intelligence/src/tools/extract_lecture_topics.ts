import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from '../kb/course_state.js';
import { loadTranscripts } from '../kb/transcripts.js';
import type { CourseId, SemesterId, TranscriptSource } from '../types.js';

export interface ExtractLectureTopicsInput {
  courseId: CourseId;
  semesterId: SemesterId;
  week?: number;                    // optional filter
  transcriptId?: string;            // optional filter
  maxTextChars?: number;            // truncate fullText if it would be too large for the caller
}

export interface LectureChunk {
  transcriptId: string;
  filename: string;
  week: number | null;
  source: TranscriptSource;
  durationSec: number | null;
  fullText: string;
  truncated: boolean;
}

export interface ExtractLectureTopicsResult {
  courseId: CourseId;
  semesterId: SemesterId;
  lectures: LectureChunk[];
}

export function extractLectureTopics(
  input: ExtractLectureTopicsInput
): ExtractLectureTopicsResult {
  const transcripts = loadTranscripts(input.courseId, input.semesterId);

  // Load week map if present so we can attach week numbers.
  const weekMapPath = join(getSemesterPath(input.courseId, input.semesterId), 'week-map.json');
  const weekByTranscript = new Map<string, number | null>();
  if (existsSync(weekMapPath)) {
    const data = JSON.parse(readFileSync(weekMapPath, 'utf-8')) as {
      mappings: { transcriptId: string; week: number | null }[];
    };
    for (const m of data.mappings) {
      weekByTranscript.set(m.transcriptId, m.week);
    }
  }

  const max = input.maxTextChars ?? 50_000;

  let chunks: LectureChunk[] = transcripts.map((t) => {
    const week = weekByTranscript.get(t.id) ?? t.weekHint;
    const truncated = t.fullText.length > max;
    return {
      transcriptId: t.id,
      filename: t.filename,
      week,
      source: t.source,
      durationSec: t.durationSec,
      fullText: truncated ? t.fullText.slice(0, max) + '…' : t.fullText,
      truncated,
    };
  });

  if (input.week !== undefined) {
    chunks = chunks.filter((c) => c.week === input.week);
  }
  if (input.transcriptId) {
    chunks = chunks.filter((c) => c.transcriptId === input.transcriptId);
  }

  return {
    courseId: input.courseId,
    semesterId: input.semesterId,
    lectures: chunks,
  };
}
