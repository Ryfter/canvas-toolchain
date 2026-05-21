import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseVtt } from '../parsers/transcript_vtt.js';
import { parseSrt } from '../parsers/transcript_srt.js';
import {
  ensureSemesterFolders,
  loadCourseConfig,
  saveCourseConfig,
} from '../kb/course_state.js';
import type {
  CourseId,
  SemesterId,
  Transcript,
  TranscriptCue,
  TranscriptSource,
} from '../types.js';

export interface IngestTranscriptsInput {
  courseId: CourseId;
  semesterId: SemesterId;
  transcriptsPath: string;
  source?: TranscriptSource;     // overrides per-file filename detection
  copy?: boolean;                 // if true, copy source files into the semester folder
}

export interface IngestTranscriptsResult {
  courseId: CourseId;
  semesterId: SemesterId;
  transcriptCount: number;
  transcriptsJsonPath: string;
  copiedTo: string | null;
}

const SUPPORTED_EXTS = new Set(['.vtt', '.srt', '.md']);

export function ingestTranscripts(
  input: IngestTranscriptsInput
): IngestTranscriptsResult {
  if (!existsSync(input.transcriptsPath)) {
    throw new Error(`Transcripts folder not found: ${input.transcriptsPath}`);
  }
  const config = loadCourseConfig(input.courseId);

  const files = readdirSync(input.transcriptsPath)
    .filter((f) => SUPPORTED_EXTS.has(extname(f).toLowerCase()))
    .sort();

  const transcripts: Transcript[] = [];
  for (const file of files) {
    const fullPath = join(input.transcriptsPath, file);
    const content = readFileSync(fullPath, 'utf-8');
    transcripts.push(buildTranscript(file, content, input.source));
  }

  const semDir = ensureSemesterFolders(input.courseId, input.semesterId);
  const jsonPath = join(semDir, 'transcripts.json');
  writeFileSync(jsonPath, JSON.stringify({ transcripts }, null, 2), 'utf-8');

  let copiedTo: string | null = null;
  if (input.copy) {
    copiedTo = join(semDir, 'transcripts');
    mkdirSync(copiedTo, { recursive: true });
    for (const file of files) {
      copyFileSync(join(input.transcriptsPath, file), join(copiedTo, file));
    }
  }

  // Update semester record.
  const now = new Date().toISOString();
  const sem = config.semesters.find((s) => s.id === input.semesterId);
  if (sem) {
    sem.lastTranscriptsIngestedAt = now;
  } else {
    config.semesters.push({
      id: input.semesterId,
      registeredAt: now,
      lastTranscriptsIngestedAt: now,
    });
  }
  saveCourseConfig(config);

  return {
    courseId: input.courseId,
    semesterId: input.semesterId,
    transcriptCount: transcripts.length,
    transcriptsJsonPath: jsonPath,
    copiedTo,
  };
}

function buildTranscript(
  filename: string,
  content: string,
  sourceOverride?: TranscriptSource
): Transcript {
  const ext = extname(filename).toLowerCase();
  const id = basename(filename, ext);
  const format = ext === '.vtt' ? 'vtt' : ext === '.srt' ? 'srt' : 'md';

  let cues: TranscriptCue[];
  if (format === 'vtt') cues = parseVtt(content);
  else if (format === 'srt') cues = parseSrt(content);
  else cues = mdToCues(content);

  const durationSec = cues.length > 0 ? cues[cues.length - 1].endSec : null;
  const fullText = cues.map((c) => c.text).join(' ').trim();

  return {
    id,
    filename,
    source: sourceOverride ?? detectSourceFromFilename(filename),
    format,
    durationSec,
    cues,
    fullText,
    weekHint: detectWeekHint(filename),
    dateHint: detectDateHint(filename),
  };
}

function mdToCues(content: string): TranscriptCue[] {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return [{ startSec: 0, endSec: 0, text }];
}

function detectSourceFromFilename(filename: string): TranscriptSource {
  const lower = filename.toLowerCase();
  if (lower.includes('.panopto.')) return 'panopto';
  if (lower.includes('.whisper.')) return 'whisper';
  return 'unknown';
}

const WEEK_RE = /(?:^|[^a-z])(?:wk|week)[-_ ]?0?(\d{1,2})\b/i;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

function detectWeekHint(filename: string): number | null {
  const m = filename.match(WEEK_RE);
  return m ? Number(m[1]) : null;
}

function detectDateHint(filename: string): string | null {
  const m = filename.match(DATE_RE);
  return m ? m[1] : null;
}
