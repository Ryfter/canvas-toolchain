import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseCourseConfig } from '../src/tools/course-config.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-config');

/** Write a temp course-config.md with the given front matter and return its path. */
function writeTmpConfig(frontMatter: string): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'course-config-'));
  const path = join(dir, 'course-config.md');
  writeFileSync(path, `---\n${frontMatter}\n---\n\n## Week Outline\n| Week | Title | Topic |\n|------|-------|-------|\n`);
  return { path, dir };
}

describe('parseCourseConfig', () => {
  it('reads required string fields', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.institution).toBe('Example University');
    expect(config.courseName).toBe('AI Augmented Projects');
    expect(config.courseNumber).toBe('ITM 370');
    expect(config.professor).toBe('Dr. Smith');
    expect(config.semester).toBe('Fall 2026');
  });

  it('reads weeks as number', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.weeks).toBe(4);
  });

  it('reads page_types array', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.pageTypes).toEqual(['front-page', 'overview', 'resources', 'assignment']);
  });

  it('reads layout_fixed as boolean', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.layoutFixed).toBe(true);
  });

  it('parses week outline table', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.weekOutline).toHaveLength(4);
    expect(config.weekOutline[0]).toEqual({
      week: 1, weekStr: '01', title: 'Introduction', topic: 'What is AI Augmentation?',
    });
    expect(config.weekOutline[3]).toEqual({
      week: 4, weekStr: '04', title: 'Showcase', topic: 'Final Presentations',
    });
  });

  it('inherits institution colors when course colors are blank', () => {
    const config = parseCourseConfig(join(fixturesDir, 'basic/course-config.md'));
    expect(config.colors.primary).toMatch(/^#/);
    expect(config.colors.primaryDark).toMatch(/^#/);
    expect(config.colors.primaryLight).toMatch(/^#/);
    expect(config.colors.secondary).toMatch(/^#/);
  });

  it('applies course color overrides', () => {
    const config = parseCourseConfig(join(fixturesDir, 'color-overrides/course-config.md'));
    expect(config.colors.primary).toBe('#1A5276');
    expect(config.colors.secondary).toBe('#D64309');
    expect(config.colors.primaryDark).not.toBe('#1A5276');
    expect(config.colors.primaryLight).not.toBe('#1A5276');
  });

  it('reads hero images per page type', () => {
    const config = parseCourseConfig(join(fixturesDir, 'color-overrides/course-config.md'));
    expect(config.heroImages['overview']).toBe('https://example.com/hero.jpg');
  });

  it('throws when file does not exist', () => {
    expect(() =>
      parseCourseConfig(join(fixturesDir, 'nonexistent/course-config.md'))
    ).toThrow();
  });

  it('reads oral_assessment_launch_domain when present', () => {
    const { path, dir } = writeTmpConfig(
      'institution: Example University\noral_assessment_launch_domain: rhetorixlab.boisestate.edu',
    );
    try {
      const cfg = parseCourseConfig(path);
      expect(cfg.oralAssessmentLaunchDomain).toBe('rhetorixlab.boisestate.edu');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves oralAssessmentLaunchDomain undefined when absent', () => {
    const { path, dir } = writeTmpConfig('institution: Example University');
    try {
      expect(parseCourseConfig(path).oralAssessmentLaunchDomain).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
