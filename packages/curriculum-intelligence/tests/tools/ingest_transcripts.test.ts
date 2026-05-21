import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { ingestTranscripts } from '../../src/tools/ingest_transcripts.js';
import type { Transcript } from '../../src/types.js';
import { getCourseState } from '../../src/tools/get_course_state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');
const TRANSCRIPTS = join(__dirname, '..', 'fixtures', 'transcripts-tiny');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: ARCHIVE });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('ingest_transcripts', () => {
  test('reads .vtt, .srt, and .md files from the transcript folder', () => {
    const result = ingestTranscripts({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      transcriptsPath: TRANSCRIPTS,
    });

    expect(result.transcriptCount).toBe(3);
    expect(existsSync(result.transcriptsJsonPath)).toBe(true);

    const written = JSON.parse(readFileSync(result.transcriptsJsonPath, 'utf-8')) as {
      transcripts: Transcript[];
    };
    expect(written.transcripts).toHaveLength(3);
  });

  test('tags transcript source from filename suffix (.panopto / .whisper)', () => {
    const result = ingestTranscripts({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      transcriptsPath: TRANSCRIPTS,
    });
    const written = JSON.parse(readFileSync(result.transcriptsJsonPath, 'utf-8')) as {
      transcripts: Transcript[];
    };
    const week1 = written.transcripts.find((t) => t.filename.includes('Week 01'));
    const week2 = written.transcripts.find((t) => t.filename.includes('Week-02'));
    const week3 = written.transcripts.find((t) => t.filename.includes('wk03'));
    expect(week1!.source).toBe('panopto');
    expect(week2!.source).toBe('whisper');
    expect(week3!.source).toBe('unknown');
  });

  test('explicit source argument overrides filename detection', () => {
    const result = ingestTranscripts({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      transcriptsPath: TRANSCRIPTS,
      source: 'whisper',
    });
    const written = JSON.parse(readFileSync(result.transcriptsJsonPath, 'utf-8')) as {
      transcripts: Transcript[];
    };
    for (const t of written.transcripts) {
      expect(t.source).toBe('whisper');
    }
  });

  test('extracts week and date hints from filenames', () => {
    const result = ingestTranscripts({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      transcriptsPath: TRANSCRIPTS,
    });
    const written = JSON.parse(readFileSync(result.transcriptsJsonPath, 'utf-8')) as {
      transcripts: Transcript[];
    };
    const w1 = written.transcripts.find((t) => t.filename.includes('Week 01'));
    const w2 = written.transcripts.find((t) => t.filename.includes('Week-02'));
    const w3 = written.transcripts.find((t) => t.filename.includes('wk03'));
    expect(w1!.weekHint).toBe(1);
    expect(w2!.weekHint).toBe(2);
    expect(w2!.dateHint).toBe('2025-01-23');
    expect(w3!.weekHint).toBe(3);
  });

  test('updates lastTranscriptsIngestedAt on the semester record', () => {
    ingestTranscripts({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      transcriptsPath: TRANSCRIPTS,
    });
    const state = getCourseState({ id: 'TEST101' });
    const sem = state.courses[0].semesters.find((s) => s.id === 'Spring2025');
    expect(sem!.lastTranscriptsIngestedAt).toBeTruthy();
  });

  test('also copies transcript files into the semester transcripts folder when copy=true', () => {
    const result = ingestTranscripts({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      transcriptsPath: TRANSCRIPTS,
      copy: true,
    });
    expect(result.copiedTo).toBeTruthy();
    expect(existsSync(join(result.copiedTo!, 'Week 01 - Introduction.panopto.vtt'))).toBe(true);
  });
});
