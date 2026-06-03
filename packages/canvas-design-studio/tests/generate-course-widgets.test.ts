import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateCourse } from '../src/tools/generate-course.js';

/**
 * Minimal course-config.md with a single page type so we can drive a focused
 * test of widget placeholder substitution in generate_course's rendering
 * pipeline. The `assignment` page type renders the Brief section as a
 * callout — perfect for embedding a placeholder and checking it survives
 * through markdown→HTML conversion as a real <iframe>.
 */
function writeMinimalCourse(dir: string, opts: { briefBody: string }): void {
  writeFileSync(
    join(dir, 'course-config.md'),
    `---
institution: Test U
course_name: Widget Test Course
course_number: WGT 101
professor: Test
semester: Fall 2026
weeks: 1

page_types:
  - assignment

layout_fixed: true

colors:
  primary: ""
  secondary: ""

hero_images:
  assignment: ""
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
| 01 | Widget Week | Widget placeholders |
`,
    'utf-8',
  );

  mkdirSync(join(dir, 'week-01'), { recursive: true });
  writeFileSync(
    join(dir, 'week-01', 'assignment.md'),
    `---
week: 1
title: "Widget Demo"
assignment_number: "1.1"
points: 50
---

## Brief
${opts.briefBody}

## Submission Details
Submit via Canvas.
`,
    'utf-8',
  );
}

describe('generateCourse widget placeholder substitution', () => {
  it('replaces {{ widget:<id> }} with a local iframe pointing at <page-slug>/widgets/<id>.html', () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'gc-widget-'));
    const outDir = mkdtempSync(join(tmpdir(), 'gc-widget-out-'));

    writeMinimalCourse(courseDir, {
      briefBody: 'Practice sorting data types:\n\n{{ widget:data-types-categorize }}\n\nThen submit.',
    });

    generateCourse({ courseDir, outputDir: outDir });

    const outputHtmlPath = join(outDir, 'week-01', 'assignment.html');
    expect(existsSync(outputHtmlPath)).toBe(true);

    const outputHtml = readFileSync(outputHtmlPath, 'utf-8');
    expect(outputHtml).toContain('<iframe');
    expect(outputHtml).toMatch(/src="assignment\/widgets\/data-types-categorize\.html"/);
    expect(outputHtml).not.toContain('{{ widget:');
  });

  it('leaves pages without widget placeholders untouched', () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'gc-no-widget-'));
    const outDir = mkdtempSync(join(tmpdir(), 'gc-no-widget-out-'));

    writeMinimalCourse(courseDir, {
      briefBody: 'Plain assignment with no widgets.',
    });

    generateCourse({ courseDir, outputDir: outDir });

    const outputHtmlPath = join(outDir, 'week-01', 'assignment.html');
    expect(existsSync(outputHtmlPath)).toBe(true);

    const outputHtml = readFileSync(outputHtmlPath, 'utf-8');
    expect(outputHtml).not.toContain('<iframe');
  });

  it('replaces multiple placeholders in the same page', () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'gc-multi-widget-'));
    const outDir = mkdtempSync(join(tmpdir(), 'gc-multi-widget-out-'));

    writeMinimalCourse(courseDir, {
      briefBody: '{{ widget:first-widget }}\n\nSome text in between.\n\n{{ widget:second-widget }}',
    });

    generateCourse({ courseDir, outputDir: outDir });

    const outputHtmlPath = join(outDir, 'week-01', 'assignment.html');
    const outputHtml = readFileSync(outputHtmlPath, 'utf-8');
    expect(outputHtml).toMatch(/src="assignment\/widgets\/first-widget\.html"/);
    expect(outputHtml).toMatch(/src="assignment\/widgets\/second-widget\.html"/);
    expect(outputHtml).not.toContain('{{ widget:');
  });
});
