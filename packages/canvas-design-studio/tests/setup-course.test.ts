import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCourseFromAnswers } from '../src/tools/setup-course.js';
import type { CourseWizardAnswers } from '../src/tools/setup-course.js';

function makeAnswers(overrides: Partial<CourseWizardAnswers> = {}): CourseWizardAnswers {
  return {
    institution: 'Boise State University',
    courseName: 'AI Augmented Projects',
    courseNumber: 'ITM 370',
    professor: 'Dr. Rank',
    semester: 'Fall 2026',
    weeks: 4,
    pageTypes: ['overview', 'assignment'],
    layoutFixed: true,
    primaryColor: '',
    secondaryColor: '',
    ...overrides,
  };
}

describe('createCourseFromAnswers', () => {
  it('creates course directory structure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers(), dir);
    expect(existsSync(join(dir, 'course-config.md'))).toBe(true);
    expect(existsSync(join(dir, 'week-01'))).toBe(true);
    expect(existsSync(join(dir, 'week-04'))).toBe(true);
  });

  it('course-config.md reflects wizard answers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers(), dir);
    const config = readFileSync(join(dir, 'course-config.md'), 'utf-8');
    expect(config).toContain('course_name: AI Augmented Projects');
    expect(config).toContain('course_number: ITM 370');
    expect(config).toContain('semester: Fall 2026');
    expect(config).toContain('weeks: 4');
    expect(config).toContain('- overview');
    expect(config).toContain('- assignment');
  });

  it('creates front-page.md when front-page is selected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers({ pageTypes: ['front-page', 'overview'] }), dir);
    expect(existsSync(join(dir, 'front-page.md'))).toBe(true);
  });

  it('does not create front-page.md when not selected', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers({ pageTypes: ['overview'] }), dir);
    expect(existsSync(join(dir, 'front-page.md'))).toBe(false);
  });

  it('applies color overrides to course-config.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    createCourseFromAnswers(makeAnswers({ primaryColor: '#1A5276' }), dir);
    const config = readFileSync(join(dir, 'course-config.md'), 'utf-8');
    expect(config).toContain('#1A5276');
  });

  it('returns list of created files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    const files = createCourseFromAnswers(makeAnswers(), dir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(f => f.startsWith(dir))).toBe(true);
  });
});
