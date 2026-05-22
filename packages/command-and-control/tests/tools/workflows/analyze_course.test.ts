import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCourse } from '../../../src/tools/workflows/analyze_course.js';
import { setupCourse } from 'curriculum-intelligence-mcp/dist/tools/setup_course.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find the fixture in CI
const FIX_ARCHIVE = join(__dirname, '..', '..', '..', '..', 'curriculum-intelligence', 'tests', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'cc-ac-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'WAC', title: 'Workflow Analyze Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.BRAVE_SEARCH_API_KEY;
});

describe('C&C analyzeCourse workflow', () => {
  test('returns CI analysis report with perAssignment and trajectoryEntry', async () => {
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(r.perAssignment).toBeInstanceOf(Array);
    expect(r.trajectoryEntry).toBeDefined();
    expect(r.augmentations).toBeDefined();
  });

  test('augmentations.newsFeed absent when no feeds configured', async () => {
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(r.augmentations.newsFeed).toBeUndefined();
  });

  test('augmentations.searchScans absent when BRAVE_SEARCH_API_KEY unset', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(r.augmentations.searchScans).toBeUndefined();
  });

  test('trajectory entry does not contain external signal data', async () => {
    const r = await analyzeCourse({
      courseId: 'WAC', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    const json = JSON.stringify(r.trajectoryEntry);
    expect(json).not.toMatch(/externalSignals/);
    expect(json).not.toMatch(/searchScans/);
    expect(json).not.toMatch(/newsFeed/);
  });
});
