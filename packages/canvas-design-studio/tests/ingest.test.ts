import { describe, expect, it } from 'vitest';
import { parseCourseConfig, validateCourseInfo } from '../src/tools/ingest.js';
import type { CourseInfo } from '../src/tools/ingest.js';
import { join, resolve } from 'node:path';
import {
  findFileWithInheritance,
  findCourseConfig,
} from '../src/tools/ingest.js';
import type { InstitutionConfig } from '../src/types.js';
import { ingestAssignmentFolder } from '../src/tools/ingest.js';

const FIXTURES = resolve('tests/fixtures/ingest');

const TEST_CONFIG: InstitutionConfig = {
  institution: 'Example University',
  colors: {
    primary: '#0033A0',
    primaryDark: '#002277',
    primaryLight: '#E6ECF9',
    secondary: '#D64309',
  },
  canvasUrl: 'https://example.instructure.com',
};

describe('parseCourseConfig', () => {
  it('parses all six required fields', () => {
    const content = [
      'Institution: Example University',
      'Professor: Dr. Rank',
      'Course Number: ITM 370',
      'Course Name: AI Augmented Projects',
      'Assignment Number: 16.06',
      'Semester: Fall 2026',
    ].join('\n');
    const result = parseCourseConfig(content);
    expect(result.institution).toBe('Example University');
    expect(result.professor).toBe('Dr. Rank');
    expect(result.courseNumber).toBe('ITM 370');
    expect(result.courseName).toBe('AI Augmented Projects');
    expect(result.assignmentNumber).toBe('16.06');
    expect(result.semester).toBe('Fall 2026');
  });

  it('treats blank value as not set — does not include in result', () => {
    const content = 'Professor:\nCourse Name: AI Projects';
    const result = parseCourseConfig(content);
    expect(result.professor).toBeUndefined();
    expect(result.courseName).toBe('AI Projects');
  });

  it('ignores comment lines starting with #', () => {
    const content = '# This is a comment\nProfessor: Dr. Rank';
    const result = parseCourseConfig(content);
    expect(result.professor).toBe('Dr. Rank');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('correctly parses values containing colons', () => {
    const content = 'Course Name: Intro to AI: Week 1';
    const result = parseCourseConfig(content);
    expect(result.courseName).toBe('Intro to AI: Week 1');
  });
});

describe('validateCourseInfo', () => {
  const valid: CourseInfo = {
    institution: 'University',
    professor: 'Dr. Rank',
    courseNumber: 'ITM 370',
    courseName: 'AI Projects',
    assignmentNumber: '16.06',
    semester: 'Fall 2026',
  };

  it('returns empty array for fully-populated valid config', () => {
    expect(validateCourseInfo(valid)).toEqual([]);
  });

  it('returns error message for missing field', () => {
    const info = { ...valid, professor: '' } as unknown as Partial<CourseInfo>;
    const errors = validateCourseInfo(info as CourseInfo);
    expect(errors.some(e => e.includes('professor'))).toBe(true);
  });

  it('returns error message for placeholder value', () => {
    const info = { ...valid, professor: '[Your Name]' };
    const errors = validateCourseInfo(info);
    expect(errors.some(e => e.includes('professor'))).toBe(true);
    expect(errors.some(e => e.includes('[Your Name]'))).toBe(true);
  });
});

describe('findFileWithInheritance', () => {
  it('returns file from target folder when present', () => {
    // simple-full has rubric.md in the folder itself
    const result = findFileWithInheritance('rubric.md', join(FIXTURES, 'simple-full'));
    expect(result).not.toBeNull();
    expect(result!.content).toContain('Grading Rubric');
    expect(result!.resolvedPath).toContain('simple-full');
  });

  it('returns file from parent folder (inheritance) when not in target', () => {
    // week-01 has no rubric.md; ai-challenge/ parent does
    const result = findFileWithInheritance(
      'rubric.md',
      join(FIXTURES, 'advanced-group/ai-challenge/week-01'),
    );
    expect(result).not.toBeNull();
    expect(result!.content).toContain('AI Challenge Rubric');
    expect(result!.resolvedPath).toContain('ai-challenge');
    expect(result!.resolvedPath).not.toContain('week-01');
  });

  it('returns null when file not found anywhere in tree', () => {
    // simple-brief-only has no rubric.md and no parent with one
    const result = findFileWithInheritance('rubric.md', join(FIXTURES, 'simple-brief-only'));
    expect(result).toBeNull();
  });
});

describe('findCourseConfig', () => {
  it('finds config in target folder when present', () => {
    const result = findCourseConfig(join(FIXTURES, 'simple-brief-only'));
    expect(result.merged.professor).toBe('Dr. Rank');
    expect(result.merged.assignmentNumber).toBe('16.06');
  });

  it('merges per-assignment override with shared config — per-assignment wins', () => {
    // week-01 has course-config.md with only Assignment Number
    // advanced-group/course-config.md has everything except Assignment Number
    const result = findCourseConfig(join(FIXTURES, 'advanced-group/ai-challenge/week-01'));
    expect(result.merged.professor).toBe('Dr. Rank');          // from shared
    expect(result.merged.assignmentNumber).toBe('12.01');      // from per-assignment override
    expect(result.merged.courseName).toBe('AI Augmented Projects'); // from shared
  });

  it('throws when no course-config.md found anywhere in tree', () => {
    // FIXTURES root is tests/fixtures/ingest — no course-config.md exists there
    // walk root for this path = 'tests' (first segment of relative path from CWD)
    // None of tests/, tests/fixtures/, or tests/fixtures/ingest/ have a course-config.md
    expect(() => findCourseConfig(FIXTURES)).toThrow('course-config.md not found');
  });
});

describe('ingestAssignmentFolder', () => {
  it('simple mode — brief only: returns html, courseInfo, sources', () => {
    const result = ingestAssignmentFolder(
      { folderPath: join(FIXTURES, 'simple-brief-only') },
      TEST_CONFIG,
    );
    expect(result.html).toContain('HERO_IMAGE_URL');
    expect(result.html).toContain('ITM 370');
    expect(result.courseInfo.professor).toBe('Dr. Rank');
    expect(result.courseInfo.assignmentNumber).toBe('16.06');
    expect(result.sources.brief).toContain('Ignite Talk');
    expect(result.sources.rubric).toBeUndefined();
    expect(result.sources.shell).toBeUndefined();
    expect(result.filename).toContain('itm');
    expect(typeof result.heroImagePrompt).toBe('string');
    expect(result.sources.sourceMap.courseConfig).toContain('simple-brief-only');
  });

  it('advanced group — week-01 inherits rubric and shell from ai-challenge parent', () => {
    const result = ingestAssignmentFolder(
      { folderPath: join(FIXTURES, 'advanced-group/ai-challenge/week-01') },
      TEST_CONFIG,
    );
    expect(result.sources.rubric).toContain('AI Challenge Rubric');
    expect(result.sources.shell).toContain('Challenge Goal');
    expect(result.sources.sourceMap.rubric).toContain('ai-challenge');
    expect(result.sources.sourceMap.rubric).not.toContain('week-01');
    expect(result.courseInfo.assignmentNumber).toBe('12.01');   // from per-assignment override
    expect(result.courseInfo.professor).toBe('Dr. Rank');       // from shared config
  });

  it('simple-full — returns rubric and shell from same folder', () => {
    const result = ingestAssignmentFolder(
      { folderPath: join(FIXTURES, 'simple-full') },
      TEST_CONFIG,
    );
    expect(result.sources.rubric).toContain('Grading Rubric');
    expect(result.sources.shell).toContain('Page Structure');
    expect(result.sources.styleNotes).toContain('two-column-dashboard');
  });

  it('throws with helpful message when assignment-brief.md is missing', () => {
    expect(() =>
      ingestAssignmentFolder(
        { folderPath: join(FIXTURES, 'error-no-brief') },
        TEST_CONFIG,
      )
    ).toThrow('assignment-brief.md not found');
  });

  it('throws with field names when course config has placeholder values', () => {
    expect(() =>
      ingestAssignmentFolder(
        { folderPath: join(FIXTURES, 'error-placeholder-config') },
        TEST_CONFIG,
      )
    ).toThrow('professor');
  });

  it('adds warning when assignment-brief.md contains placeholder text', () => {
    const result = ingestAssignmentFolder(
      { folderPath: join(FIXTURES, 'warn-placeholder-brief') },
      TEST_CONFIG,
    );
    expect(result.warnings.some(w => w.includes('placeholder'))).toBe(true);
  });
});
