import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type SnapshotsLocation = 'project' | 'global';

export interface ResolveSnapshotsRootInput {
  courseDir: string;
  location: SnapshotsLocation;
  /** Absolute path to the legacy global snapshots root.
   *  Typically: join(homedir(), '.command-and-control', 'publish-snapshots') */
  legacyGlobalRoot: string;
}

/** Returns the absolute root directory where this course's snapshots live.
 *  Creates the directory if missing. */
export function resolveSnapshotsRoot(input: ResolveSnapshotsRootInput): string {
  const root = input.location === 'project'
    ? join(input.courseDir, '.canvas-toolchain', 'publish-snapshots')
    : input.legacyGlobalRoot;
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

export interface ResolveSnapshotDirInput extends ResolveSnapshotsRootInput {
  snapshotId: string;
}

/** Resolves the absolute path to a specific snapshot. For lookups, checks the
 *  configured location first then falls back to the legacy global location
 *  (so existing snapshots from before this refactor remain readable).
 *
 *  For new-snapshot creation, callers will always get the configured location
 *  back when the snapshotId doesn't exist anywhere. */
export function resolveSnapshotDir(input: ResolveSnapshotDirInput): string {
  const primaryRoot = resolveSnapshotsRoot(input);
  const primaryPath = join(primaryRoot, input.snapshotId);

  // Existence check at the primary location
  if (existsSync(join(primaryPath, 'manifest.json'))) return primaryPath;

  // Fallback to legacy location (only useful when configured location is 'project')
  if (input.location === 'project' && existsSync(join(input.legacyGlobalRoot, input.snapshotId, 'manifest.json'))) {
    return join(input.legacyGlobalRoot, input.snapshotId);
  }

  // Not found anywhere — return the primary path (for fresh creation)
  return primaryPath;
}
