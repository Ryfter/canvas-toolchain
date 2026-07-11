import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollbackCoursePublish } from '../../src/tools/workflows/rollback_course_publish.js';
import { snapshotsRootFor, createSnapshotDir, snapshotDir, writeManifest, writePriorHtml, writeNewHtml, writeState } from '../../src/tools/publish/snapshot_store.js';
import { writePublishStateMeta } from '../../src/tools/publish/state_meta.js';
import type { PreviewManifest, PublishState, PublishStateMeta } from '../../src/tools/publish/manifest_types.js';

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

function setupTwoSnapshots(): { snap1Id: string; snap2Id: string } {
  const snap1Id = 'snap-1';
  const snap2Id = 'snap-2';

  for (const id of [snap1Id, snap2Id]) {
    // Use legacy createSnapshotDir so rollback_course_publish's snapshotDir() lookup finds it.
    // The pointer file (publish-state-<courseId>.json) lives at project-local path
    // (via snapshotsRootFor / writePublishStateMeta below).
    const dir = createSnapshotDir(id);
    const manifest: PreviewManifest = {
      snapshotId: id, courseId: 20255, courseDir,
      generatedAt: '2026-06-04T12:00:00.000Z',
      git: { isRepo: false },
      entries: [{
        type: 'page', filename: 'overview.html', pageType: 'overview',
        intendedTitle: 'Overview', collisionAction: 'update',
        canvasMatch: { pageId: 'overview', url: '', existingTitle: '', similarity: 1 },
        diff: { priorWords: 10, newWords: 20, delta: 10, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
        warnings: [],
      }],
      summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    };
    writeManifest(dir, manifest);
    writePriorHtml(dir, 'overview.html', `<p>prior for ${id}</p>`);
    writeNewHtml(dir, 'overview.html', `<p>new for ${id}</p>`);
    writeState(dir, {
      phase: 'published',
      published: [{
        filename: 'overview.html', type: 'page', canvasUrl: '', canvasPageSlug: 'overview',
        action: 'updated', publishedAt: '2026-06-04T12:00:00.000Z',
      }],
      lastUpdatedAt: '2026-06-04T12:00:00.000Z',
    });
  }

  const meta: PublishStateMeta = {
    courseId: 20255,
    currentlyLiveSnapshotId: snap2Id,
    currentlyLiveSince: '2026-06-04T13:00:00.000Z',
    history: [
      { snapshotId: snap1Id, becameLiveAt: '2026-06-04T12:00:00.000Z', becameStaleAt: '2026-06-04T13:00:00.000Z', becameLiveVia: 'publish' },
      { snapshotId: snap2Id, becameLiveAt: '2026-06-04T13:00:00.000Z', becameLiveVia: 'publish' },
    ],
  };
  writePublishStateMeta(snapshotsRootFor(courseDir), meta);

  return { snap1Id, snap2Id };
}

describe('rollbackCoursePublish Pattern B pointer behavior', () => {
  it('flips pointer to the immediately-prior snapshot when targetSnapshotId is omitted', async () => {
    const { snap1Id, snap2Id } = setupTwoSnapshots();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'overview', title: 'Overview', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await rollbackCoursePublish({ snapshotId: snap2Id });

    const metaPath = join(snapshotsRootFor(courseDir), 'publish-state-20255.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(meta.currentlyLiveSnapshotId).toBe(snap1Id);
    expect(meta.history[meta.history.length - 1].becameLiveVia).toBe('rollback');
  });

  it('flips pointer to the explicit targetSnapshotId when provided', async () => {
    const { snap1Id, snap2Id } = setupTwoSnapshots();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'overview', title: 'Overview', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await rollbackCoursePublish({ snapshotId: snap2Id, targetSnapshotId: snap1Id });

    const metaPath = join(snapshotsRootFor(courseDir), 'publish-state-20255.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(meta.currentlyLiveSnapshotId).toBe(snap1Id);
  });

  it('updates target snapshot phase to "restored" and increments restoredCount', async () => {
    const { snap1Id, snap2Id } = setupTwoSnapshots();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      page_id: 1, url: 'overview', title: 'Overview', html_url: '', body: '', published: true, updated_at: '',
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    await rollbackCoursePublish({ snapshotId: snap2Id, targetSnapshotId: snap1Id });

    // snap1's state.json lives where rollback found it (legacy global, via snapshotDir).
    const snap1Dir = snapshotDir(snap1Id);
    const snap1State = JSON.parse(readFileSync(join(snap1Dir, 'state.json'), 'utf-8'));
    expect(snap1State.phase).toBe('restored');
    expect(snap1State.restoredCount).toBe(1);
  });
});
