import { afterEach, beforeEach, describe, expect, it, test } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupCourse } from '../../src/tools/setup_course.js';
import { analyzeCourse } from '../../src/tools/analyze_course.js';
import { getHistoryPath, readEntries } from '../../src/kb/trajectory.js';
import type { LlmClient } from '../../src/llm/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIX_ARCHIVE = join(__dirname, '..', 'fixtures', 'canvas-archive-tiny');

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-ac-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'AC101', title: 'Analyze Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('CI analyzeCourse', () => {
  test('returns a report and appends one trajectory entry', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.semesterId).toBe('Spring2026');
    expect(result.perAssignment).toBeInstanceOf(Array);
    expect(result.perConcept).toBeUndefined();
    expect(result.trajectoryEntry.semesterId).toBe('Spring2026');
    expect(existsSync(getHistoryPath('AC101'))).toBe(true);
    expect(result.historyPath).toBeTruthy();
    expect(result.historyPath.endsWith('history.jsonl')).toBe(true);

    const entries = readEntries('AC101');
    expect(entries).toHaveLength(1);
    expect(entries[0].semesterId).toBe('Spring2026');
  });

  test('perAssignment topic strings match the archive assignment names', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    for (const row of result.perAssignment) {
      expect(typeof row.topic).toBe('string');
      expect(row.topic.length).toBeGreaterThan(0);
    }
  });

  test('second analyze on a different semester appends a second entry', async () => {
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Fall2025', archivePath: FIX_ARCHIVE });
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE });
    const entries = readEntries('AC101');
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.semesterId)).toEqual(['Fall2025', 'Spring2026']);
  });

  test('priorSemesters is null on first run', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.trajectoryEntry.priorSemesters.sameSeason).toBeNull();
    expect(result.trajectoryEntry.priorSemesters.mostRecent).toBeNull();
  });

  test('priorSemesters resolved on subsequent runs', async () => {
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Spring2025', archivePath: FIX_ARCHIVE });
    await analyzeCourse({ courseId: 'AC101', semesterId: 'Fall2025', archivePath: FIX_ARCHIVE });
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.trajectoryEntry.priorSemesters.sameSeason).toBe('Spring2025');
    expect(result.trajectoryEntry.priorSemesters.mostRecent).toBe('Fall2025');
  });

  test('verdict counts cover all four verdict types', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    const v = result.trajectoryEntry.verdicts;
    expect(typeof v.KEEP).toBe('number');
    expect(typeof v.UPDATE).toBe('number');
    expect(typeof v.DROP).toBe('number');
    expect(typeof v.ADD).toBe('number');
  });

  test('diff is null on first run for each course', async () => {
    const result = await analyzeCourse({
      courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    });
    expect(result.trajectoryEntry.diff.sameSeason).toBeNull();
    expect(result.trajectoryEntry.diff.mostRecent).toBeNull();
  });
});

function mockLlm(response: string): LlmClient {
  return { complete: async () => response };
}

const CONCEPT_RESPONSE = JSON.stringify({
  concepts: [{ name: 'Test Concept', relatedAssignments: [] }],
});

test('perConcept populated when extractConcepts=true and llmClient provided', async () => {
  const result = await analyzeCourse({
    courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    extractConcepts: true, llmClient: mockLlm(CONCEPT_RESPONSE),
  });
  expect(result.perConcept).toBeDefined();
  expect(result.perConcept!.length).toBeGreaterThan(0);
  expect(result.trajectoryEntry.perConcept).toBeDefined();
});

test('perConcept omitted when extractConcepts=true but llmClient missing', async () => {
  const result = await analyzeCourse({
    courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    extractConcepts: true,
  });
  expect(result.perConcept).toBeUndefined();
  expect(result.trajectoryEntry.perConcept).toBeUndefined();
});

test('concept extraction failures degrade silently', async () => {
  const failingClient: LlmClient = { complete: async () => { throw new Error('rate limit'); } };
  const result = await analyzeCourse({
    courseId: 'AC101', semesterId: 'Spring2026', archivePath: FIX_ARCHIVE,
    extractConcepts: true, llmClient: failingClient,
  });
  expect(result.perConcept).toBeUndefined();
  expect(result.perAssignment.length).toBeGreaterThan(0);
});

describe('tier-assignment phase (courseDir provided)', () => {
  it('iterates pages in courseDir and writes tiers block to each', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const courseDir = mkdtempSync(join(tmpdir(), 'ac-tier-'));
    try {
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      writeFileSync(join(courseDir, 'week-05', 'assignment.md'),
        '---\ntitle: W5\n---\n\n## Due Date\n\nOct 17\n\n## Rubric\n\nQuality stuff.\n');
      writeFileSync(join(courseDir, 'course-config.md'), '---\ntitle: ITM 370\n---\n');

      const fakeLlm = {
        async complete(_sys: string, _user: string) {
          return {
            text: JSON.stringify({
              sections: [
                { heading: 'Due Date', tier: 1, summary: 'Oct 17' },
                { heading: 'Rubric', tier: 3, summary: 'Quality' },
              ],
            }),
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        },
      };

      const result = await runAnalyzeCourseWithTierPhase({
        courseDir,
        llm: fakeLlm,
      });

      const updated = readFileSync(join(courseDir, 'week-05', 'assignment.md'), 'utf-8');
      expect(updated).toContain('tiers:');
      expect(updated).toContain('Due Date');
      expect(updated).toContain('Oct 17');
      expect(result.tierAssignments).toBeDefined();
      expect(result.tierAssignments!.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });

  it('skips pages with tiers.locked: true', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const courseDir = mkdtempSync(join(tmpdir(), 'ac-locked-'));
    try {
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      writeFileSync(join(courseDir, 'week-05', 'locked.md'),
        '---\ntitle: T\ntiers:\n  locked: true\n  sections:\n    - heading: Manual\n      tier: 1\n      summary: do not touch\n---\n\n## Due Date\n\nOct 17\n');

      const fakeLlm = {
        async complete(_sys: string, _user: string) {
          return { text: JSON.stringify({ sections: [{ heading: 'Due Date', tier: 1, summary: 'NEW' }] }), usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };

      await runAnalyzeCourseWithTierPhase({ courseDir, llm: fakeLlm });

      const updated = readFileSync(join(courseDir, 'week-05', 'locked.md'), 'utf-8');
      expect(updated).toContain('do not touch');
      expect(updated).not.toContain('NEW');
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });

  it('skips course-config.md', async () => {
    const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const courseDir = mkdtempSync(join(tmpdir(), 'ac-cfg-'));
    try {
      writeFileSync(join(courseDir, 'course-config.md'),
        '---\ntitle: ITM 370\n---\n\n## Heading\n\nbody\n');

      const fakeLlm = {
        async complete(_sys: string, _user: string) {
          return { text: JSON.stringify({ sections: [{ heading: 'Heading', tier: 1, summary: 'SHOULD NOT APPEAR' }] }), usage: { inputTokens: 1, outputTokens: 1 } };
        },
      };

      await runAnalyzeCourseWithTierPhase({ courseDir, llm: fakeLlm });

      const updated = readFileSync(join(courseDir, 'course-config.md'), 'utf-8');
      expect(updated).not.toContain('tiers:');
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });
});

async function runAnalyzeCourseWithTierPhase(input: { courseDir: string; llm: any }): Promise<{ tierAssignments?: Array<{ relPath: string; tiers: any }>; tierWarnings?: string[] }> {
  const { runTierPhase } = await import('../../src/tools/analyze_course.js');
  return await runTierPhase({ courseDir: input.courseDir, llm: input.llm });
}
