import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { parseBriefFile } from '../../src/parsers/front_matter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');
const FIX_CDS = join(__dirname, '..', 'fixtures', 'cds-course-tiny');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('importPreviousShell — source: archive', () => {
  test('creates plan-config.json with correct metadata', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'archive',
    });
    expect(result.planConfigPath).toContain('plan-config.json');
    const cfg = JSON.parse(readFileSync(result.planConfigPath, 'utf-8'));
    expect(cfg.sourceSemesterId).toBe('Spring2025');
    expect(cfg.targetSemesterId).toBe('Fall2025');
    expect(cfg.source).toBe('archive');
  });

  test('creates brief stub files in week directories', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'archive',
    });
    expect(result.briefsCreated).toBeGreaterThan(0);
    const found = result.briefPaths.some((p) => p.includes('week-01'));
    expect(found).toBe(true);
  });

  test('brief file has CI front matter with due: TBD and verdict: UPDATE default', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'archive',
    });
    const firstBrief = readFileSync(result.briefPaths[0], 'utf-8');
    const { data } = parseBriefFile(firstBrief);
    expect(data['due']).toBe('TBD');
    expect(data['verdict']).toBe('UPDATE');
    expect(data['lastTaught']).toBe('Spring2025');
    expect(typeof data['originalDue']).toBe('string');
  });
});

describe('importPreviousShell — source: cds', () => {
  test('creates brief stubs from a CDS course folder', () => {
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2026',
      newSemesterId: 'Fall2026',
      source: 'cds',
      cdsPath: FIX_CDS,
    });
    expect(result.briefsCreated).toBe(2);
  });
});

describe('importPreviousShell — source: auto', () => {
  test('falls back to archive when no CDS path provided', () => {
    ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const result = importPreviousShell({
      courseId: 'TEST101',
      sourceSemesterId: 'Spring2025',
      newSemesterId: 'Fall2025',
      source: 'auto',
    });
    expect(result.sourceUsed).toBe('archive');
    expect(result.briefsCreated).toBeGreaterThan(0);
  });
});
