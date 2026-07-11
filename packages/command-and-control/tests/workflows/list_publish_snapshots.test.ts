import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPublishSnapshots } from '../../src/tools/workflows/list_publish_snapshots.js';
import {
  snapshotsRootFor, createSnapshotDirFor, writeManifest, writeState,
} from '../../src/tools/publish/snapshot_store.js';
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
});

function makeSnapshot(id: string, publishedAt: string, phase: PublishState['phase'], backup?: string) {
  const dir = createSnapshotDirFor(id, courseDir);
  const manifest: PreviewManifest = {
    snapshotId: id, courseId: 20255, courseDir,
    generatedAt: publishedAt,
    git: { isRepo: false },
    entries: [{
      type: 'page', filename: 'overview.html', pageType: 'overview',
      intendedTitle: 'Overview', collisionAction: 'create',
      diff: { priorWords: null, newWords: 50, delta: 50, sectionsChanged: 0, calloutsAdded: 0, calloutsRemoved: 0, imagesChanged: 0, hasFullDiff: false },
      warnings: [],
    }],
    summary: { total: 1, pages: 1, assignments: 0, skipped: 0, warningsCount: 0, ferpaCount: 0, collisionsCount: 0 },
    ...(backup ? { backup: { status: backup as any, message: '', detected: {} } } : {}),
  };
  writeManifest(dir, manifest);
  writeState(dir, { phase, published: [], lastUpdatedAt: publishedAt });
}

describe('listPublishSnapshots', () => {
  it('returns empty when no snapshots exist for the course', async () => {
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.currentlyLiveSnapshotId).toBeNull();
    expect(result.snapshots).toEqual([]);
  });

  it('returns snapshots in oldest-to-newest order', async () => {
    makeSnapshot('snap-old', '2026-06-01T12:00:00.000Z', 'published');
    makeSnapshot('snap-new', '2026-06-04T12:00:00.000Z', 'published');

    const meta: PublishStateMeta = {
      courseId: 20255,
      currentlyLiveSnapshotId: 'snap-new',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [
        { snapshotId: 'snap-old', becameLiveAt: '2026-06-01T12:00:00.000Z', becameStaleAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' },
        { snapshotId: 'snap-new', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' },
      ],
    };
    writePublishStateMeta(snapshotsRootFor(courseDir), meta);

    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0]!.snapshotId).toBe('snap-old');
    expect(result.snapshots[1]!.snapshotId).toBe('snap-new');
    expect(result.snapshots[1]!.isCurrent).toBe(true);
    expect(result.snapshots[0]!.isCurrent).toBe(false);
  });

  it('marks canRollBackTo=false for currently-live snapshot', async () => {
    makeSnapshot('snap-live', '2026-06-04T12:00:00.000Z', 'published');
    writePublishStateMeta(snapshotsRootFor(courseDir), {
      courseId: 20255, currentlyLiveSnapshotId: 'snap-live',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [{ snapshotId: 'snap-live', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' }],
    });
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.snapshots[0]!.canRollBackTo).toBe(false);
    expect(result.snapshots[0]!.canRollForwardTo).toBe(false);
  });

  it('marks canRollForwardTo=true for rolled-back snapshots', async () => {
    makeSnapshot('snap-old', '2026-06-01T12:00:00.000Z', 'rolled-back');
    makeSnapshot('snap-new', '2026-06-04T12:00:00.000Z', 'restored');
    writePublishStateMeta(snapshotsRootFor(courseDir), {
      courseId: 20255, currentlyLiveSnapshotId: 'snap-new',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [
        { snapshotId: 'snap-old', becameLiveAt: '2026-06-01T12:00:00.000Z', becameStaleAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' },
        { snapshotId: 'snap-new', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'rollback' },
      ],
    });
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    const old = result.snapshots.find(s => s.snapshotId === 'snap-old')!;
    expect(old.canRollForwardTo).toBe(true);
  });

  it('surfaces backupAtPublishTime when manifest.backup is set', async () => {
    makeSnapshot('snap-1', '2026-06-04T12:00:00.000Z', 'published', 'git-pushed');
    const result = await listPublishSnapshots({ courseId: 20255, courseDir });
    expect(result.snapshots[0]!.backupAtPublishTime).toBe('git-pushed');
  });
});
