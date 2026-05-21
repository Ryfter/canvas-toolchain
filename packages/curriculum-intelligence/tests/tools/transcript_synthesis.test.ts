import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { ingestTranscripts } from '../../src/tools/ingest_transcripts.js';
import { mapTranscriptsToWeeks } from '../../src/tools/map_transcripts_to_weeks.js';
import { findOffSyllabusTopics } from '../../src/tools/find_off_syllabus_topics.js';
import { buildQuoteBank } from '../../src/tools/build_quote_bank.js';

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
  mapTranscriptsToWeeks({ courseId: 'TEST101', semesterId: 'Spring2025' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('find_off_syllabus_topics', () => {
  test('returns per-lecture novel-token reports', () => {
    const result = findOffSyllabusTopics({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(result.lectures.length).toBeGreaterThan(0);
    const w2 = result.lectures.find((l) => l.week === 2);
    expect(w2).toBeDefined();
    // Week 2 page only mentions chain-of-thought / few-shot. Transcript mentions
    // "prompt injection" — which should surface as off-syllabus.
    const tokens = w2!.novelTokens.map((t) => t.token);
    expect(tokens.some((t) => t.includes('injection') || t.includes('attacks'))).toBe(true);
  });

  test('writes off-syllabus.json under the semester folder', () => {
    const result = findOffSyllabusTopics({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(existsSync(result.reportPath)).toBe(true);
  });

  test('includes sample cues for each novel-token cluster', () => {
    const result = findOffSyllabusTopics({ courseId: 'TEST101', semesterId: 'Spring2025' });
    const w2 = result.lectures.find((l) => l.week === 2);
    expect(w2!.sampleCues.length).toBeGreaterThan(0);
    expect(w2!.sampleCues[0]).toHaveProperty('text');
  });
});

describe('build_quote_bank', () => {
  test('extracts at least one notable line per transcript when present', () => {
    const result = buildQuoteBank({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(result.quoteCount).toBeGreaterThan(0);
    expect(existsSync(result.quoteBankPath)).toBe(true);
    const data = JSON.parse(readFileSync(result.quoteBankPath, 'utf-8'));
    expect(Array.isArray(data.quotes)).toBe(true);
  });

  test('each quote includes transcript id, source, and text', () => {
    const result = buildQuoteBank({ courseId: 'TEST101', semesterId: 'Spring2025' });
    const data = JSON.parse(readFileSync(result.quoteBankPath, 'utf-8'));
    if (data.quotes.length > 0) {
      const q = data.quotes[0];
      expect(q.transcriptId).toBeDefined();
      expect(q.source).toBeDefined();
      expect(q.text).toBeTruthy();
    }
  });
});
