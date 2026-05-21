import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { importCourse } from '../src/tools/import-course.js';

const archiveDir = join(import.meta.dirname, 'fixtures/canvas-backup/ITM370');

describe('importCourse — full course', () => {
  it('creates course-config.md from archive', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'course-config.md'))).toBe(true);
  });

  it('course-config.md contains course name from course.json', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const config = readFileSync(join(outDir, 'course-config.md'), 'utf-8');
    expect(config).toContain('AI Augmented Projects');
    expect(config).toContain('ITM 370');
  });

  it('creates week folder for each module', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01'))).toBe(true);
    expect(existsSync(join(outDir, 'week-02'))).toBe(true);
  });

  it('creates overview.md for Page items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'overview.md'))).toBe(true);
  });

  it('overview.md contains extracted content from page HTML', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const content = readFileSync(join(outDir, 'week-01', 'overview.md'), 'utf-8');
    expect(content).toContain('AI augmentation');
    expect(content).toContain('Learning Objectives');
  });

  it('creates resources.md for Resource-type pages', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'resources.md'))).toBe(true);
  });

  it('creates assignment-1.1.md for Assignment items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'assignment-1.1.md'))).toBe(true);
  });

  it('assignment-1.1.md contains due date and points from assignment.json', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const content = readFileSync(join(outDir, 'week-01', 'assignment-1.1.md'), 'utf-8');
    expect(content).toContain('50');
    expect(content).toContain('2026-09-05');
  });

  it('creates discussion-board.md for Discussion items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-01', 'discussion-board.md'))).toBe(true);
  });

  it('creates weekly-quiz-2.1.md for Quiz items', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(existsSync(join(outDir, 'week-02', 'weekly-quiz-2.1.md'))).toBe(true);
  });

  it('weekly-quiz-2.1.md contains [NEEDS REVIEW] for quiz question content', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir });
    const content = readFileSync(join(outDir, 'week-02', 'weekly-quiz-2.1.md'), 'utf-8');
    expect(content).toContain('[NEEDS REVIEW]');
  });

  it('returns import summary with file count', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    const result = importCourse({ archivePath: archiveDir, outputDir: outDir });
    expect(result.filesCreated).toBeGreaterThan(0);
    expect(result.weeksImported).toBe(2);
  });
});

describe('importCourse — single week', () => {
  it('creates only week-01 folder when weekNumber is 1', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir, weekNumber: 1 });
    expect(existsSync(join(outDir, 'week-01'))).toBe(true);
    expect(existsSync(join(outDir, 'week-02'))).toBe(false);
  });
});

describe('importCourse — single assignment', () => {
  it('creates assignment-1.1.md only when assignmentName is specified', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'ic-'));
    importCourse({ archivePath: archiveDir, outputDir: outDir, assignmentName: 'Assignment 1.1' });
    expect(existsSync(join(outDir, 'week-01', 'assignment-1.1.md'))).toBe(true);
    expect(existsSync(join(outDir, 'week-01', 'overview.md'))).toBe(false);
    expect(existsSync(join(outDir, 'week-01', 'resources.md'))).toBe(false);
  });
});

describe('importCourse — duplicate item handling', () => {
  let archiveWithDupes: string;
  let outDir: string;
  let result: ReturnType<typeof importCourse>;

  beforeAll(() => {
    archiveWithDupes = mkdtempSync(join(tmpdir(), 'ic-dupes-archive-'));
    const m = join(archiveWithDupes, 'manifests');
    const mod = join(archiveWithDupes, 'modules', '01-Week 1');
    const aDir = join(archiveWithDupes, 'assignments');
    mkdirSync(m, { recursive: true });
    mkdirSync(mod, { recursive: true });
    mkdirSync(aDir, { recursive: true });

    writeFileSync(join(m, 'course.json'), JSON.stringify({ id: 1, name: 'Test', course_code: 'TST 100' }));
    writeFileSync(join(m, 'modules.json'), JSON.stringify([{ id: 1, name: 'Week 1', position: 1 }]));
    writeFileSync(join(m, 'assignments.json'), JSON.stringify([
      { id: 1, name: 'HW 1', due_at: '2026-09-05T23:59:00Z', points_possible: 10, submission_types: ['online_upload'] },
      { id: 2, name: 'HW 2', due_at: '2026-09-07T23:59:00Z', points_possible: 20, submission_types: ['online_upload'] },
    ]));
    writeFileSync(join(mod, 'module.json'), JSON.stringify({ id: 1, name: 'Week 1', position: 1 }));
    writeFileSync(join(mod, 'items.json'), JSON.stringify([
      { id: 101, type: 'Assignment', title: 'HW 1', content_id: 1, position: 1 },
      { id: 102, type: 'Assignment', title: 'HW 2', content_id: 2, position: 2 },
    ]));
    writeFileSync(join(aDir, 'HW 1.html'), '<p>Homework one instructions.</p>');
    writeFileSync(join(aDir, 'HW 2.html'), '<p>Homework two instructions.</p>');

    outDir = mkdtempSync(join(tmpdir(), 'ic-dupes-out-'));
    result = importCourse({ archivePath: archiveWithDupes, outputDir: outDir, weekNumber: 1 });
  });

  it('writes assignment-1.1.md for the first assignment', () => {
    expect(existsSync(join(outDir, 'week-01', 'assignment-1.1.md'))).toBe(true);
  });

  it('writes assignment-1.2.md for the second assignment', () => {
    expect(existsSync(join(outDir, 'week-01', 'assignment-1.2.md'))).toBe(true);
  });

  it('does not produce a warning for multiple assignments (indexed naming is expected)', () => {
    expect(result.warnings.filter(w => w.includes('assignment')).length).toBe(0);
  });
});

describe('importCourse — engage assignment detection', () => {
  let engageArchive: string;
  let outDir: string;

  beforeAll(() => {
    engageArchive = mkdtempSync(join(tmpdir(), 'ic-engage-archive-'));
    const m = join(engageArchive, 'manifests');
    const mod = join(engageArchive, 'modules', '01-Week 1');
    const aDir = join(engageArchive, 'assignments');
    mkdirSync(m, { recursive: true });
    mkdirSync(mod, { recursive: true });
    mkdirSync(aDir, { recursive: true });

    writeFileSync(join(m, 'course.json'), JSON.stringify({ id: 1, name: 'Test', course_code: 'TST 100' }));
    writeFileSync(join(m, 'modules.json'), JSON.stringify([{ id: 1, name: 'Week 1', position: 1 }]));
    writeFileSync(join(m, 'assignments.json'), JSON.stringify([
      { id: 1, name: 'Assignment 1.1',         due_at: '2026-09-05T23:59:00Z', points_possible: 50, submission_types: ['online_upload'] },
      { id: 2, name: 'Engage Assignment 1.1',  due_at: '2026-09-07T23:59:00Z', points_possible: 25, submission_types: ['online_upload'] },
      { id: 3, name: 'Project 1.1',            due_at: '2026-09-08T23:59:00Z', points_possible: 100, submission_types: ['online_upload'] },
      { id: 4, name: 'Technical Assignment 1.1', due_at: '2026-09-09T23:59:00Z', points_possible: 40, submission_types: ['online_upload'] },
    ]));
    writeFileSync(join(mod, 'module.json'), JSON.stringify({ id: 1, name: 'Week 1', position: 1 }));
    writeFileSync(join(mod, 'items.json'), JSON.stringify([
      { id: 101, type: 'Assignment', title: 'Assignment 1.1',           content_id: 1, position: 1 },
      { id: 102, type: 'Assignment', title: 'Engage Assignment 1.1',    content_id: 2, position: 2 },
      { id: 103, type: 'Assignment', title: 'Project 1.1',              content_id: 3, position: 3 },
      { id: 104, type: 'Assignment', title: 'Technical Assignment 1.1', content_id: 4, position: 4 },
    ]));
    writeFileSync(join(aDir, 'Assignment 1.1.html'),           '<p>Main assignment.</p>');
    writeFileSync(join(aDir, 'Engage Assignment 1.1.html'),    '<p>Engage activity.</p>');
    writeFileSync(join(aDir, 'Project 1.1.html'),              '<p>Project work.</p>');
    writeFileSync(join(aDir, 'Technical Assignment 1.1.html'), '<p>Technical work.</p>');

    outDir = mkdtempSync(join(tmpdir(), 'ic-engage-out-'));
    importCourse({ archivePath: engageArchive, outputDir: outDir, weekNumber: 1 });
  });

  it('routes regular assignments to assignment-N.M.md', () => {
    expect(existsSync(join(outDir, 'week-01', 'assignment-1.1.md'))).toBe(true);
  });

  it('routes engage assignments to engage-assignment-N.M.md', () => {
    expect(existsSync(join(outDir, 'week-01', 'engage-assignment-1.1.md'))).toBe(true);
  });

  it('routes project assignments to proj-assignment-N.M.md', () => {
    expect(existsSync(join(outDir, 'week-01', 'proj-assignment-1.1.md'))).toBe(true);
  });

  it('routes technical assignments to tech-assignment-N.M.md', () => {
    expect(existsSync(join(outDir, 'week-01', 'tech-assignment-1.1.md'))).toBe(true);
  });

  it('each type uses its own counter independently', () => {
    expect(existsSync(join(outDir, 'week-01', 'assignment-1.2.md'))).toBe(false);
    expect(existsSync(join(outDir, 'week-01', 'engage-assignment-1.2.md'))).toBe(false);
  });
});
