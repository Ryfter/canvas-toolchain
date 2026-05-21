import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { diffSemesters } from '../../src/tools/diff_semesters.js';

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
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('diff_semesters', () => {
  test('reports modules added and removed between semesters', () => {
    const diff = diffSemesters({ courseId: 'TEST101', leftSemesterId: 'Spring2025', rightSemesterId: 'Fall2025' });

    expect(diff.modules.removed.map((m) => m.name)).toContain('Module 02 - Prompt Engineering Basics');
    expect(diff.modules.added.map((m) => m.name)).toContain('Module 02 - Agents and Tool Use');
    expect(diff.modules.common.map((m) => m.leftName)).toContain('Module 01 - Introductions');
  });

  test('reports assignments added, removed, reused-verbatim, and rewritten', () => {
    const diff = diffSemesters({ courseId: 'TEST101', leftSemesterId: 'Spring2025', rightSemesterId: 'Fall2025' });

    // Engage 1 - identical description → reusedVerbatim
    expect(diff.assignments.reusedVerbatim.map((a) => a.name)).toContain('Engage 1 - Introduce Yourself');

    // Engage 2 - same name, different description → rewritten
    expect(diff.assignments.rewritten.map((a) => a.name)).toContain('Engage 2 - First Prompt');

    // Engage 3 only exists in Fall2025
    expect(diff.assignments.added.map((a) => a.name)).toContain('Engage 3 - Build an Agent');
    expect(diff.assignments.added.length).toBeGreaterThanOrEqual(1);

    // No assignments were dropped in this fixture
    expect(diff.assignments.removed).toHaveLength(0);
  });

  test('reports page additions and removals (by url)', () => {
    const diff = diffSemesters({ courseId: 'TEST101', leftSemesterId: 'Spring2025', rightSemesterId: 'Fall2025' });
    // Same two pages exist in both fixtures
    expect(diff.pages.added).toHaveLength(0);
    expect(diff.pages.removed).toHaveLength(0);
    expect(diff.pages.commonCount).toBe(2);
  });

  test('reports external resource link adds/drops', () => {
    const diff = diffSemesters({ courseId: 'TEST101', leftSemesterId: 'Spring2025', rightSemesterId: 'Fall2025' });
    expect(diff.resources.added).toContain('https://example.com/agents');
    expect(diff.resources.removed).toContain('https://example.com/cot');
  });

  test('writes diff-vs-<other>.json under the left semester folder', () => {
    const result = diffSemesters({ courseId: 'TEST101', leftSemesterId: 'Spring2025', rightSemesterId: 'Fall2025' });
    expect(existsSync(result.diffPath)).toBe(true);
    const written = JSON.parse(readFileSync(result.diffPath, 'utf-8'));
    expect(written.leftSemesterId).toBe('Spring2025');
    expect(written.rightSemesterId).toBe('Fall2025');
  });
});
