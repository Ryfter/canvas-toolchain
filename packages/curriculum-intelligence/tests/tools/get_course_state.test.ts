import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupCourse } from '../../src/tools/setup_course.js';
import { getCourseState } from '../../src/tools/get_course_state.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'ci-home-'));
  process.env.CURRICULUM_INTELLIGENCE_HOME = tmpHome;
});

afterEach(() => {
  delete process.env.CURRICULUM_INTELLIGENCE_HOME;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('get_course_state', () => {
  test('returns empty state when no courses are registered', () => {
    const state = getCourseState();
    expect(state.courses).toEqual([]);
  });

  test('returns registered courses with their config and disk paths', () => {
    setupCourse({ id: 'ITM370', title: 'AI-Augmented Projects' });
    setupCourse({ id: 'ITM410', title: 'Capstone' });

    const state = getCourseState();
    expect(state.courses).toHaveLength(2);

    const itm370 = state.courses.find((c) => c.id === 'ITM370');
    expect(itm370).toBeDefined();
    expect(itm370!.title).toBe('AI-Augmented Projects');
    expect(itm370!.coursePath).toContain('ITM370');
    expect(itm370!.semesters).toEqual([]);
    expect(itm370!.rssFeedCount).toBe(0);
  });

  test('returns details for a single course when id is supplied', () => {
    setupCourse({ id: 'ITM370', title: 'AI-Augmented Projects' });

    const state = getCourseState({ id: 'ITM370' });
    expect(state.courses).toHaveLength(1);
    expect(state.courses[0].id).toBe('ITM370');
  });

  test('throws when a specific course id is not registered', () => {
    expect(() => getCourseState({ id: 'NOPE' })).toThrow(/not registered/i);
  });
});
