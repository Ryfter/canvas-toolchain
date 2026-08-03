import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotsRootFor, readManifest, readState } from '../publish/snapshot_store.js';
import { readPublishStateMeta } from '../publish/state_meta.js';
import type { PreviewManifest, PublishState, BackupStatusCode } from '../publish/manifest_types.js';

export interface ListPublishSnapshotsInput {
  courseId: number;
  /** Course folder — used to resolve the project-local snapshots root. */
  courseDir: string;
}

export interface PublishSnapshotInfo {
  snapshotId: string;
  publishedAt: string;
  phase: PublishState['phase'];
  summary: { pages: number; assignments: number; widgets: number };
  isCurrent: boolean;
  canRollBackTo: boolean;
  canRollForwardTo: boolean;
  backupAtPublishTime?: BackupStatusCode;
}

export interface ListPublishSnapshotsResult {
  currentlyLiveSnapshotId: string | null;
  snapshots: PublishSnapshotInfo[];
}

export async function listPublishSnapshots(
  input: ListPublishSnapshotsInput,
): Promise<ListPublishSnapshotsResult> {
  const snapshotsRoot = snapshotsRootFor(input.courseDir);
  const meta = readPublishStateMeta(snapshotsRoot, input.courseId);
  const currentlyLiveSnapshotId = meta?.currentlyLiveSnapshotId ?? null;

  if (!existsSync(snapshotsRoot)) {
    return { currentlyLiveSnapshotId, snapshots: [] };
  }

  const entries: PublishSnapshotInfo[] = [];
  for (const id of readdirSync(snapshotsRoot)) {
    const dir = join(snapshotsRoot, id);
    if (!existsSync(join(dir, 'manifest.json'))) continue;
    if (!existsSync(join(dir, 'state.json'))) continue;
    let manifest: PreviewManifest;
    let state: PublishState;
    try {
      manifest = readManifest(dir);
      state = readState(dir);
    } catch {
      continue;
    }
    if (manifest.courseId !== input.courseId) continue;

    let widgetCount = 0;
    let pageCount = 0;
    let assignmentCount = 0;
    for (const e of manifest.entries) {
      if (e.type === 'page') {
        pageCount++;
        widgetCount += (e as any).widgets?.length ?? 0;
      } else if (e.type === 'assignment') {
        assignmentCount++;
      }
    }

    const isCurrent = id === currentlyLiveSnapshotId;
    entries.push({
      snapshotId: id,
      publishedAt: manifest.generatedAt,
      phase: state.phase,
      summary: { pages: pageCount, assignments: assignmentCount, widgets: widgetCount },
      isCurrent,
      canRollBackTo: !isCurrent,
      canRollForwardTo: !isCurrent && state.phase === 'rolled-back',
      backupAtPublishTime: manifest.backup?.status,
    });
  }

  // Secondary key so snapshots published in the same millisecond always list in
  // the same order rather than in whatever order the filesystem returned them.
  entries.sort(
    (a, b) =>
      a.publishedAt.localeCompare(b.publishedAt) || a.snapshotId.localeCompare(b.snapshotId),
  );

  return { currentlyLiveSnapshotId, snapshots: entries };
}
