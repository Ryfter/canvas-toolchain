import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCourseScaffold, getWeekFolderName } from '../src/tools/course-scaffold.js';
import type { CourseConfig } from '../src/course-types.js';

function makeConfig(overrides: Partial<CourseConfig> = {}): CourseConfig {
  return {
    institution: 'Test University',
    courseName: 'Test Course',
    courseNumber: 'TST 101',
    professor: 'Dr. Test',
    semester: 'Fall 2026',
    weeks: 2,
    pageTypes: ['overview', 'assignment'],
    layoutFixed: true,
    colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
    heroImages: {},
    weekOutline: [
      { week: 1, weekStr: '01', title: 'Week 1', topic: 'Topic A' },
      { week: 2, weekStr: '02', title: 'Week 2', topic: 'Topic B' },
    ],
    ...overrides,
  };
}

describe('getWeekFolderName', () => {
  it('zero-pads week number', () => {
    expect(getWeekFolderName(1)).toBe('week-01');
    expect(getWeekFolderName(12)).toBe('week-12');
  });
});

describe('createCourseScaffold', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'scaffold-')); });

  it('creates course-config.md', () => {
    createCourseScaffold(makeConfig(), dir);
    expect(existsSync(join(dir, 'course-config.md'))).toBe(true);
  });

  it('course-config.md contains required fields', () => {
    createCourseScaffold(makeConfig(), dir);
    const content = readFileSync(join(dir, 'course-config.md'), 'utf-8');
    expect(content).toContain('course_name: Test Course');
    expect(content).toContain('course_number: TST 101');
    expect(content).toContain('semester: Fall 2026');
    expect(content).toContain('- overview');
    expect(content).toContain('- assignment');
  });

  it('creates a subfolder for each week', () => {
    createCourseScaffold(makeConfig(), dir);
    expect(existsSync(join(dir, 'week-01'))).toBe(true);
    expect(existsSync(join(dir, 'week-02'))).toBe(true);
  });

  it('creates one .md file per page type per week', () => {
    createCourseScaffold(makeConfig(), dir);
    expect(existsSync(join(dir, 'week-01', 'overview.md'))).toBe(true);
    expect(existsSync(join(dir, 'week-01', 'assignment.md'))).toBe(true);
    expect(existsSync(join(dir, 'week-02', 'overview.md'))).toBe(true);
  });

  it('creates front-page.md when front-page is active', () => {
    createCourseScaffold(makeConfig({ pageTypes: ['front-page', 'overview'] }), dir);
    expect(existsSync(join(dir, 'front-page.md'))).toBe(true);
  });

  it('overview.md contains correct section prompts', () => {
    createCourseScaffold(makeConfig(), dir);
    const content = readFileSync(join(dir, 'week-01', 'overview.md'), 'utf-8');
    expect(content).toContain('week: 1');
    expect(content).toContain('## Learning Objectives');
    expect(content).toContain('## Introduction');
    expect(content).toContain('## Activities');
  });

  it('assignment.md contains correct section prompts', () => {
    createCourseScaffold(makeConfig(), dir);
    const content = readFileSync(join(dir, 'week-01', 'assignment.md'), 'utf-8');
    expect(content).toContain('week: 1');
    expect(content).toContain('## Brief');
    expect(content).toContain('## Rubric');
  });

  it('returns list of created file paths', () => {
    const files = createCourseScaffold(makeConfig(), dir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(f => f.startsWith(dir))).toBe(true);
  });

  it('creates proj-assignment.md when proj-assignment is in pageTypes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-proj-'));
    const config = makeConfig({ pageTypes: ['proj-assignment'], weeks: 1 });
    createCourseScaffold(config, dir);
    expect(existsSync(join(dir, 'week-01', 'proj-assignment.md'))).toBe(true);
  });

  it('proj-assignment.md front matter includes team and timeline flags', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-proj-fm-'));
    const config = makeConfig({ pageTypes: ['proj-assignment'], weeks: 1 });
    createCourseScaffold(config, dir);
    const content = readFileSync(join(dir, 'week-01', 'proj-assignment.md'), 'utf-8');
    expect(content).toContain('team: false');
    expect(content).toContain('timeline: true');
  });

  it('creates tech-assignment.md when tech-assignment is in pageTypes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-tech-'));
    const config = makeConfig({ pageTypes: ['tech-assignment'], weeks: 1 });
    createCourseScaffold(config, dir);
    expect(existsSync(join(dir, 'week-01', 'tech-assignment.md'))).toBe(true);
  });

  it('tech-assignment.md front matter includes team flag', () => {
    const dir = mkdtempSync(join(tmpdir(), 'scaffold-tech-fm-'));
    const config = makeConfig({ pageTypes: ['tech-assignment'], weeks: 1 });
    createCourseScaffold(config, dir);
    const content = readFileSync(join(dir, 'week-01', 'tech-assignment.md'), 'utf-8');
    expect(content).toContain('team: false');
    expect(content).not.toContain('timeline:');
  });
});
