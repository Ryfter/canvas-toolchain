import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { listAssignments } from '../../src/tools/list_assignments.js';
import { listPages } from '../../src/tools/list_pages.js';
import { listModules } from '../../src/tools/list_modules.js';
import { listResources } from '../../src/tools/list_resources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TEST101', title: 'Tiny Fixture Course' });
  ingestCanvasArchive({ courseId: 'TEST101', semesterId: 'Spring2025', archivePath: FIXTURE });
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('list_assignments', () => {
  test('returns all assignments for a semester', () => {
    const result = listAssignments({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments[0].name).toBe('Engage 1 - Introduce Yourself');
  });

  test('filters by published flag', () => {
    const result = listAssignments({ courseId: 'TEST101', semesterId: 'Spring2025', publishedOnly: true });
    expect(result.assignments.every((a) => a.published)).toBe(true);
  });
});

describe('list_pages', () => {
  test('returns all pages for a semester', () => {
    const result = listPages({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(result.pages).toHaveLength(2);
    expect(result.pages.map((p) => p.url).sort()).toEqual(['week-1-at-a-glance', 'week-2-at-a-glance']);
  });
});

describe('list_modules', () => {
  test('returns modules with item counts', () => {
    const result = listModules({ courseId: 'TEST101', semesterId: 'Spring2025' });
    expect(result.modules).toHaveLength(2);
    expect(result.modules[0].itemCount).toBe(2);
    expect(result.modules[1].itemCount).toBe(1);
  });

  test('returns item details when expandItems is true', () => {
    const result = listModules({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      expandItems: true,
    });
    expect(result.modules[0].items).toBeDefined();
    expect(result.modules[0].items!.length).toBe(2);
  });
});

describe('list_resources', () => {
  test('returns external resource links from the topic map', () => {
    const result = listResources({ courseId: 'TEST101', semesterId: 'Spring2025' });
    const urls = result.resources.map((r) => r.url).sort();
    expect(urls).toEqual([
      'https://example.com/ai-intro',
      'https://example.com/cot',
      'https://example.com/prompting',
    ]);
  });

  test('filters by source kind', () => {
    const result = listResources({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      sourceKind: 'page',
    });
    expect(result.resources.every((r) => r.source === 'page')).toBe(true);
  });
});
