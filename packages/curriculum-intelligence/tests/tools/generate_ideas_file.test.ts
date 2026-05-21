import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import { generateIdeasFile } from '../../src/tools/generate_ideas_file.js';

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

describe('generate_ideas_file', () => {
  test('writes ideas.md under the course folder', () => {
    const result = generateIdeasFile({ courseId: 'TEST101' });
    expect(existsSync(result.ideasPath)).toBe(true);
  });

  test('returned path points to ideas.md', () => {
    const result = generateIdeasFile({ courseId: 'TEST101' });
    expect(result.ideasPath).toMatch(/ideas\.md$/);
  });

  test('ideas.md contains expected section headers', () => {
    const result = generateIdeasFile({ courseId: 'TEST101' });
    const content = readFileSync(result.ideasPath, 'utf-8');
    expect(content).toMatch(/follow-on/i);
    expect(content).toMatch(/deferred/i);
  });

  test('includes tool names for deferred v1 scope', () => {
    const result = generateIdeasFile({ courseId: 'TEST101' });
    const content = readFileSync(result.ideasPath, 'utf-8');
    expect(content).toContain('generate_recommended_outline');
    expect(content).toContain('shift_dates');
  });

  test('accepts optional usageNotes and includes them in the file', () => {
    const result = generateIdeasFile({
      courseId: 'TEST101',
      usageNotes: 'The diff_semesters tool was most useful. Quote bank needs richer triggers.',
    });
    const content = readFileSync(result.ideasPath, 'utf-8');
    expect(content).toContain('diff_semesters');
    expect(content).toContain('Quote bank');
  });
});
