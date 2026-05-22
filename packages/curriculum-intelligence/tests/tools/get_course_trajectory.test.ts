import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { analyzeCourse } from '../../src/tools/analyze_course.js';
import { getCourseTrajectory } from '../../src/tools/get_course_trajectory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-trj-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TRJ', title: 'Trajectory Read Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('getCourseTrajectory', () => {
  test('empty course returns semesterCount 0 with empty arrays', async () => {
    const r = await getCourseTrajectory({ courseId: 'TRJ' });
    expect(r.semesterCount).toBe(0);
    expect(r.unstableTopics).toEqual([]);
    expect(r.trueEvergreens).toEqual([]);
  });

  test('after 3 runs returns trajectory data', async () => {
    for (const s of ['Spring2025', 'Fall2025', 'Spring2026']) {
      await analyzeCourse({ courseId: 'TRJ', semesterId: s, archivePath: FIX_ARCHIVE });
    }
    const r = await getCourseTrajectory({ courseId: 'TRJ' });
    expect(r.semesterCount).toBe(3);
    expect(typeof r.churnRate).toBe('number');
  });

  test('summary granularity omits rawEntries and topicTimelines', async () => {
    for (const s of ['Spring2025', 'Fall2025']) {
      await analyzeCourse({ courseId: 'TRJ', semesterId: s, archivePath: FIX_ARCHIVE });
    }
    const r = await getCourseTrajectory({ courseId: 'TRJ', granularity: 'summary' });
    expect(r.rawEntries).toBeUndefined();
    expect(r.topicTimelines).toBeUndefined();
  });

  test('granular returns rawEntries', async () => {
    await analyzeCourse({ courseId: 'TRJ', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    const r = await getCourseTrajectory({ courseId: 'TRJ', granularity: 'granular' });
    expect(r.rawEntries).toHaveLength(1);
  });

  test('lookback limits how many entries are read', async () => {
    for (const s of ['S24', 'F24', 'S25', 'F25', 'S26']) {
      await analyzeCourse({ courseId: 'TRJ', semesterId: s, archivePath: FIX_ARCHIVE });
    }
    const r = await getCourseTrajectory({ courseId: 'TRJ', granularity: 'granular', lookback: 2 });
    expect(r.rawEntries).toHaveLength(2);
    expect(r.rawEntries![1].semesterId).toBe('S26');
  });
});
