import { describe, expect, it } from 'vitest';
import { renderCourseHealthPage } from '../../../src/dashboard/views/course_health.js';
import type { CourseHealth } from '../../../src/dashboard/data.js';

const SAMPLE: CourseHealth[] = [
  {
    name: 'ITM 370',
    shortName: 'ITM370',
    semester: 'F26',
    courseDir: '/courses/ITM370',
    pageCount: 12,
    lastPublishedAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    transcriptCoverage: { withTranscript: 8, totalWeeks: 10 },
    health: 'green',
  },
  {
    name: 'BusApp 105',
    shortName: 'BUS105',
    semester: 'F26',
    courseDir: '/courses/BusApp105',
    pageCount: 6,
    lastPublishedAt: null,
    transcriptCoverage: { withTranscript: 0, totalWeeks: 6 },
    health: 'red',
  },
];

describe('renderCourseHealthPage', () => {
  it('renders a row per course', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: SAMPLE });
    expect(html).toContain('ITM 370');
    expect(html).toContain('BusApp 105');
    expect(html).toContain('F26');
    expect(html).toMatch(/12.*8\s*\/\s*10/s);
  });

  it('shows "never" for null lastPublishedAt', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: SAMPLE });
    expect(html).toContain('never');
  });

  it('renders empty state when zero courses', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: [] });
    expect(html).toContain('No courses found');
    expect(html).toContain('/courses');
  });

  it('HTML-escapes name and semester', () => {
    const escaped = renderCourseHealthPage({
      coursesRoot: '/courses',
      courses: [{
        ...SAMPLE[0],
        name: 'Name <evil> & "danger"',
        semester: '<F>26',
      }],
    });
    expect(escaped).toContain('Name &lt;evil&gt; &amp; &quot;danger&quot;');
    expect(escaped).toContain('&lt;F&gt;26');
  });

  it('applies green/yellow/red health classes', () => {
    const html = renderCourseHealthPage({ coursesRoot: '/courses', courses: SAMPLE });
    expect(html).toContain('health-green');
    expect(html).toContain('health-red');
  });
});
