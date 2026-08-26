import { describe, it, expect } from 'vitest';
import { resolveCourseWeeks, resolveSpotCheckWeeks } from '../../../src/tools/shell_ready/weeks.js';

describe('resolveCourseWeeks', () => {
  const termStartMonday = '2026-08-24'; // Week 1 Monday

  it('infers week indices from Week N titles', () => {
    const { weeks, summary } = resolveCourseWeeks({
      termStartMonday,
      modules: [
        { id: 10, name: 'Week 1 — Intro' },
        { id: 20, name: 'Week 02' },
        { id: 30, name: 'Resources' },
      ],
    });
    expect(summary.method).toBe('hybrid');
    expect(summary.inferredWeekCount).toBeGreaterThanOrEqual(2);
    const w1 = weeks.find(w => w.index === 1);
    const w2 = weeks.find(w => w.index === 2);
    expect(w1?.moduleIds).toEqual([10]);
    expect(w1?.provenance).toBe('inferred');
    expect(w1?.monday).toBe('2026-08-24');
    expect(w1?.sunday).toBe('2026-08-30');
    expect(w2?.moduleIds).toEqual([20]);
    expect(w2?.monday).toBe('2026-08-31');
    expect(w2?.sunday).toBe('2026-09-06');
  });

  it('lets overrides win over inference for that index', () => {
    const { weeks } = resolveCourseWeeks({
      termStartMonday,
      modules: [
        { id: 10, name: 'Week 2 — Old' },
        { id: 99, name: 'Special' },
      ],
      overrides: [{ index: 2, moduleIds: [99], label: 'Override week' }],
    });
    const w2 = weeks.find(w => w.index === 2);
    expect(w2?.moduleIds).toEqual([99]);
    expect(w2?.provenance).toBe('override');
    expect(w2?.label).toBe('Override week');
  });
});

describe('resolveSpotCheckWeeks', () => {
  const termStartMonday = '2026-08-24';

  it('maps Saturday in week 1 to secondary=2 primary=3', () => {
    const { weeks } = resolveCourseWeeks({
      termStartMonday,
      modules: [
        { id: 1, name: 'Week 1' },
        { id: 2, name: 'Week 2' },
        { id: 3, name: 'Week 3' },
      ],
    });
    const spot = resolveSpotCheckWeeks({
      termStartMonday,
      asOfDate: '2026-08-29', // Saturday of week 1
      courseWeeks: weeks,
    });
    expect(spot.currentWeekIndex).toBe(1);
    expect(spot.secondaryWeek.index).toBe(2);
    expect(spot.secondaryWeek.depth).toBe('lighter');
    expect(spot.secondaryWeek.role).toBe('secondary');
    expect(spot.primaryWeek.index).toBe(3);
    expect(spot.primaryWeek.depth).toBe('thorough');
    expect(spot.primaryWeek.role).toBe('primary');
    expect(spot.primaryWeek.monday).toBe('2026-09-07');
    expect(spot.primaryWeek.sunday).toBe('2026-09-13');
  });
});
