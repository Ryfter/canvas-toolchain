import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneSnapshots, computePruneList } from '../../src/tools/publish/pruning.js';
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
    snapshotId: id, courseId: 48895, courseDir,
    generatedAt: publishedAt, git: { isRepo: false },
    entries: [], summary: { total: 0, pages: 0, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
  };
  writeManifest(dir, manifest);
  writeState(dir, { phase: 'published', published: [], lastUpdatedAt: publishedAt });
}

function setLive(snapshotId: string) {
  const meta: PublishStateMeta = {
    courseId: 48895, currentlyLiveSnapshotId: snapshotId,
    currentlyLiveSince: '2026-06-04T00:00:00.000Z',
    history: [{ snapshotId, becameLiveAt: '2026-06-04T00:00:00.000Z', becameLiveVia: 'publish' }],
  };
  writePublishStateMeta(snapshotsRootFor(courseDir), meta);
}

describe('computePruneList', () => {
  it('keeps top-3 by recency when count retention is 3', () => {
    makeSnap('s1', '2026-05-30T12:00:00.000Z');
    makeSnap('s2', '2026-05-31T12:00:00.000Z');
    makeSnap('s3', '2026-06-01T12:00:00.000Z');
    makeSnap('s4', '2026-06-02T12:00:00.000Z');
    makeSnap('s5', '2026-06-03T12:00:00.000Z');
    setLive('s5');
    const { pruned, kept } = computePruneList({
      courseId: 48895, courseDir, retainCount: 3, retainDays: 30,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(pruned).toEqual([]);
    expect(kept.sort()).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('prunes snapshots older than retainDays even when above retainCount', () => {
    makeSnap('old', '2026-04-01T00:00:00.000Z');
    makeSnap('s1', '2026-05-30T12:00:00.000Z');
    makeSnap('s2', '2026-05-31T12:00:00.000Z');
    makeSnap('s3', '2026-06-01T12:00:00.000Z');
    setLive('s3');
    const { pruned, kept } = computePruneList({
      courseId: 48895, courseDir, retainCount: 3, retainDays: 30,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(pruned).toEqual(['old']);
    expect(kept.sort()).toEqual(['s1', 's2', 's3']);
  });

  it('never prunes the currently-live snapshot regardless of age', () => {
    makeSnap('ancient-live', '2024-01-01T00:00:00.000Z');
    makeSnap('s1', '2026-06-01T12:00:00.000Z');
    makeSnap('s2', '2026-06-02T12:00:00.000Z');
    makeSnap('s3', '2026-06-03T12:00:00.000Z');
    setLive('ancient-live');
    const { pruned, kept } = computePruneList({
      courseId: 48895, courseDir, retainCount: 3, retainDays: 30,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(kept).toContain('ancient-live');
    expect(pruned).not.toContain('ancient-live');
  });
});

describe('pruneSnapshots', () => {
  it('dry run does not delete anything from disk', async () => {
    makeSnap('old', '2024-01-01T00:00:00.000Z');
    makeSnap('s1', '2026-06-01T12:00:00.000Z');
    makeSnap('s2', '2026-06-02T12:00:00.000Z');
    makeSnap('s3', '2026-06-03T12:00:00.000Z');
    setLive('s3');
    const result = await pruneSnapshots({
      courseId: 48895, courseDir, dryRun: true,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(result.wouldPrune.map(p => p.snapshotId)).toEqual(['old']);
    expect(existsSync(join(snapshotsRootFor(courseDir), 'old'))).toBe(true);
  });

  it('non-dry-run deletes the snapshot dir', async () => {
    makeSnap('old', '2024-01-01T00:00:00.000Z');
    makeSnap('s1', '2026-06-01T12:00:00.000Z');
    makeSnap('s2', '2026-06-02T12:00:00.000Z');
    makeSnap('s3', '2026-06-03T12:00:00.000Z');
    setLive('s3');
    const result = await pruneSnapshots({
      courseId: 48895, courseDir, dryRun: false,
      now: Date.parse('2026-06-04T00:00:00.000Z'),
    });
    expect(result.pruned?.map(p => p.snapshotId)).toEqual(['old']);
    expect(existsSync(join(snapshotsRootFor(courseDir), 'old'))).toBe(false);
  });
});
