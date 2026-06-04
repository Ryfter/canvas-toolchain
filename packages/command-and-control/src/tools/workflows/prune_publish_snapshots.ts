import { pruneSnapshots, type PruneSnapshotsResult } from '../publish/pruning.js';
import { cleanupCanvasBreadcrumbsForSnapshot } from '../publish/breadcrumbs.js';

export interface PrunePublishSnapshotsInput {
  courseId: number;
  courseDir: string;
  dryRun?: boolean;
}

export async function prunePublishSnapshots(
  input: PrunePublishSnapshotsInput,
): Promise<PruneSnapshotsResult> {
  return pruneSnapshots({
    courseId: input.courseId,
    courseDir: input.courseDir,
    dryRun: input.dryRun ?? false,
    onBeforeDelete: input.dryRun
      ? undefined
      : (snapshotId) =>
          cleanupCanvasBreadcrumbsForSnapshot({
            snapshotId,
            courseId: input.courseId,
            courseDir: input.courseDir,
          }),
  });
}
