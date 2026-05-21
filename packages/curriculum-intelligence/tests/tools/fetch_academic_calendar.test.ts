import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { fetchAcademicCalendar } from '../../src/tools/fetch_academic_calendar.js';
import { loadCalendar } from '../../src/kb/next_plan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');
const FIX_HTML = readFileSync(join(__dirname, '..', 'fixtures', 'academic-calendar-bsu.html'), 'utf-8');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('fetchAcademicCalendar — URL mode (injected fetcher)', () => {
  test('parses HTML fixture and writes calendar.json', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      url: 'https://example.edu/calendar/fall-2026',
      htmlFetcher: async () => FIX_HTML,
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.classesBegin).toBe('2026-08-24');
    expect(cal.partial).toBe(false);
    expect(cal.source).toBe('url');
  });
});

describe('fetchAcademicCalendar — manual dates', () => {
  test('writes calendar.json from explicit dates', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      startDate: '2026-08-24',
      endDate: '2026-12-11',
      breaks: [{ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' }],
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.classesBegin).toBe('2026-08-24');
    expect(cal.classesEnd).toBe('2026-12-11');
    expect(cal.breaks).toHaveLength(1);
    expect(cal.source).toBe('manual');
    expect(cal.partial).toBe(false);
  });
});

describe('fetchAcademicCalendar — semesterPattern', () => {
  test('infers calendar from pattern and writes calendar.json', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      semesterPattern: 'Fall2026',
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.source).toBe('pattern');
    expect(cal.classesBegin).toBeTruthy();
  });
});

describe('fetchAcademicCalendar — partial result', () => {
  test('sets partial:true when URL page has no recognizable dates', async () => {
    await fetchAcademicCalendar({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      url: 'https://example.edu/no-dates',
      htmlFetcher: async () => '<html><body><p>Nothing useful</p></body></html>',
    });
    const cal = loadCalendar('TEST101', 'Fall2025');
    expect(cal.partial).toBe(true);
    expect(cal.missing).toContain('classesBegin');
  });
});
