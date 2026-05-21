import { describe, expect, test } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCdsCourseFolder } from '../../src/parsers/cds_course_folder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = join(__dirname, '..', 'fixtures', 'cds-course-tiny');

describe('parseCdsCourseFolder', () => {
  test('reads course metadata from course-config.md', () => {
    const result = parseCdsCourseFolder(FIXTURE);
    expect(result.courseId).toBe('TEST101');
    expect(result.semester).toBe('Spring2026');
  });

  test('reads briefs from week subdirectories', () => {
    const result = parseCdsCourseFolder(FIXTURE);
    expect(result.briefs).toHaveLength(2);
  });

  test('brief has correct title, week, and due', () => {
    const result = parseCdsCourseFolder(FIXTURE);
    const b = result.briefs.find((b) => b.title === 'Engage 1 - Introduce Yourself');
    expect(b).toBeDefined();
    expect(b!.week).toBe(1);
    expect(b!.due).toBe('2026-01-20');
    expect(b!.body.trim()).toContain('Introduce yourself');
  });
});
