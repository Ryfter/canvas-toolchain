import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { ingestCanvasArchive } from '../../src/tools/ingest_canvas_archive.js';
import { getCourseState } from '../../src/tools/get_course_state.js';
import type { TopicMap } from '../../src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

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

describe('ingest_canvas_archive', () => {
  test('writes topic-map.json under the course semester folder', () => {
    const result = ingestCanvasArchive({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      archivePath: FIXTURE,
    });

    expect(existsSync(result.topicMapPath)).toBe(true);

    const map = JSON.parse(readFileSync(result.topicMapPath, 'utf-8')) as TopicMap;
    expect(map.semesterId).toBe('Spring2025');
    expect(map.course.courseCode).toBe('TEST101');
    expect(map.modules).toHaveLength(2);
    expect(map.assignments).toHaveLength(2);
  });

  test('registers the semester in the course config with archivePath + lastIngestedAt', () => {
    ingestCanvasArchive({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      archivePath: FIXTURE,
    });

    const state = getCourseState({ id: 'TEST101' });
    const sem = state.courses[0].semesters.find((s) => s.id === 'Spring2025');
    expect(sem).toBeDefined();
    expect(sem!.archivePath).toBe(FIXTURE);
    expect(sem!.lastIngestedAt).toBeTruthy();
  });

  test('re-ingest updates lastIngestedAt and overwrites topic-map.json', () => {
    const first = ingestCanvasArchive({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      archivePath: FIXTURE,
    });
    const t1 = JSON.parse(readFileSync(first.topicMapPath, 'utf-8')).ingestedAt;

    // Small sleep so the timestamp differs.
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const second = ingestCanvasArchive({
      courseId: 'TEST101',
      semesterId: 'Spring2025',
      archivePath: FIXTURE,
    });
    const t2 = JSON.parse(readFileSync(second.topicMapPath, 'utf-8')).ingestedAt;
    expect(t2 >= t1).toBe(true);

    const state = getCourseState({ id: 'TEST101' });
    expect(state.courses[0].semesters).toHaveLength(1);
  });

  test('throws when the course is not registered', () => {
    expect(() =>
      ingestCanvasArchive({
        courseId: 'NOPE',
        semesterId: 'Spring2025',
        archivePath: FIXTURE,
      })
    ).toThrow(/not registered/i);
  });

  test('throws when archivePath does not contain a manifests folder', () => {
    expect(() =>
      ingestCanvasArchive({
        courseId: 'TEST101',
        semesterId: 'Spring2025',
        archivePath: '/totally/missing/path',
      })
    ).toThrow();
  });
});
