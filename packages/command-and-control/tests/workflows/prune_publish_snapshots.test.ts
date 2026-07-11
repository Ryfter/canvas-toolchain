import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prunePublishSnapshots } from '../../src/tools/workflows/prune_publish_snapshots.js';
import {
  snapshotsRootFor, createSnapshotDirFor, writeManifest, writeState,
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
    host: 'x', token: 'y', configuredAt: '2026-06-04T00:00:00.000Z',
    snapshotRetentionCount: 3, snapshotRetentionDays: 30,
  }), 'utf-8');
});

afterEach(() => {
  process.env.CC_HOME = originalEnv;
  rmSync(ccHome, { recursive: true, force: true });
  rmSync(courseDir, { recursive: true, force: true });
});

function makeSnap(id: string, publishedAt: string) {
  const dir = createSnapshotDirFor(id, courseDir);
  const manifest: PreviewManifest = {
    snapshotId: id, courseId: 20255, courseDir, generatedAt: publishedAt,
    git: { isRepo: false }, entries: [],
    summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writeState(dir, { phase: 'published', published: [], lastUpdatedAt: publishedAt });
}

describe('prunePublishSnapshots', () => {
  it('dry run lists what would be pruned without deleting', async () => {
    // Need ≥ retainCount(3) more-recent snapshots to push 'old' to index 3 where age-retention fires
    makeSnap('old', '2024-01-01T00:00:00.000Z');
    makeSnap('s1', '2026-06-01T12:00:00.000Z');
    makeSnap('s2', '2026-06-02T12:00:00.000Z');
    makeSnap('s3', '2026-06-03T12:00:00.000Z');

    const meta: PublishStateMeta = {
      courseId: 20255, currentlyLiveSnapshotId: 's3',
      currentlyLiveSince: '2026-06-03T12:00:00.000Z',
      history: [{ snapshotId: 's3', becameLiveAt: '2026-06-03T12:00:00.000Z', becameLiveVia: 'publish' }],
    };
    writePublishStateMeta(snapshotsRootFor(courseDir), meta);

    const result = await prunePublishSnapshots({ courseId: 20255, courseDir, dryRun: true });
    expect(result.wouldPrune.map(p => p.snapshotId)).toEqual(['old']);
    expect(existsSync(join(snapshotsRootFor(courseDir), 'old'))).toBe(true);
  });
});
