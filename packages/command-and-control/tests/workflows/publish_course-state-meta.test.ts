import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import { snapshotsRootFor, createSnapshotDir, writeManifest, writeNewHtml, writeState } from '../../src/tools/publish/snapshot_store.js';
import type { PreviewManifest, PublishState } from '../../src/tools/publish/manifest_types.js';

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

describe('publishCourse pointer file', () => {
  it('updates publish-state-<courseId>.json at end of successful publish', async () => {
    const snapshotId = 'test-snap-1';
    const dir = createSnapshotDir(snapshotId);
    const manifest: PreviewManifest = {
      snapshotId, courseId: 48895, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'overview.html', pageType: 'overview',
        intendedTitle: 'Overview', collisionAction: 'create',
        diff: { priorWords: null, newWords: 50, delta: 50, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writeNewHtml(dir, 'overview.html', '<p>new</p>');
    writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: '2026-06-04T12:00:00.000Z' });

    // Mock Canvas API: listPages → empty array, createPage → success
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.includes('/pages') && method === 'GET') {
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        page_id: 1, url: 'overview', title: 'Overview',
        html_url: 'https://canvas.example/courses/48895/pages/overview',
        body: '', published: true, updated_at: '',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const result = await publishCourse({ snapshotId, approvals: { 'overview.html': 'approve' }, gitCommit: false });

    expect(result.phase).toBe('published');

    // VERIFY: pointer file exists at snapshotsRootFor + courseId, points to this snapshot
    const metaPath = join(snapshotsRootFor(courseDir), 'publish-state-48895.json');
    expect(existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(meta.courseId).toBe(48895);
    expect(meta.currentlyLiveSnapshotId).toBe(snapshotId);
    expect(meta.history).toHaveLength(1);
    expect(meta.history[0].becameLiveVia).toBe('publish');
    expect(meta.history[0].snapshotId).toBe(snapshotId);
  });
});
