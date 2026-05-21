import { describe, expect, it } from 'vitest';
import type { CanvasCourse } from '../src/types.js';
import {
  courseCoordinatorGotcha,
  ferpaGotcha,
  titleCollisionGotcha,
  tokenScopeGotcha,
  versionControlTip,
} from '../src/tools/gotchas.js';

describe('gotchas', () => {
  it('detects coordinator-like courses with no students', () => {
    const course: CanvasCourse = {
      id: 1,
      name: 'ITM Coordination Shell',
      total_students: 0,
      teachers: [{ display_name: 'A' }],
    };

    const message = courseCoordinatorGotcha(course);

    expect(message).toContain('0 students');
    expect(message).toContain('1 teacher');
  });

  it('detects coordinator-like courses with many teachers', () => {
    const course: CanvasCourse = {
      id: 2,
      name: 'ITM Coordination Shell',
      total_students: 25,
      teachers: [{ display_name: 'A' }, { display_name: 'B' }, { display_name: 'C' }],
    };

    const message = courseCoordinatorGotcha(course);

    expect(message).toContain('25 students');
    expect(message).toContain('3 teachers');
  });

  it('uses enrollment data when teacher and student totals are absent', () => {
    const course: CanvasCourse = {
      id: 3,
      name: 'Enrollment Only Shell',
      enrollments: [
        { type: 'teacher' },
        { role: 'TeacherEnrollment' },
        { role: 'StudentEnrollment' },
      ],
    };

    const message = courseCoordinatorGotcha(course);

    expect(message).toBeUndefined();
  });

  it('does not warn for normal courses', () => {
    const course: CanvasCourse = {
      id: 4,
      name: 'ITM 310',
      total_students: 28,
      teachers: [{ display_name: 'Dr. Rank' }],
    };

    expect(courseCoordinatorGotcha(course)).toBeUndefined();
  });

  it('formats title collision options', () => {
    const message = titleCollisionGotcha('Old Title', 'New Title', 0.84);

    expect(message).toContain('similar title already exists');
    expect(message).toContain('collisionAction: "update"');
    expect(message).toContain('collisionAction: "create"');
    expect(message).toContain('collisionAction: "related"');
    expect(message).toContain('collisionAction: "cancel"');
  });

  it('formats FERPA warning with line number', () => {
    const message = ferpaGotcha('possible student ID', 34);

    expect(message).toContain('line 34');
    expect(message).toContain('FERPA');
    expect(message).toContain('skipFerpaCheck: true');
  });

  it('formats role-aware token permission hint against the Canvas URL', () => {
    const message = tokenScopeGotcha('https://boisestate.instructure.com/');

    expect(message).toContain('Canvas API token or Canvas role');
    expect(message).toContain('https://boisestate.instructure.com/profile/settings');
  });

  it('returns the version control tip', () => {
    expect(versionControlTip()).toContain('Git is the right tool');
  });
});
