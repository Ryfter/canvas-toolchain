import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { diffSemesters } from '../../src/tools/diff_semesters.js';
import { importPreviousShell } from '../../src/tools/import_previous_shell.js';
import { generateRecommendedOutline } from '../../src/tools/generate_recommended_outline.js';
import { getSemesterPath } from '../../src/kb/course_state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_V1 = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');
const FIX_V2 = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny-v2');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIX_V1 });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Fall2025', archivePath: FIX_V2 });
  diffSemesters({ courseId: 'TEST101', leftSemesterId: 'Spring2025', rightSemesterId: 'Fall2025' });
  importPreviousShell({ courseId: 'TEST101', sourceSemesterId: 'Fall2025', newSemesterId: 'Spring2026', source: 'archive' });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('generateRecommendedOutline — from diff only', () => {
  test('writes plan-outline.md to next-plan/', () => {
    const result = generateRecommendedOutline({ courseId: 'TEST101', semesterId: 'Spring2026' });
    expect(result.outlinePath).toContain('plan-outline.md');
    const content = readFileSync(result.outlinePath, 'utf-8');
    expect(content).toContain('| Week |');
    expect(result.warning).toContain('recommend_for_topic');
  });

  test('outline contains module rows', () => {
    generateRecommendedOutline({ courseId: 'TEST101', semesterId: 'Spring2026' });
    const p = readFileSync(
      join(getSemesterPath('TEST101', 'Spring2026'), 'next-plan', 'plan-outline.md'), 'utf-8'
    );
    expect(p).toContain('Module');
  });
});

describe('generateRecommendedOutline — with currency-report.json', () => {
  test('uses verdict data when currency-report.json present', () => {
    const sourceSemDir = getSemesterPath('TEST101', 'Fall2025');
    const report = {
      version: 1, courseId: 'TEST101', semesterId: 'Fall2025',
      generatedAt: new Date().toISOString(),
      topics: [
        { topic: 'Module 01 - Introductions', verdict: 'KEEP', currencyClass: 'evergreen', newsHits: 0, semestersSince: 1 },
        { topic: 'Module 02 - Agents and Tool Use', verdict: 'UPDATE', currencyClass: 'current', newsHits: 3, semestersSince: 1 },
      ],
    };
    writeFileSync(join(sourceSemDir, 'currency-report.json'), JSON.stringify(report, null, 2), 'utf-8');

    const result = generateRecommendedOutline({ courseId: 'TEST101', semesterId: 'Spring2026' });
    expect(result.warning).toBeUndefined();
    const outline = readFileSync(result.outlinePath, 'utf-8');
    expect(outline).toContain('KEEP');
    expect(outline).toContain('UPDATE');
  });
});
