import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import { loadAppConfig } from '../../src/config.js';
import type { CourseConfig } from '../../src/types.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('setup_course', () => {
  test('registers a course in app config', () => {
    setupCourse({ id: 'ITM370', title: 'AI-Augmented Projects' });

    const config = loadAppConfig();
    expect(config.courses['ITM370']).toBeDefined();
    expect(config.courses['ITM370'].title).toBe('AI-Augmented Projects');
  });

  test('creates the course folder + per-course config', () => {
    setupCourse({ id: 'ITM370', title: 'AI-Augmented Projects' });

    const appConfig = loadAppConfig();
    const courseDir = join(appConfig.courses['ITM370'].courseRoot, 'ITM370');
    const courseConfigPath = join(courseDir, 'config.json');

    expect(existsSync(courseDir)).toBe(true);
    expect(existsSync(courseConfigPath)).toBe(true);

    const courseConfig = JSON.parse(readFileSync(courseConfigPath, 'utf-8')) as CourseConfig;
    expect(courseConfig.id).toBe('ITM370');
    expect(courseConfig.title).toBe('AI-Augmented Projects');
    expect(courseConfig.semesters).toEqual([]);
    expect(courseConfig.rssFeeds).toEqual([]);
  });

  test('honors an explicit courseRoot override', () => {
    const customRoot = mkdtempSync(join(tmpdir(), 'ci-custom-'));
    try {
      setupCourse({ id: 'ITM370', title: 'AI-Augmented Projects', courseRoot: customRoot });

      const courseDir = join(customRoot, 'ITM370');
      expect(existsSync(courseDir)).toBe(true);

      const config = loadAppConfig();
      expect(config.courses['ITM370'].courseRoot).toBe(customRoot);
    } finally {
      rmSync(customRoot, { recursive: true, force: true });
    }
  });

  test('refuses to re-register an existing course id', () => {
    setupCourse({ id: 'ITM370', title: 'AI-Augmented Projects' });

    expect(() =>
      setupCourse({ id: 'ITM370', title: 'Something else' })
    ).toThrow(/already registered/i);
  });

  test('rejects invalid course ids (whitespace, slashes)', () => {
    expect(() => setupCourse({ id: '', title: 't' })).toThrow();
    expect(() => setupCourse({ id: 'with spaces', title: 't' })).toThrow();
    expect(() => setupCourse({ id: 'has/slash', title: 't' })).toThrow();
  });
});
