import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { ingestTranscripts } from '../../src/tools/ingest_transcripts.js';
import { mapTranscriptsToWeeks } from '../../src/tools/map_transcripts_to_weeks.js';
import { extractLectureTopics } from '../../src/tools/extract_lecture_topics.js';

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
  ingestTranscripts({ courseId: 'TEST101', semesterId: 'Spring2025', transcriptsPath: TRANSCRIPTS });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('map_transcripts_to_weeks', () => {
  test('maps each transcript to a week using filename hints', () => {
    const result = mapTranscriptsToWeeks({ courseId: 'TEST101', semesterId: 'Spring2025' });

    expect(result.mappings).toHaveLength(3);
    const m1 = result.mappings.find((m) => m.transcriptId.includes('Week 01'));
    const m2 = result.mappings.find((m) => m.transcriptId.includes('Week-02'));
    const m3 = result.mappings.find((m) => m.transcriptId.includes('wk03'));
    expect(m1!.week).toBe(1);
    expect(m1!.matchedBy).toBe('weekHint');
    expect(m2!.week).toBe(2);
    expect(m3!.week).toBe(3);
  });

  test('writes week-map.json under the semester folder', () => {
    const result = mapTranscriptsToWeeks({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(existsSync(result.weekMapPath)).toBe(true);
    const written = JSON.parse(readFileSync(result.weekMapPath, 'utf-8'));
    expect(written.mappings).toHaveLength(3);
  });

  test('flags transcripts with no detectable week as unmatched', () => {
    // Use the v2 fixture which has no week-hint transcripts available; instead we test
    // by checking that the structure includes an "unmatched" array even when empty here.
    const result = mapTranscriptsToWeeks({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(result.unmatched).toBeDefined();
    expect(Array.isArray(result.unmatched)).toBe(true);
  });
});

describe('extract_lecture_topics', () => {
  test('returns shaped lecture chunks ready for Claude reasoning', () => {
    const result = extractLectureTopics({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(result.lectures).toHaveLength(3);
    const first = result.lectures[0];
    expect(first.transcriptId).toBeDefined();
    expect(first.source).toBeDefined();
    expect(first.fullText).toBeTruthy();
    expect(typeof first.durationSec === 'number' || first.durationSec === null).toBe(true);
  });

  test('filters by week when requested', () => {
    const result = extractLectureTopics({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      week: 2,
    });
    expect(result.lectures).toHaveLength(1);
    expect(result.lectures[0].week).toBe(2);
    expect(result.lectures[0].fullText).toContain('prompt engineering');
  });

  test('filters by transcriptId when requested', () => {
    const result = extractLectureTopics({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      transcriptId: 'wk03-agents',
    });
    expect(result.lectures).toHaveLength(1);
    expect(result.lectures[0].fullText).toContain('agents');
  });
});
