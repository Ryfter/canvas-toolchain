import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previewCoursePublish } from '../../src/tools/workflows/preview_course_publish.js';

let ccHome: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** Minimal CDS course tree — same pattern as preview_course_publish-widgets.test.ts. */
function setupMinimalCourse(courseDir: string): void {
  writeFileSync(join(courseDir, 'course-config.md'), `---
institution: Test U
course_name: Backup Test
course_number: BCK 101
professor: Test
semester: Fall 2026
weeks: 1

page_types:
  - overview

layout_fixed: true

colors:
  primary: ""
  secondary: ""

hero_images:
  overview: ""
---

## Week Outline

| Week | Title | Topic |
|------|-------|-------|
| 01 | Backup | Test |
`, 'utf-8');
  mkdirSync(join(courseDir, 'week-01'), { recursive: true });
  writeFileSync(join(courseDir, 'week-01', 'overview.md'), `---
week: 1
title: "Overview"
---

## Learning Objectives
Plain page.

## Activities
Submit.
`, 'utf-8');
}

describe('previewCoursePublish backup detection', () => {
  it('embeds backup status in manifest output', async () => {
    const courseDir = mkdtempSync(join(tmpdir(), 'course-'));
    try {
      setupMinimalCourse(courseDir);
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
        new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })));

      const result = await previewCoursePublish({ courseDir, courseId: 20255 });

      expect(result.manifest).toBeDefined();
      expect(result.manifest!.backup).toBeDefined();
      // A plain tmpdir has no git, no synced-folder marker → 'none'.
      expect(result.manifest!.backup!.status).toBe('none');
      expect(result.manifest!.backup!.message).toMatch(/no backup detected/i);
    } finally {
      rmSync(courseDir, { recursive: true, force: true });
    }
  });
});
