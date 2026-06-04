import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';
import {
  createSnapshotDir, writeManifest, writePriorHtml, writeNewHtml, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { writePagesMeta } from '../../src/tools/publish/pages_meta.js';
import { hashContent } from '../../src/tools/publish/drift_detection.js';
import type { PreviewManifest } from '../../src/tools/publish/manifest_types.js';

let ccHome: string;
let courseDir: string;
let originalEnv: string | undefined;

beforeEach(() => {
  ccHome = mkdtempSync(join(tmpdir(), 'cc-home-'));
  courseDir = mkdtempSync(join(tmpdir(), 'course-'));
  originalEnv = process.env.CC_HOME;
  process.env.CC_HOME = ccHome;
  writeFileSync(join(ccHome, 'canvas-config.json'), JSON.stringify({
    host: 'canvas.example', token: 'tk', configuredAt: '2026-06-04T00:00:00.000Z',
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('rollbackCoursePublish drift detection', () => {
  it('surfaces drift when current Canvas body differs from snapshot newContentHash', async () => {
    const snapshotId = 'snap-drift';
    const dir = createSnapshotDir(snapshotId);

    const publishedHtml = '<p>publish version</p>';
    const manifest: PreviewManifest = {
      snapshotId, courseId: 48895, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'overview.html', pageType: 'overview',
        intendedTitle: 'Overview', collisionAction: 'update',
        canvasMatch: { pageId: 'overview', url: '', existingTitle: 'Overview', similarity: 1 },
        diff: { priorWords: 1, newWords: 2, delta: 1, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'overview.html', '<p>prior</p>');
    writeNewHtml(dir, 'overview.html', publishedHtml);
    writeState(dir, {
      phase: 'published',
      published: [{
        filename: 'overview.html', type: 'page', canvasUrl: '', canvasPageSlug: 'overview',
        action: 'updated', publishedAt: '2026-06-04T12:00:00.000Z',
      }],
      lastUpdatedAt: '2026-06-04T12:00:00.000Z',
    });
    writePagesMeta(dir, {
      pages: {
        'overview.html': {
          priorCanvasPageSlug: 'overview',
          priorContentHash: hashContent('<p>prior</p>'),
          newContentHash: hashContent(publishedHtml),
        },
      },
    });

    // Mock fetch: GET /pages/overview returns drifted body; all other ops return generic OK.
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.match(/\/pages\/overview$/) && method === 'GET') {
        return new Response(JSON.stringify({
          page_id: 1, url: 'overview', title: 'Overview', html_url: '',
          body: '<p>HUMAN EDITED</p>',  // <-- drift!
          published: true, updated_at: '',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'overview', title: 'Overview', html_url: '',
        body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const result = await rollbackCoursePublish({ snapshotId });

    expect(result.drift).toBeDefined();
    expect(result.drift!.length).toBe(1);
    expect(result.drift![0]!.item).toBe('overview.html');
    expect(result.drift![0]!.expectedHash).toBe(hashContent(publishedHtml));
    expect(result.drift![0]!.actualHash).toBe(hashContent('<p>HUMAN EDITED</p>'));
    expect(result.drift![0]!.action).toBe('restored');
  });
});
