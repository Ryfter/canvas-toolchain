import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishCourse } from '../../src/tools/workflows/publish_course.js';
import {
  snapshotsRootFor, createSnapshotDir, createSnapshotDirFor,
  writeManifest, writeNewHtml, writeState,
} from '../../src/tools/publish/snapshot_store.js';
import { writePublishStateMeta } from '../../src/tools/publish/state_meta.js';
import type { PreviewManifest, PublishStateMeta } from '../../src/tools/publish/manifest_types.js';

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

function makeProjectLocalSnap(id: string, publishedAt: string) {
  const dir = createSnapshotDirFor(id, courseDir);
  const manifest: PreviewManifest = {
    snapshotId: id, courseId: 48895, courseDir, generatedAt: publishedAt,
    git: { isRepo: false }, entries: [],
    summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writeState(dir, { phase: 'published', published: [], lastUpdatedAt: publishedAt });
}

describe('publishCourse auto-prune', () => {
  it('runs pruneSnapshots after a successful publish and removes expired snapshots', async () => {
    // Seed 3 recent project-local snapshots + 1 ancient — auto-prune should remove the ancient one
    // (count=3 keeps the 3 recent; ancient is index 3 and beyond retainDays=30).
    makeProjectLocalSnap('s1', '2026-06-01T12:00:00.000Z');
    makeProjectLocalSnap('s2', '2026-06-02T12:00:00.000Z');
    makeProjectLocalSnap('s3', '2026-06-03T12:00:00.000Z');
    makeProjectLocalSnap('old', '2024-01-01T00:00:00.000Z');

    // Pointer file: 's3' is currently live (not the ancient one — guard preserves liveness).
    const meta: PublishStateMeta = {
      courseId: 48895, currentlyLiveSnapshotId: 's3',
      currentlyLiveSince: '2026-06-03T12:00:00.000Z',
      history: [{ snapshotId: 's3', becameLiveAt: '2026-06-03T12:00:00.000Z', becameLiveVia: 'publish' }],
    };
    writePublishStateMeta(snapshotsRootFor(courseDir), meta);

    // The snapshot we're actually publishing lives at legacy global (createSnapshotDir).
    const snapshotId = 'new-publish';
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
    expect(result.pruning).toBeDefined();
    // The ancient snapshot should have been pruned from project-local snapshots root.
    expect(result.pruning!.pruned?.map(p => p.snapshotId)).toContain('old');
    expect(existsSync(join(snapshotsRootFor(courseDir), 'old'))).toBe(false);
    // The 3 recent ones survive.
    expect(existsSync(join(snapshotsRootFor(courseDir), 's1'))).toBe(true);
    expect(existsSync(join(snapshotsRootFor(courseDir), 's2'))).toBe(true);
    expect(existsSync(join(snapshotsRootFor(courseDir), 's3'))).toBe(true);
  });
});
