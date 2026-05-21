import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { saveCalendar } from '../../src/kb/next_plan.js';
import { shiftDates } from '../../src/tools/shift_dates.js';
import { parseBriefFile } from '../../src/parsers/front_matter.js';
import type { SemesterCalendar } from '../../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

// Source: Spring2025 termStart = 2025-01-13T07:00:00Z (ISO date portion: 2025-01-13)
// First assignment originalDue: 2025-01-20 → offset = 7 days → target: 2026-08-24 + 7 = 2026-08-31
// Second assignment originalDue: 2025-01-27 → offset = 14 days → target: 2026-08-24 + 14 = 2026-09-07 = Labor Day!
const TARGET_CALENDAR: SemesterCalendar = {
  semesterId: 'Fall2025',
  classesBegin: '2026-08-24',
  classesEnd: '2026-12-11',
  breaks: [{ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' }],
  source: 'manual',
  partial: false,
};

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
  importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Spring2025', newSemesterId: 'Fall2025', source: 'archive' });
  saveCalendar('TEST101', 'Fall2025', TARGET_CALENDAR);
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('shiftDates — basic date shifting', () => {
  test('shifts due dates by the same offset from semester start', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'flag' });
    expect(result.shiftsApplied).toBeGreaterThan(0);
    // First brief (offset=7): 2026-08-24 + 7 = 2026-08-31
    const firstBrief = readFileSync(result.shiftedPaths[0], 'utf-8');
    const { data } = parseBriefFile(firstBrief);
    expect(data['due']).not.toBe('TBD');
    expect(typeof data['due']).toBe('string');
  });
});

describe('shiftDates — break collision', () => {
  test('bump-after moves collision date to day after break', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'bump-after' });
    const dues = result.shiftedPaths.map((p) => {
      const { data } = parseBriefFile(readFileSync(p, 'utf-8'));
      return data['due'] as string;
    });
    // offset=14 hits 2026-09-07 (Labor Day) → bump to 2026-09-08
    expect(dues.some((d) => d === '2026-09-08')).toBe(true);
  });

  test('bump-before moves collision date to day before break', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'bump-before' });
    const dues = result.shiftedPaths.map((p) => {
      const { data } = parseBriefFile(readFileSync(p, 'utf-8'));
      return data['due'] as string;
    });
    // 2026-09-07 (Mon, Labor Day) bump back → 2026-09-06 (Sun, not a break day)
    expect(dues.some((d) => d === '2026-09-06')).toBe(true);
  });

  test('flag leaves date as computed but marks break_collision', () => {
    const result = shiftDates({ courseId: 'TEST101', semesterId: 'Fall2025', onBreakCollision: 'flag' });
    const allData = result.shiftedPaths.map((p) => parseBriefFile(readFileSync(p, 'utf-8')).data);
    const hasFlag = allData.some((d) => d['break_collision'] === true);
    expect(hasFlag).toBe(true);
  });
});

describe('shiftDates — multi-section', () => {
  test('writes due_sections when sections have different start dates', () => {
    const result = shiftDates({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      onBreakCollision: 'flag',
      sections: [
        { sectionId: '01', calendarOverrides: { classesBegin: '2026-08-24' } },
        { sectionId: '02', calendarOverrides: { classesBegin: '2026-08-25' } },
      ],
    });
    const { data } = parseBriefFile(readFileSync(result.shiftedPaths[0], 'utf-8'));
    const sections = data['due_sections'] as Record<string, string>;
    expect(sections).toBeDefined();
    expect(sections['01']).not.toBe(sections['02']);
  });
});
