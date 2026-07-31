import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CourseConfig, PageType } from '../course-types.js';

export function getWeekFolderName(week: number): string {
  return `week-${String(week).padStart(2, '0')}`;
}

const PAGE_PROMPTS: Record<PageType, string> = {
  'front-page': `## Course Introduction
[Brief course description — the model rewrites into student-facing copy]

## What You'll Learn
[3-5 high-level outcomes for the course]

## How This Course Works
[Format, weekly rhythm, expectations]

## Instructor
[Name, contact, office hours]
`,
  'overview': `## Learning Objectives
- Students will be able to...
- Students will understand...

## Introduction
[Professor notes for this week — rough is fine, the model rewrites]

## Activities
- Lecture: [title] (Panopto)
- Reading: [title] — due [date]
- Assignment [number] — due [date]
- Discussion: [topic]
`,
  'resources': `## Slides
- [Slide deck title](SLIDES_URL)

## Videos
- Panopto ID: [paste UUID from Panopto URL]

## Readings
- [Article or chapter title](URL)

## Other
- [Any additional resources, quiz links, etc.]
`,
  'slides': `## Slide Deck
- [Slide deck title](SLIDES_URL)

## About These Slides
[Brief description of what the slides cover]

## Key Topics
- [Topic 1]
- [Topic 2]
`,
  'videos': `## Videos
- Panopto ID: [paste UUID from Panopto URL]
  Title: [video title]
  Duration: [approx length]

## What to Watch For
[Anything students should pay attention to while watching]
`,
  'assignment': `## Brief
[Paste raw assignment instructions here — rough is fine, the model rewrites into polished student-facing copy]

## Rubric
[Paste rubric criteria here, or leave blank to inherit from a shared rubric file]

## Submission Details
- Due: [date]
- Points: [number]
- Submit via: [Canvas Assignments / link]
`,
  'engage-assignment': `## What We're Doing
[Describe the in-class activity — what students will do, produce, or discuss]

## Instructions
[Step-by-step instructions]

## Time
[Approximate time: e.g. "15 minutes individual, 10 minutes group share"]

## Deliverable
[What students turn in — e.g. "Post your response to the class discussion board before leaving class"]
`,
  'reading': `## The Reading
- Title: [Full title of article, chapter, or book]
- Author(s): [Author names]
- Link: [URL or "Canvas Files > Week X > filename.pdf"]

## Why This Reading
[1-2 sentences on why this reading matters for the course]

## As You Read
[Optional: guiding questions or things to look for]
`,
  'reading-quiz': `## Quiz Details
- Opens: [date/time]
- Closes: [date/time]
- Questions: [number]
- Points: [number]

## What It Covers
[The specific reading or readings this quiz tests]

## Access
[Canvas link or "Quiz appears in Canvas Quizzes"]
`,
  'weekly-quiz': `## Quiz Details
- Opens: [date/time]
- Closes: [date/time]
- Questions: [number]
- Points: [number]

## Topics Covered
- [Topic 1 from this week]
- [Topic 2 from this week]

## Access
[Canvas link or "Quiz appears in Canvas Quizzes"]
`,
  'lab': `## Objectives
- [What students will practice or build]

## Setup
[Any software, files, or accounts students need before starting]

## Instructions
[Step-by-step lab instructions — can be rough, the model rewrites]

## Submission
- Due: [date]
- Submit: [what to turn in — e.g. "ZIP file of your project folder"]
`,
  'discussion-board': `## Prompt
[The discussion question or prompt students respond to]

## Requirements
- Initial post: [word count / due date]
- Responses: [how many peers to respond to / due date]

## Grading
[Brief description of how discussion is graded — e.g. "Scored on depth, evidence, and engagement"]
`,
  'proj-assignment': `## Project Overview
[Describe the multi-week project — what students will build, research, or produce]

## Milestones
- Milestone 1: [description] — due [date]
- Milestone 2: [description] — due [date]
- Final submission — due [date]

## Team or Individual
[Specify: individual or team; if team, note group size]

## Submission Details
- Points: [number]
- Submit via: [Canvas Assignments / link]
`,
  'tech-assignment': `## Overview
[What tool, technology, or hands-on skill this assignment covers]

## Instructions
[Step-by-step technical instructions — rough is fine, the model rewrites]

## Requirements
- [Technical requirement 1]
- [Technical requirement 2]

## Submission Details
- Due: [date]
- Points: [number]
- Submit via: [Canvas Assignments / link — e.g. screenshot, repo URL, exported file]
`,
  'extra-credit': `## Opportunity
[What the extra credit activity is]

## Requirements
[What students must do to earn the extra credit]

## Points
[How many points / what percentage of grade]

## Deadline
[Date — note: late submissions not accepted]
`,
  'rubric': `## Criterion 1: [Criterion Name] — [N] pts

**For students:**
[Plain-English explanation: what this criterion is checking for, in language a student new to the topic can act on.]

**Worked example:**
[Concrete description of what a full-credit submission looks like for this criterion. Use specific values, cell references, or step-by-step examples.]

**Faculty rubric language:**
[The actual Canvas rubric language. Kept here so the student rewrite and the official rubric stay synchronized.]

## Criterion 2: [Criterion Name] — [N] pts

**For students:**
[...]

**Worked example:**
[...]

**Faculty rubric language:**
[...]

## Notes for students

[Optional: how to use this rubric, where to ask questions, how to download as markdown for LLM-paste.]
`,
  'oral-assessment': `## What to expect
[One short student-facing paragraph: what the oral/video assessment covers and how it works. The timing, randomization, and attempts fields live in the page front matter (prep_seconds, response_seconds, randomize_pick, randomize_of, attempts).]

## Rubric

## Criterion 1: [Criterion Name] — [N] pts
[What this criterion is checking for, in plain student-facing language.]
`,
  'custom': `## [Section 1 Title]
[Content for section 1]

## [Section 2 Title]
[Content for section 2]

## [Section 3 Title]
[Content for section 3]
`,
};

function buildFrontMatter(pageType: PageType, week: number, config: CourseConfig): string {
  const base = `---
week: ${week}
title: ""
hero_image: ""
`;

  if (pageType === 'assignment') {
    return base + `assignment_number: "${config.courseNumber.replace(/\s+/g, '')}.${String(week).padStart(2, '0')}"
due: ""
points: 0
---\n\n`;
  }

  if (pageType === 'proj-assignment') {
    return base + `assignment_number: "${config.courseNumber.replace(/\s+/g, '')}.${String(week).padStart(2, '0')}"
due: ""
points: 0
team: false
timeline: true
---\n\n`;
  }

  if (pageType === 'tech-assignment') {
    return base + `assignment_number: "${config.courseNumber.replace(/\s+/g, '')}.${String(week).padStart(2, '0')}"
due: ""
points: 0
team: false
---\n\n`;
  }

  if (pageType === 'front-page') {
    return `---
title: "${config.courseName}"
hero_image: ""
---\n\n`;
  }

  return base + '---\n\n';
}

export function createCourseScaffold(config: CourseConfig, rootDir: string): string[] {
  const created: string[] = [];

  mkdirSync(rootDir, { recursive: true });

  const configPath = join(rootDir, 'course-config.md');
  if (!existsSync(configPath)) {
    const heroBlock = config.pageTypes
      .map(pt => `  ${pt}: ""`)
      .join('\n');

    const weekTableRows = Array.from({ length: config.weeks }, (_, i) => {
      const n = i + 1;
      const entry = config.weekOutline[i];
      const title = entry?.title ?? `Week ${String(n).padStart(2, '0')}`;
      const topic = entry?.topic ?? '[Topic]';
      return `| ${String(n).padStart(2, '0')} | ${title} | ${topic} |`;
    }).join('\n');

    const configContent = `---
institution: ${config.institution}
course_name: ${config.courseName}
course_number: ${config.courseNumber}
professor: ${config.professor}
semester: ${config.semester}
weeks: ${config.weeks}

page_types:
${config.pageTypes.map(pt => `  - ${pt}`).join('\n')}

layout_fixed: ${config.layoutFixed}

colors:
  primary: ""
  secondary: ""

hero_images:
${heroBlock}
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
${weekTableRows}
`;
    writeFileSync(configPath, configContent, 'utf-8');
    created.push(configPath);
  }

  if (config.pageTypes.includes('front-page')) {
    const fpPath = join(rootDir, 'front-page.md');
    if (!existsSync(fpPath)) {
      writeFileSync(fpPath, buildFrontMatter('front-page', 0, config) + PAGE_PROMPTS['front-page'], 'utf-8');
      created.push(fpPath);
    }
  }

  const weekPageTypes = config.pageTypes.filter(pt => pt !== 'front-page');
  for (let w = 1; w <= config.weeks; w++) {
    const weekFolder = join(rootDir, getWeekFolderName(w));
    mkdirSync(weekFolder, { recursive: true });

    for (const pageType of weekPageTypes) {
      const mdPath = join(weekFolder, `${pageType}.md`);
      if (!existsSync(mdPath)) {
        const content = buildFrontMatter(pageType, w, config) + PAGE_PROMPTS[pageType];
        writeFileSync(mdPath, content, 'utf-8');
        created.push(mdPath);
      }
    }
  }

  return created;
}
