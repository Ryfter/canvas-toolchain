import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkForCourses, buildCourseHealth, classifyHealth } from '../../src/dashboard/data.js';

let coursesRoot: string;

beforeEach(() => { coursesRoot = mkdtempSync(join(tmpdir(), 'dash-courses-')); });
afterEach(() => { rmSync(coursesRoot, { recursive: true, force: true }); });

function makeCourse(name: string, opts: { title: string; shortName: string; semester: string; pageFiles?: string[]; weekFolders?: { name: string; hasTranscript: boolean }[] }): string {
  const dir = join(coursesRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'course-config.md'),
    `---\ntitle: ${opts.title}\nshort_name: ${opts.shortName}\nsemester: ${opts.semester}\n---\n`);
  for (const f of opts.pageFiles ?? []) {
    writeFileSync(join(dir, f), '---\ntitle: P\n---\n\nbody\n');
  }
  for (const wf of opts.weekFolders ?? []) {
    mkdirSync(join(dir, wf.name), { recursive: true });
    if (wf.hasTranscript) writeFileSync(join(dir, wf.name, 'lecture.enriched.md'), 'transcript');
  }
  return dir;
}

describe('walkForCourses', () => {
  it('finds courses with course-config.md at the top level', () => {
    makeCourse('ITM370', { title: 'ITM 370', shortName: 'ITM370', semester: 'F26' });
    makeCourse('BusApp105', { title: 'BusApp 105', shortName: 'BUS105', semester: 'F26' });
    const courses = walkForCourses(coursesRoot);
    expect(courses).toHaveLength(2);
  });

  it('finds courses nested up to depth 5', () => {
    mkdirSync(join(coursesRoot, 'F26', 'sub'), { recursive: true });
    makeCourse('F26/sub/ITM370', { title: 'ITM 370', shortName: 'ITM370', semester: 'F26' });
    const courses = walkForCourses(coursesRoot);
    expect(courses).toHaveLength(1);
  });

  it('skips node_modules / .git / dist / output / publish-snapshots', () => {
    makeCourse('ITM370', { title: 'ITM 370', shortName: 'ITM370', semester: 'F26' });
    makeCourse('node_modules/lib', { title: 'Library', shortName: 'LIB', semester: 'F26' });
    const courses = walkForCourses(coursesRoot);
    expect(courses).toHaveLength(1);
  });

  it('returns empty array when no course-config.md present anywhere', () => {
    mkdirSync(join(coursesRoot, 'foo'), { recursive: true });
    expect(walkForCourses(coursesRoot)).toEqual([]);
  });
});

describe('buildCourseHealth', () => {
  it('builds CourseHealth from a course folder', () => {
    const dir = makeCourse('ITM370', {
      title: 'ITM 370',
      shortName: 'ITM370',
      semester: 'F26',
      pageFiles: ['front-page.md', 'overview.md', 'rubric.md'],
      weekFolders: [
        { name: 'week-01', hasTranscript: true },
        { name: 'week-02', hasTranscript: false },
      ],
    });
    const h = buildCourseHealth(dir);
    expect(h.name).toBe('ITM 370');
    expect(h.shortName).toBe('ITM370');
    expect(h.semester).toBe('F26');
    expect(h.pageCount).toBe(3);
    expect(h.transcriptCoverage).toEqual({ withTranscript: 1, totalWeeks: 2 });
    expect(h.lastPublishedAt).toBeNull();
    expect(['green', 'yellow', 'red']).toContain(h.health);
  });
});

describe('classifyHealth', () => {
  it('green for recent publish + high coverage', () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 86400_000).toISOString();
    expect(classifyHealth({
      lastPublishedAt: tenDaysAgo,
      transcriptCoverage: { withTranscript: 9, totalWeeks: 10 },
      now,
    })).toBe('green');
  });

  it('yellow for moderate freshness OR coverage', () => {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400_000).toISOString();
    expect(classifyHealth({
      lastPublishedAt: sixtyDaysAgo,
      transcriptCoverage: { withTranscript: 5, totalWeeks: 10 },
      now,
    })).toBe('yellow');
  });

  it('red for never-published + low coverage', () => {
    const now = new Date();
    expect(classifyHealth({
      lastPublishedAt: null,
      transcriptCoverage: { withTranscript: 1, totalWeeks: 10 },
      now,
    })).toBe('red');
  });
});
