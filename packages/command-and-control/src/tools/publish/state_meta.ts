import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PublishStateMeta, PublishStateMetaHistoryEntry } from './manifest_types.js';

function metaPath(snapshotsRoot: string, courseId: number): string {
  return join(snapshotsRoot, `publish-state-${courseId}.json`);
}

/** Returns the persisted PublishStateMeta for a course, or null if no meta file
 *  exists yet or the file is malformed. Malformed-file case treats as "no meta"
 *  so the next publish can initialize fresh — the alternative (throw) would
 *  hard-block publishing on a corrupted state file. */
export function readPublishStateMeta(snapshotsRoot: string, courseId: number): PublishStateMeta | null {
  const path = metaPath(snapshotsRoot, courseId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PublishStateMeta;
  } catch {
    return null;
  }
}

export function writePublishStateMeta(snapshotsRoot: string, meta: PublishStateMeta): void {
  writeFileSync(metaPath(snapshotsRoot, meta.courseId), JSON.stringify(meta, null, 2), 'utf-8');
}

/** Fresh state for a course with no publishes yet. */
export function initialStateMeta(courseId: number): PublishStateMeta {
  return {
    courseId,
    currentlyLiveSnapshotId: null,
    currentlyLiveSince: new Date(0).toISOString(),
    history: [],
  };
}

/** Atomically update the pointer to a new currently-live snapshot. Marks the
 *  previously-live entry stale (becameStaleAt) and appends a new history entry
 *  for the new live snapshot. */
export function updateCurrentlyLive(
  snapshotsRoot: string,
  courseId: number,
  snapshotId: string,
  via: PublishStateMetaHistoryEntry['becameLiveVia'],
  timestamp: string,
): void {
  const meta = readPublishStateMeta(snapshotsRoot, courseId) ?? initialStateMeta(courseId);

  // Mark previously-live entry stale (if any)
  if (meta.currentlyLiveSnapshotId) {
    for (let i = meta.history.length - 1; i >= 0; i--) {
      const entry = meta.history[i]!;
      if (entry.snapshotId === meta.currentlyLiveSnapshotId && !entry.becameStaleAt) {
        entry.becameStaleAt = timestamp;
        break;
      }
    }
  }

  meta.history.push({ snapshotId, becameLiveAt: timestamp, becameLiveVia: via });
  meta.currentlyLiveSnapshotId = snapshotId;
  meta.currentlyLiveSince = timestamp;
  writePublishStateMeta(snapshotsRoot, meta);
}
