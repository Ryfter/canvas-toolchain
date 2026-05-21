import { describe, it, expect } from 'vitest';
import { parsePageContent, renderPage } from '../src/tools/course-templates.js';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { CourseConfig } from '../src/course-types.js';

function makeConfig(overrides: Partial<CourseConfig> = {}): CourseConfig {
  return {
    institution: 'Boise State University',
    courseName: 'AI Augmented Projects',
    courseNumber: 'ITM 370',
    professor: 'Dr. Rank',
    semester: 'Fall 2026',
    weeks: 4,
    pageTypes: ['overview'],
    layoutFixed: true,
    colors: { primary: '#0033A0', primaryDark: '#002277', primaryLight: '#E6ECF9', secondary: '#D64309' },
    heroImages: {},
    weekOutline: [],
    ...overrides,
  };
}

function writeTmp(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
  const p = join(dir, 'page.md');
  writeFileSync(p, content, 'utf-8');
  return p;
}

describe('parsePageContent', () => {
  it('reads front matter fields', () => {
    const p = writeTmp(`---
week: 3
title: Week 3 Overview
hero_image: https://example.com/hero.jpg
---

## Learning Objectives
- Understand AI tools
`);
    const content = parsePageContent(p, 'overview');
    expect(content.frontMatter.week).toBe(3);
    expect(content.frontMatter.title).toBe('Week 3 Overview');
    expect(content.frontMatter.heroImage).toBe('https://example.com/hero.jpg');
  });

  it('reads section content', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
---

## Learning Objectives
- Be awesome

## Introduction
Great intro text.

## Activities
- Do stuff
`);
    const content = parsePageContent(p, 'overview');
    expect(content.sections['Learning Objectives']).toContain('Be awesome');
    expect(content.sections['Introduction']).toContain('Great intro text');
    expect(content.sections['Activities']).toContain('Do stuff');
  });
});

describe('renderPage', () => {
  const config = makeConfig();

  it('renders without <style> blocks', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn stuff\n\n## Introduction\nHello.\n\n## Activities\n- Read\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('<style');
  });

  it('renders without <script> tags', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('<script');
  });

  it('renders without <h1> tags', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('<h1');
  });

  it('renders without box-shadow', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).not.toContain('box-shadow');
  });

  it('uses institution primary color in overview', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).toContain('#0033A0');
  });

  it('renders course number in overview hero', () => {
    const p = writeTmp(`---\nweek: 2\ntitle: "Foundations"\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).toContain('ITM 370');
    expect(html).toContain('Week 02');
  });

  it('uses font-family Lato throughout', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Learning Objectives\n- Learn\n\n## Introduction\nHi.\n\n## Activities\n- Do\n`);
    const content = parsePageContent(p, 'overview');
    const html = renderPage(content, config);
    expect(html).toContain('Lato');
  });

  it('renders resources page with slides section', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\n---\n\n## Slides\n- [Week 1 Slides](https://slides.com)\n\n## Videos\n- Panopto ID: abc-123\n\n## Readings\n- [Article](https://article.com)\n\n## Other\n- Quiz opens Monday\n`);
    const content = parsePageContent(p, 'resources');
    const html = renderPage(content, config);
    expect(html).toContain('Slides');
    expect(html).toContain('Videos');
    expect(html).toContain('Readings');
  });

  it('renders assignment page with brief and rubric', () => {
    const p = writeTmp(`---\nweek: 1\ntitle: ""\nhero_image: ""\nassignment_number: "1.1"\ndue: "Friday"\npoints: 50\n---\n\n## Brief\nBuild something cool.\n\n## Rubric\n- Criteria 1: 25 pts\n\n## Submission Details\n- Submit to Canvas\n`);
    const content = parsePageContent(p, 'assignment');
    const html = renderPage(content, config);
    expect(html).toContain('Brief');
    expect(html).toContain('Rubric');
    expect(html).toContain('50');
  });

  it('renders all 15 page types without throwing', () => {
    const pageTypes = [
      'front-page', 'overview', 'resources', 'slides', 'videos',
      'assignment', 'engage-assignment', 'proj-assignment', 'tech-assignment',
      'reading', 'reading-quiz',
      'weekly-quiz', 'lab', 'discussion-board', 'extra-credit', 'custom',
    ] as const;
    for (const pt of pageTypes) {
      const p = writeTmp(`---\nweek: 1\ntitle: "Test"\nhero_image: ""\n---\n\n## Section\nContent here.\n`);
      const content = parsePageContent(p, pt);
      expect(() => renderPage(content, config)).not.toThrow();
    }
  });

  it('renders proj-assignment page with Brief and Rubric sections', () => {
    const p = writeTmp(`---
week: 1
title: "Project 1.1"
hero_image: ""
assignment_number: "ITM370.01"
due: "2026-09-12"
points: 100
team: false
timeline: true
---

## Brief
Build an AI-augmented workflow tool.

## Timeline
| Milestone | Due |
|---|---|
| Draft | 2026-09-05 |
| Final | 2026-09-12 |

## Rubric
- Research: 50 pts
- Presentation: 50 pts

## Submission Details
- Submit to Canvas Assignments
`);
    const content = parsePageContent(p, 'proj-assignment');
    const html = renderPage(content, config);
    expect(html).toContain('Brief');
    expect(html).toContain('Rubric');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<h1');
  });

  it('renders proj-assignment Timeline section when timeline: true', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
assignment_number: "ITM370.01"
due: ""
points: 0
team: false
timeline: true
---

## Brief
Do the project.

## Timeline
| Milestone | Due |
|---|---|
| Draft | Monday |

## Submission Details
Submit to Canvas.
`);
    const content = parsePageContent(p, 'proj-assignment');
    expect(content.frontMatter.timeline).toBe(true);
    const html = renderPage(content, config);
    expect(html).toContain('Project Timeline');
    expect(html).toContain('Monday');
  });

  it('does not render Timeline section when timeline: false', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
assignment_number: "ITM370.01"
due: ""
points: 0
team: false
timeline: false
---

## Brief
No timeline here.

## Submission Details
Submit to Canvas.
`);
    const content = parsePageContent(p, 'proj-assignment');
    expect(content.frontMatter.timeline).toBe(false);
    const html = renderPage(content, config);
    expect(html).not.toContain('Project Timeline');
  });

  it('renders proj-assignment Team section when team: true', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
assignment_number: "ITM370.01"
due: ""
points: 0
team: true
timeline: false
---

## Brief
Work together.

## Team
Groups of 3. One submission per group.

## Submission Details
Submit to Canvas.
`);
    const content = parsePageContent(p, 'proj-assignment');
    expect(content.frontMatter.team).toBe(true);
    const html = renderPage(content, config);
    expect(html).toContain('Team');
    expect(html).toContain('Groups of 3');
  });

  it('does not render Team section when team: false', () => {
    const p = writeTmp(`---
week: 1
title: ""
hero_image: ""
assignment_number: "ITM370.01"
due: ""
points: 0
team: false
timeline: false
---

## Brief
Solo work.

## Team
This should not appear.

## Submission Details
Submit to Canvas.
`);
    const content = parsePageContent(p, 'proj-assignment');
    expect(content.frontMatter.team).toBe(false);
    const html = renderPage(content, config);
    expect(html).not.toContain('This should not appear');
  });

  it('renders tech-assignment page with Setup and Tasks sections', () => {
    const p = writeTmp(`---
week: 2
title: "Tech Assignment 2.1"
hero_image: ""
assignment_number: "ITM370.02"
due: "2026-09-19"
points: 50
team: false
---

## Brief
Configure a local AI dev environment.

## Setup
Install Node.js 20 and VS Code.

## Tasks
1. Install Node.js
2. Install VS Code
3. Run hello world

## Deliverable
Screenshot of terminal output.

## Rubric
- Completion: 50 pts
`);
    const content = parsePageContent(p, 'tech-assignment');
    const html = renderPage(content, config);
    expect(html).toContain('Brief');
    expect(html).toContain('Setup');
    expect(html).toContain('Tasks');
    expect(html).toContain('Deliverable');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<h1');
  });

  it('renders tech-assignment Team section when team: true', () => {
    const p = writeTmp(`---
week: 2
title: ""
hero_image: ""
assignment_number: "ITM370.02"
due: ""
points: 0
team: true
---

## Brief
Pair exercise.

## Tasks
1. Do step one together.

## Team
Work in pairs. Both names on submission.

## Deliverable
ZIP file.
`);
    const content = parsePageContent(p, 'tech-assignment');
    expect(content.frontMatter.team).toBe(true);
    const html = renderPage(content, config);
    expect(html).toContain('Team');
    expect(html).toContain('Work in pairs');
  });
});
