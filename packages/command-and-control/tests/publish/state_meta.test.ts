import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readPublishStateMeta,
  writePublishStateMeta,
  updateCurrentlyLive,
  initialStateMeta,
} from '../../src/tools/publish/state_meta.js';
import type { PublishStateMeta } from '../../src/tools/publish/manifest_types.js';

let snapshotsRoot: string;

beforeEach(() => {
  snapshotsRoot = mkdtempSync(join(tmpdir(), 'meta-'));
});

afterEach(() => {
  rmSync(snapshotsRoot, { recursive: true, force: true });
});

describe('readPublishStateMeta', () => {
  it('returns null when no meta file exists for the course', () => {
    expect(readPublishStateMeta(snapshotsRoot, 999)).toBeNull();
  });

  it('reads existing meta file', () => {
    const meta: PublishStateMeta = {
      courseId: 48895,
      currentlyLiveSnapshotId: 'snap-1',
      currentlyLiveSince: '2026-06-04T12:00:00.000Z',
      history: [{ snapshotId: 'snap-1', becameLiveAt: '2026-06-04T12:00:00.000Z', becameLiveVia: 'publish' }],
    };
    writeFileSync(join(snapshotsRoot, 'publish-state-48895.json'), JSON.stringify(meta), 'utf-8');
    expect(readPublishStateMeta(snapshotsRoot, 48895)).toEqual(meta);
  });

  it('returns null when meta file is malformed JSON', () => {
    writeFileSync(join(snapshotsRoot, 'publish-state-48895.json'), '{not json', 'utf-8');
    expect(readPublishStateMeta(snapshotsRoot, 48895)).toBeNull();
  });
});

describe('writePublishStateMeta', () => {
  it('writes meta to the per-course file path', () => {
    const meta = initialStateMeta(48895);
    writePublishStateMeta(snapshotsRoot, meta);
    expect(existsSync(join(snapshotsRoot, 'publish-state-48895.json'))).toBe(true);
    const read = JSON.parse(readFileSync(join(snapshotsRoot, 'publish-state-48895.json'), 'utf-8'));
    expect(read.courseId).toBe(48895);
    expect(read.currentlyLiveSnapshotId).toBeNull();
  });
});

describe('initialStateMeta', () => {
  it('returns an empty meta with no currently-live snapshot', () => {
    const meta = initialStateMeta(48895);
    expect(meta.courseId).toBe(48895);
    expect(meta.currentlyLiveSnapshotId).toBeNull();
    expect(meta.history).toEqual([]);
  });
});

describe('updateCurrentlyLive', () => {
  it('records the new live snapshot and marks the previous one stale', () => {
    const before = initialStateMeta(48895);
    writePublishStateMeta(snapshotsRoot, before);

    updateCurrentlyLive(snapshotsRoot, 48895, 'snap-1', 'publish', '2026-06-04T12:00:00.000Z');
    const afterFirst = readPublishStateMeta(snapshotsRoot, 48895)!;
    expect(afterFirst.currentlyLiveSnapshotId).toBe('snap-1');
    expect(afterFirst.history).toHaveLength(1);
    expect(afterFirst.history[0]!.becameLiveVia).toBe('publish');
    expect(afterFirst.history[0]!.becameStaleAt).toBeUndefined();

    updateCurrentlyLive(snapshotsRoot, 48895, 'snap-2', 'publish', '2026-06-04T13:00:00.000Z');
    const afterSecond = readPublishStateMeta(snapshotsRoot, 48895)!;
    expect(afterSecond.currentlyLiveSnapshotId).toBe('snap-2');
    expect(afterSecond.history).toHaveLength(2);
    expect(afterSecond.history[0]!.snapshotId).toBe('snap-1');
    expect(afterSecond.history[0]!.becameStaleAt).toBe('2026-06-04T13:00:00.000Z');
    expect(afterSecond.history[1]!.snapshotId).toBe('snap-2');
    expect(afterSecond.history[1]!.becameStaleAt).toBeUndefined();
  });

  it('initializes the meta file if it does not exist yet', () => {
    updateCurrentlyLive(snapshotsRoot, 48895, 'snap-1', 'publish', '2026-06-04T12:00:00.000Z');
    const meta = readPublishStateMeta(snapshotsRoot, 48895)!;
    expect(meta.courseId).toBe(48895);
    expect(meta.currentlyLiveSnapshotId).toBe('snap-1');
  });

  it('records via=rollback when a previously-stale snapshot is restored', () => {
    updateCurrentlyLive(snapshotsRoot, 48895, 'snap-1', 'publish', '2026-06-04T12:00:00.000Z');
    updateCurrentlyLive(snapshotsRoot, 48895, 'snap-2', 'publish', '2026-06-04T13:00:00.000Z');
    updateCurrentlyLive(snapshotsRoot, 48895, 'snap-1', 'rollback', '2026-06-04T14:00:00.000Z');

    const meta = readPublishStateMeta(snapshotsRoot, 48895)!;
    expect(meta.currentlyLiveSnapshotId).toBe('snap-1');
    expect(meta.history).toHaveLength(3);
    expect(meta.history[2]!.becameLiveVia).toBe('rollback');
  });
});
