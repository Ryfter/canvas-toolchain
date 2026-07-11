import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generatePage } from '../src/tools/generate-page.js';

const fixturesDir = join(import.meta.dirname, 'fixtures/course-input');

describe('generatePage', () => {
  it('generates HTML file from overview.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('overview');
    expect(result.weekNumber).toBe(1);
    expect(result.filename).toBe('overview.html');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('saved HTML contains learning objectives content', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).toContain('Learning Objectives');
    expect(html).toContain('AI augmentation');
  });

  it('saves to output/week-01/overview.html by default', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.savedTo).toContain(join('week-01', 'overview.html'));
  });

  it('generates HTML file from assignment.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/assignment.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('assignment');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('generates HTML file from front-page.md', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'front-page.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(result.pageType).toBe('front-page');
    expect(result.weekNumber).toBe(0);
    expect(result.filename).toBe('front-page.html');
    expect(existsSync(result.savedTo)).toBe(true);
  });

  it('generated HTML passes basic Canvas compliance (no <style>, no <h1>)', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('box-shadow');
  });

  it('supports custom templateId parameter', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'gp-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
      templateId: 'overview',
    });
    expect(result.pageType).toBe('overview');
    expect(existsSync(result.savedTo)).toBe(true);
    const html = readFileSync(result.savedTo, 'utf-8');
    expect(html).toContain('Learning Objectives');
  });
});

describe('generatePage — rubric page type (#67)', () => {
  it('emits a .md alongside the .html for rubric pages (the LLM-paste deliverable)', () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'rb-'));
    writeFileSync(join(courseDir, 'course-config.md'), `---
institution: Example University
course_name: BusApp 105
course_number: BUSAPP 105
professor: Dr. Smith
semester: Summer 2026
weeks: 5
page_types:
  - rubric
layout_fixed: true
colors:
  primary: ""
  secondary: ""
hero_images:
  rubric: ""
---

## Week Outline
| Week | Title |
|------|-------|
| 05 | Capstone |
`);
    mkdirSync(join(courseDir, 'week-05'));
    const mdPath = join(courseDir, 'week-05', 'rubric.md');
    writeFileSync(mdPath, `---
week: 5
title: "Capstone Rubric"
assignment_number: "7.3"
hero_image: ""
points: 100
---

## Criterion 1: Formula Correctness — 30 pts

**For students:**
Your formulas reference the right cells.

**Worked example:**
\`=SUM(C2:E2)\`

**Faculty rubric language:**
Formulas syntactically correct.
`);

    const outDir = mkdtempSync(join(tmpdir(), 'rb-out-'));
    const result = generatePage({ mdPath, courseDir, outputDir: outDir });

    expect(result.pageType).toBe('rubric');
    expect(result.filename).toBe('rubric.html');
    expect(existsSync(result.savedTo)).toBe(true);
    // Critically: a .md file should ALSO exist next to the .html
    const mdSavedTo = join(outDir, 'week-05', 'rubric.md');
    expect(existsSync(mdSavedTo)).toBe(true);
    const mdContent = readFileSync(mdSavedTo, 'utf-8');
    expect(mdContent).toContain('Capstone Rubric');
    expect(mdContent).toContain('Formula Correctness');
    expect(mdContent).toContain('Faculty rubric language');
  });

  it('does NOT emit a .md alongside HTML for non-rubric pages (regression)', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'rb-out-2-'));
    const result = generatePage({
      mdPath: join(fixturesDir, 'week-01/overview.md'),
      courseDir: fixturesDir,
      outputDir: outDir,
    });
    expect(existsSync(result.savedTo)).toBe(true);
    const mdSavedTo = join(outDir, 'week-01', 'overview.md');
    expect(existsSync(mdSavedTo)).toBe(false);
  });
});

describe('generatePage — TL;DR card (#66)', () => {
  it('prepends the TL;DR card when the page has tier-1 sections in front matter', () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'gp-tldr-'));
    try {
      writeFileSync(join(courseDir, 'course-config.md'),
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5 Assignment\nweek: 5\ntiers:\n  sections:\n    - heading: Due Date\n      tier: 1\n      summary: Oct 17 at 11:59 PM\n---\n\n## Due Date\n\nOct 17.\n');

      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });

      expect(result.html).toContain('Quick Reference');
      expect(result.html).toContain('Due Date');
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });

  it('renders unchanged (no card) when page has no tiers block', () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'gp-notldr-'));
    try {
      writeFileSync(join(courseDir, 'course-config.md'),
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5 Assignment\nweek: 5\n---\n\n## Due Date\n\nOct 17.\n');

      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });

      expect(result.html).not.toContain('Quick Reference');
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });

  it('does not add the card when tiers exist but contain no tier-1 entries', () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'gp-onlyt2-'));
    try {
      writeFileSync(join(courseDir, 'course-config.md'),
        '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
      mkdirSync(join(courseDir, 'week-05'), { recursive: true });
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5\nweek: 5\ntiers:\n  sections:\n    - heading: Rubric\n      tier: 3\n      summary: see below\n---\n\n## Rubric\n\nbody\n');

      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });

      expect(result.html).not.toContain('Quick Reference');
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });
});

describe('generatePage — AIAS callout (#92)', () => {
  function setupCourse(tmpDir: string, courseConfigContent: string): string {
    const courseDir = mkdtempSync(join(tmpdir(), tmpDir));
    writeFileSync(join(courseDir, 'course-config.md'), courseConfigContent);
    mkdirSync(join(courseDir, 'week-05'), { recursive: true });
    return courseDir;
  }

  it('renders the AIAS callout on assignment pages when a level resolves', () => {
    const courseDir = setupCourse('aias-assn-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 3\n---\n');
    try {
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5\nweek: 5\n---\n\n## Due Date\n\nOct 17.\n');
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).toContain('AI Use Policy');
      expect(result.html).toContain('Level 3');
      expect(result.html).toContain('AI Collaboration');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('renders the AIAS callout on rubric pages too', () => {
    const courseDir = setupCourse('aias-rubric-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 2\n---\n');
    try {
      const mdPath = join(courseDir, 'week-05', 'rubric.md');
      writeFileSync(mdPath, '---\ntitle: Rubric\nweek: 5\n---\n\n## Criteria\n\nA, B, C.\n');
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).toContain('AI Use Policy');
      expect(result.html).toContain('Level 2');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('does NOT render the callout on non-assignment/non-rubric pages', () => {
    const courseDir = setupCourse('aias-other-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 3\n---\n');
    try {
      const mdPath = join(courseDir, 'week-05', 'resources.md');
      writeFileSync(mdPath, '---\ntitle: Resources\nweek: 5\n---\n\n## Links\n\nA, B.\n');
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).not.toContain('AI Use Policy');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('per-page aiasLevel override wins over course default', () => {
    const courseDir = setupCourse('aias-override-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\ndefaultAiasLevel: 3\n---\n');
    try {
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: Exam\nweek: 5\naiasLevel: 1\naiasNote: Closed book.\n---\n\n## Q\n\nA?\n');
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).toContain('Level 1');
      expect(result.html).toContain('No AI');
      expect(result.html).toContain('Closed book.');
      expect(result.html).not.toContain('Level 3');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('renders no callout when neither course default nor page override is set', () => {
    const courseDir = setupCourse('aias-none-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
    try {
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, '---\ntitle: W5\nweek: 5\n---\n\n## Q\n\nA.\n');
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).not.toContain('AI Use Policy');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });
});

describe('generatePage — oral-assessment AIAS + launch (#76)', () => {
  function setupCourse(tmpDir: string, courseConfigContent: string): string {
    const courseDir = mkdtempSync(join(tmpdir(), tmpDir));
    writeFileSync(join(courseDir, 'course-config.md'), courseConfigContent);
    mkdirSync(join(courseDir, 'week-04'), { recursive: true });
    return courseDir;
  }

  it('renders the AIAS callout on an oral-assessment page when aiasLevel is set', () => {
    const courseDir = setupCourse('oa-aias-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
    try {
      const mdPath = join(courseDir, 'week-04', 'oral-assessment.md');
      writeFileSync(mdPath, [
        '---', 'week: 4', 'title: "Concept Check"', 'prep_seconds: 30',
        'response_seconds: 120', 'randomize_pick: 1', 'randomize_of: 3', 'attempts: "1"',
        'launch_url: "https://r.edu/lti/launch"', 'aiasLevel: 3', '---', '',
        '## What to expect', 'Explain opportunity cost aloud.', '',
      ].join('\n'));
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.pageType).toBe('oral-assessment');
      expect(result.html).toContain('AI Use Policy');           // from renderAiasCallout
      expect(result.html).toContain('Launch the assessment');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('builds the launch link from course-config domain when the page omits launch_url', () => {
    const courseDir = setupCourse('oa-domain-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\noral_assessment_launch_domain: rhetorixlab.example.edu\n---\n');
    try {
      const mdPath = join(courseDir, 'week-04', 'oral-assessment.md');
      writeFileSync(mdPath, [
        '---', 'week: 4', 'title: "Concept Check"', 'prep_seconds: 30',
        'response_seconds: 120', 'randomize_pick: 1', 'randomize_of: 3', 'attempts: "1"',
        '---', '',
        '## What to expect', 'Explain opportunity cost aloud.', '',
      ].join('\n'));
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.pageType).toBe('oral-assessment');
      expect(result.html).toContain('https://rhetorixlab.example.edu/lti/launch');
      expect(result.html).toContain('Launch the assessment');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('coerces string front-matter timing/randomization through the real parser', () => {
    const courseDir = setupCourse('oa-coerce-',
      '---\ntitle: Test Course\nshort_name: TC\nsemester: F26\ndomain_color: "#0033A0"\n---\n');
    try {
      const mdPath = join(courseDir, 'week-04', 'oral-assessment.md');
      writeFileSync(mdPath, [
        '---', 'week: 4', 'title: "Concept Check"', 'prep_seconds: 30',
        'response_seconds: 120', 'randomize_pick: 1', 'randomize_of: 3', 'attempts: "1"',
        'launch_url: "https://r.edu/lti/launch"', '---', '',
        '## What to expect', 'Explain opportunity cost aloud.', '',
      ].join('\n'));
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.pageType).toBe('oral-assessment');
      expect(result.html).toContain('2:00');                  // formatted response_seconds=120
      expect(result.html).toContain('1 of 3');                // randomize_pick of randomize_of
      expect(result.html).toContain('Launch the assessment');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });
});

describe('generatePage — CLO mapping (#91)', () => {
  function setupCourse(tmpDir: string, courseConfigContent: string): string {
    const courseDir = mkdtempSync(join(tmpdir(), tmpDir));
    writeFileSync(join(courseDir, 'course-config.md'), courseConfigContent);
    mkdirSync(join(courseDir, 'week-05'), { recursive: true });
    return courseDir;
  }

  const CATALOG_FM = `---
title: Test Course
short_name: TC
semester: F26
domain_color: "#0033A0"
clos:
  - id: '1'
    name: Analyzing
    statement: Students analyze.
  - id: '2'
    name: Communicating
    statement: Students communicate.
---
`;

  it('renders the Supports CLOs line on an assignment page with clos: front matter', () => {
    const courseDir = setupCourse('clo-assn-', CATALOG_FM);
    try {
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, `---\ntitle: W5\nweek: 5\nclos: ['1', '2']\n---\n\n## Body\n\nbody\n`);
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).toContain('Supports CLOs');
      expect(result.html).toContain('CLO 1');
      expect(result.html).toContain('Analyzing');
      expect(result.html).toContain('CLO 2');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('renders on a rubric page too', () => {
    const courseDir = setupCourse('clo-rubric-', CATALOG_FM);
    try {
      const mdPath = join(courseDir, 'week-05', 'rubric.md');
      writeFileSync(mdPath, `---\ntitle: R\nweek: 5\nclos: ['1']\n---\n\n## Criteria\n\nx\n`);
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).toContain('Supports CLOs');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('does NOT render CLO line on a non-eligible page type even when clos: is set', () => {
    const courseDir = setupCourse('clo-res-', CATALOG_FM);
    try {
      const mdPath = join(courseDir, 'week-05', 'resources.md');
      writeFileSync(mdPath, `---\ntitle: Res\nweek: 5\nclos: ['1']\n---\n\n## Links\n\nx\n`);
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).not.toContain('Supports CLOs');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });

  it('all-unknown IDs produce no CLO line (graceful degradation)', () => {
    const courseDir = setupCourse('clo-unk-', CATALOG_FM);
    try {
      const mdPath = join(courseDir, 'week-05', 'assignment.md');
      writeFileSync(mdPath, `---\ntitle: A\nweek: 5\nclos: ['99', '100']\n---\n\n## B\n\nx\n`);
      const result = generatePage({ mdPath, courseDir, outputDir: join(courseDir, 'out') });
      expect(result.html).not.toContain('Supports CLOs');
    } finally { rmSync(courseDir, { recursive: true, force: true }); }
  });
});
