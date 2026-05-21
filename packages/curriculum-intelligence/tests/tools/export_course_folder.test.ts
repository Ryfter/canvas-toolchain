import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { exportCourseFolder } from '../../src/tools/export_course_folder.js';
import { parseBriefFile, serializeBriefFile } from '../../src/parsers/front_matter.js';
import { getNextPlanPath } from '../../src/kb/next_plan.js';

/** Inject CI analysis fields into the first brief in next-plan. Returns the relative path used as manifest key. */
function injectCiIntoFirstBrief(courseId: string, semesterId: string, ciFields: Record<string, unknown>): string {
  const nextPlanDir = getNextPlanPath(courseId, semesterId);
  const weekDirs = readdirSync(nextPlanDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('week-'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const weekDir = join(nextPlanDir, weekDirs[0].name);
  const files = readdirSync(weekDir).filter((f) => f.endsWith('.md'));
  const filePath = join(weekDir, files[0]);
  const { data, body } = parseBriefFile(readFileSync(filePath, 'utf-8'));
  Object.assign(data, ciFields);
  writeFileSync(filePath, serializeBriefFile(data, body), 'utf-8');
  return `${weekDirs[0].name}/${files[0]}`;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

const CI_FIELDS = ['verdict', 'currency', 'lastTaught', 'semestersSince', 'newsHits', 'staleness', 'replacement_recommended', 'originalDue', 'break_collision'];

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

describe('exportCourseFolder', () => {
  test('creates output directory with week subdirectories', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    expect(result.outputPaths).toHaveLength(1);
    const outputDir = result.outputPaths[0];
    const entries = readdirSync(outputDir);
    expect(entries.some((e) => e.startsWith('week-'))).toBe(true);
  });

  test('strips CI-specific front matter fields from output files', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    const outputDir = result.outputPaths[0];
    for (const weekDir of readdirSync(outputDir)) {
      if (!weekDir.startsWith('week-')) continue;
      for (const file of readdirSync(join(outputDir, weekDir))) {
        const { data } = parseBriefFile(readFileSync(join(outputDir, weekDir, file), 'utf-8'));
        for (const ciField of CI_FIELDS) {
          expect(data[ciField], `CI field "${ciField}" should be stripped`).toBeUndefined();
        }
      }
    }
  });

  test('preserves title, week, type, and due in output front matter', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    const outputDir = result.outputPaths[0];
    const weekDirs = readdirSync(outputDir).filter((e) => e.startsWith('week-'));
    const firstWeek = join(outputDir, weekDirs[0]);
    const files = readdirSync(firstWeek);
    const { data } = parseBriefFile(readFileSync(join(firstWeek, files[0]), 'utf-8'));
    expect(data['title']).toBeTruthy();
    expect(data['week']).toBeTruthy();
    expect(data['type']).toBeTruthy();
  });

  test('writes course-config.md at root of output', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    const configPath = join(result.outputPaths[0], 'course-config.md');
    const { data } = parseBriefFile(readFileSync(configPath, 'utf-8'));
    expect(data['courseId']).toBe('TEST101');
    expect(data['semester']).toBe('Fall2025');
  });

  test('multi-section produces one output folder per section', () => {
    const result = exportCourseFolder({
      courseId: 'TEST101',
      semesterId: 'Fall2025',
      sections: ['01', '02'],
    });
    expect(result.outputPaths).toHaveLength(2);
    expect(result.sectionCount).toBe(2);
  });

  test('no planning-manifest.json by default', () => {
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025' });
    expect(existsSync(join(result.outputPaths[0], 'planning-manifest.json'))).toBe(false);
    expect(result.planningManifestPaths).toBeUndefined();
  });

  test('writes planning-manifest.json with CI fields when preserveCiMetadata is true', () => {
    const relPath = injectCiIntoFirstBrief('TEST101', 'Fall2025', {
      verdict: 'UPDATE',
      currency: 'dated',
      staleness: 0.7,
      newsHits: [{ source: 'rss:test', date: '2026-01-01', title: 'Test hit' }],
    });

    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025', preserveCiMetadata: true });
    const manifestPath = join(result.outputPaths[0], 'planning-manifest.json');

    expect(existsSync(manifestPath)).toBe(true);
    expect(result.planningManifestPaths).toEqual([manifestPath]);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.courseId).toBe('TEST101');
    expect(manifest.semesterId).toBe('Fall2025');
    expect(manifest.exportedAt).toBeTruthy();
    expect(manifest.briefs[relPath]?.verdict).toBe('UPDATE');
    expect(manifest.briefs[relPath]?.currency).toBe('dated');
    expect(manifest.briefs[relPath]?.staleness).toBe(0.7);
    expect(manifest.briefs[relPath]?.newsHits).toHaveLength(1);
  });

  test('YAML output stays clean even with preserveCiMetadata true', () => {
    injectCiIntoFirstBrief('TEST101', 'Fall2025', { verdict: 'KEEP', currency: 'evergreen' });
    const result = exportCourseFolder({ courseId: 'TEST101', semesterId: 'Fall2025', preserveCiMetadata: true });
    const outputDir = result.outputPaths[0];
    for (const weekDir of readdirSync(outputDir)) {
      if (!weekDir.startsWith('week-')) continue;
      for (const file of readdirSync(join(outputDir, weekDir))) {
        if (!file.endsWith('.md')) continue;
        const { data } = parseBriefFile(readFileSync(join(outputDir, weekDir, file), 'utf-8'));
        for (const ciField of CI_FIELDS) {
          expect(data[ciField], `CI field "${ciField}" must not appear in YAML output`).toBeUndefined();
        }
      }
    }
  });

  test('sidecar is written per section in multi-section export', () => {
    injectCiIntoFirstBrief('TEST101', 'Fall2025', { verdict: 'DROP' });
    const result = exportCourseFolder({
      courseId: 'TEST101', semesterId: 'Fall2025',
      sections: ['01', '02'],
      preserveCiMetadata: true,
    });
    expect(result.planningManifestPaths).toHaveLength(2);
    for (const manifestPath of result.planningManifestPaths!) {
      expect(existsSync(manifestPath)).toBe(true);
    }
  });
});
