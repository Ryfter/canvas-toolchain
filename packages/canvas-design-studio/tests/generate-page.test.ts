import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
institution: Boise State University
course_name: BusApp 105
course_number: BUSAPP 105
professor: Dr. Rank
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
