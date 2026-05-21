import { describe, expect, test } from 'vitest';
import { computeTrajectoryFlag } from '../../src/kb/trajectory.js';
import type { Verdict } from '../../src/types.js';
import {
  computeChurnRate, identifyUnstableTopics, identifyTrueEvergreens,
} from '../../src/kb/trajectory.js';
import type { TrajectoryEntry, PerTopicTrajectory } from '../../src/types.js';

describe('computeTrajectoryFlag', () => {
  test('new — single verdict on record', () => {
    expect(computeTrajectoryFlag(['KEEP'])).toBe('new');
  });

  test('true-evergreen — 4+ consecutive KEEP', () => {
    expect(computeTrajectoryFlag(['KEEP', 'KEEP', 'KEEP', 'KEEP'])).toBe('true-evergreen');
    expect(computeTrajectoryFlag(['KEEP', 'KEEP', 'KEEP', 'KEEP', 'KEEP'])).toBe('true-evergreen');
  });

  test('stable — unchanged over 2-3 runs, not yet 4', () => {
    expect(computeTrajectoryFlag(['KEEP', 'KEEP'])).toBe('stable');
    expect(computeTrajectoryFlag(['UPDATE', 'UPDATE', 'UPDATE'])).toBe('stable');
  });

  test('stable — 4+ unchanged but not KEEP (not true-evergreen)', () => {
    expect(computeTrajectoryFlag(['UPDATE', 'UPDATE', 'UPDATE', 'UPDATE'])).toBe('stable');
  });

  test('stabilising — changed once over last 3 runs', () => {
    expect(computeTrajectoryFlag(['KEEP', 'UPDATE', 'UPDATE'])).toBe('stabilising');
    expect(computeTrajectoryFlag(['UPDATE', 'KEEP', 'KEEP'])).toBe('stabilising');
  });

  test('unstable — changed >=2 times in last 4 runs', () => {
    expect(computeTrajectoryFlag(['KEEP', 'UPDATE', 'KEEP', 'UPDATE'])).toBe('unstable');
    expect(computeTrajectoryFlag(['KEEP', 'UPDATE', 'KEEP'])).toBe('unstable');
  });

  test('considers only last 4 verdicts for unstable detection', () => {
    // 5 old changes ignored, last 4 are stable KEEPs
    const history: Verdict[] = ['UPDATE', 'KEEP', 'UPDATE', 'KEEP', 'KEEP', 'KEEP', 'KEEP', 'KEEP'];
    expect(computeTrajectoryFlag(history)).toBe('true-evergreen');
  });
});

function makeEntry(semester: string, perAssignment: PerTopicTrajectory[]): TrajectoryEntry {
  return {
    schemaVersion: 1,
    timestamp: `2026-01-01T00:00:00.000Z`,
    courseId: 'TEST',
    semesterId: semester,
    priorSemesters: { sameSeason: null, mostRecent: null },
    assignmentCount: perAssignment.length,
    verdicts: { KEEP: 0, UPDATE: 0, DROP: 0, ADD: 0 },
    perAssignment,
    diff: { sameSeason: null, mostRecent: null },
  };
}

function pt(topic: string, history: Verdict[]): PerTopicTrajectory {
  return {
    topic, verdict: history[history.length - 1], currencyClass: 'current',
    newsHitCount: 0, trajectoryFlag: 'new', verdictPrior: null,
    verdictHistory: history,
  };
}

describe('computeChurnRate', () => {
  test('zero churn when verdicts unchanged across runs', () => {
    const entries = [
      makeEntry('S25', [pt('A', ['KEEP']), pt('B', ['KEEP'])]),
      makeEntry('F25', [pt('A', ['KEEP', 'KEEP']), pt('B', ['KEEP', 'KEEP'])]),
      makeEntry('S26', [pt('A', ['KEEP', 'KEEP', 'KEEP']), pt('B', ['KEEP', 'KEEP', 'KEEP'])]),
    ];
    expect(computeChurnRate(entries)).toBe(0);
  });

  test('half churn when half the topics change verdict each run', () => {
    const entries = [
      makeEntry('S25', [pt('A', ['KEEP']), pt('B', ['KEEP'])]),
      makeEntry('F25', [pt('A', ['KEEP', 'UPDATE']), pt('B', ['KEEP', 'KEEP'])]),
    ];
    // 1 of 2 topics changed = 0.5 churn between S25 and F25; averaged = 0.5
    expect(computeChurnRate(entries)).toBe(0.5);
  });

  test('zero churn when only one entry exists', () => {
    const entries = [makeEntry('S25', [pt('A', ['KEEP'])])];
    expect(computeChurnRate(entries)).toBe(0);
  });
});

describe('identifyUnstableTopics', () => {
  test('returns topics with >=2 verdict changes in last 4 runs', () => {
    const entries = [
      makeEntry('S26', [
        pt('Stable', ['KEEP', 'KEEP', 'KEEP', 'KEEP']),
        pt('Unstable', ['KEEP', 'UPDATE', 'KEEP', 'UPDATE']),
      ]),
    ];
    expect(identifyUnstableTopics(entries)).toEqual(['Unstable']);
  });
});

describe('identifyTrueEvergreens', () => {
  test('returns topics with KEEP across last 4+ consecutive runs', () => {
    const entries = [
      makeEntry('S26', [
        pt('Ever', ['KEEP', 'KEEP', 'KEEP', 'KEEP']),
        pt('Recent', ['UPDATE', 'KEEP', 'KEEP']),
      ]),
    ];
    expect(identifyTrueEvergreens(entries)).toEqual(['Ever']);
  });
});

import { afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEntry, readEntries, getHistoryPath } from '../../src/kb/trajectory.js';
import { setupCourse } from '../../src/tools/setup_course.js';

let tmpHome: string;
beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-traj-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
  setupCourse({ id: 'TRJ101', title: 'Trajectory Test' });
});
afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('trajectory log read/write', () => {
  test('round-trip — append then read', () => {
    const entry = makeEntry('S26', [pt('A', ['KEEP'])]);
    entry.courseId = 'TRJ101';
    appendEntry(entry);
    const read = readEntries('TRJ101');
    expect(read).toHaveLength(1);
    expect(read[0].semesterId).toBe('S26');
  });

  test('multiple appends preserve order', () => {
    const e1 = makeEntry('S25', [pt('A', ['KEEP'])]); e1.courseId = 'TRJ101';
    const e2 = makeEntry('F25', [pt('A', ['KEEP', 'KEEP'])]); e2.courseId = 'TRJ101';
    const e3 = makeEntry('S26', [pt('A', ['KEEP', 'KEEP', 'KEEP'])]); e3.courseId = 'TRJ101';
    appendEntry(e1); appendEntry(e2); appendEntry(e3);
    const read = readEntries('TRJ101');
    expect(read.map((e) => e.semesterId)).toEqual(['S25', 'F25', 'S26']);
  });

  test('readEntries respects lookback', () => {
    for (const s of ['S24', 'F24', 'S25', 'F25', 'S26']) {
      const e = makeEntry(s, [pt('A', ['KEEP'])]); e.courseId = 'TRJ101';
      appendEntry(e);
    }
    expect(readEntries('TRJ101', 2).map((e) => e.semesterId)).toEqual(['F25', 'S26']);
  });

  test('readEntries on empty/missing course returns []', () => {
    expect(readEntries('NEVER_EXISTED')).toEqual([]);
  });

  test('getHistoryPath returns the expected location', () => {
    const p = getHistoryPath('TRJ101');
    expect(p.endsWith(join('courses', 'TRJ101', 'history.jsonl'))).toBe(true);
  });
});
