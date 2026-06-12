import { describe, it, expect } from 'vitest';
import { renderPage } from '../../src/tools/course-templates.js';
import type { PageContent, CourseConfig } from '../../src/course-types.js';

const cfg = {
  institution: 'Example U', courseName: 'X', courseNumber: '101', professor: 'Dr. Smith',
  semester: 'Fall 2026', weeks: 16, pageTypes: ['oral-assessment'], layoutFixed: true,
  colors: { primary: '#0033A0', primaryDark: '#001F60', primaryLight: '#E6ECF9', secondary: '#F18F01' },
  heroImages: {}, weekOutline: [],
} as unknown as CourseConfig;

const content = {
  pageType: 'oral-assessment',
  frontMatter: { week: 4, title: 'Concept Check', prep_seconds: 30, response_seconds: 120, randomize_pick: 1, randomize_of: 3, attempts: '1', launch_url: 'https://r.edu/lti/launch' },
  sections: { 'What to expect': 'Explain opportunity cost aloud.' },
} as unknown as PageContent;

describe('renderPage(oral-assessment)', () => {
  it('renders a what-to-expect card, timing, and a launch button', () => {
    const html = renderPage(content, cfg);
    expect(html).toContain('What to expect');
    expect(html).toContain('Explain opportunity cost aloud.');
    expect(html).toContain('2:00');           // response time formatted
    expect(html).toContain('1 of 3');          // randomization
    expect(html.toLowerCase()).toContain('launch');
    expect(html).toContain('https://r.edu/lti/launch');
  });
});
