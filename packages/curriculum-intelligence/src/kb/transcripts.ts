import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from './course_state.js';
import type { CourseId, SemesterId, Transcript } from '../types.js';

export function getTranscriptsJsonPath(courseId: CourseId, semesterId: SemesterId): string {
  return join(getSemesterPath(courseId, semesterId), 'transcripts.json');
}

export function loadTranscripts(courseId: CourseId, semesterId: SemesterId): Transcript[] {
  const path = getTranscriptsJsonPath(courseId, semesterId);
  if (!existsSync(path)) {
    throw new Error(
      `No transcripts.json found at ${path}. Run ingest_transcripts first.`
    );
  }
  const data = JSON.parse(readFileSync(path, 'utf-8')) as { transcripts: Transcript[] };
  return data.transcripts;
}
