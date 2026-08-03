import { describe, test, expect } from 'vitest';
import { findMostRecentPrior } from '../../src/kb/trajectory.js';

// Semesters are appended to config.semesters as they are registered, so array
// order is chronological. Two registrations inside the same millisecond produce
// identical registeredAt strings — routine on a fast CI runner, where this
// surfaced as `mostRecent` resolving to the OLDEST semester.
describe('findMostRecentPrior', () => {
  test('picks the later registration when timestamps differ', () => {
    expect(
      findMostRecentPrior('Spring2026', [
        { id: 'Spring2025', registeredAt: '2026-01-01T00:00:00.000Z' },
        { id: 'Fall2025', registeredAt: '2026-01-01T00:00:01.000Z' },
      ]),
    ).toBe('Fall2025');
  });

  test('breaks a same-millisecond tie toward the later registration', () => {
    const sameInstant = '2026-01-01T00:00:00.000Z';
    expect(
      findMostRecentPrior('Spring2026', [
        { id: 'Spring2025', registeredAt: sameInstant },
        { id: 'Fall2025', registeredAt: sameInstant },
      ]),
    ).toBe('Fall2025');
  });

  test('excludes the current semester and returns null when nothing else remains', () => {
    expect(
      findMostRecentPrior('Spring2026', [
        { id: 'Spring2026', registeredAt: '2026-01-01T00:00:00.000Z' },
      ]),
    ).toBeNull();
    expect(findMostRecentPrior('Spring2026', [])).toBeNull();
  });
});
