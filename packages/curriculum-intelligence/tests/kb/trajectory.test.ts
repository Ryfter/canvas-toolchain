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
