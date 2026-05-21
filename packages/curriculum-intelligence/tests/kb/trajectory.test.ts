import { describe, expect, test } from 'vitest';
import { computeTrajectoryFlag } from '../../src/kb/trajectory.js';
import type { Verdict } from '../../src/types.js';

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
