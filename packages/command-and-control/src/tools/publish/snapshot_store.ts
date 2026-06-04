import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCcHomePath } from '../../kb/config.js';
import { loadCanvasConfig } from '../setup_canvas.js';
import {
  resolveSnapshotsRoot, resolveSnapshotDir, type SnapshotsLocation,
} from './snapshot_location.js';
import type { PreviewManifest, PublishState, StaleSnapshotPointer } from './manifest_types.js';

/** Legacy global root — the path used before V&R Plan A. Lookups for old
 *  snapshots still resolve through this via the snapshot_location fallback. */
function legacyGlobalRoot(): string {
  const root = join(getCcHomePath(), 'publish-snapshots');
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

function effectiveLocation(): SnapshotsLocation {
  try {
    const cfg = loadCanvasConfig();
    return cfg.snapshotsLocation ?? 'project';
  } catch {
    return 'project';
  }
}

/** Snapshots root for a specific course. Uses the configured location (default
 *  project-local) with legacy global fallback for lookups. */
export function snapshotsRootFor(courseDir: string): string {
  return resolveSnapshotsRoot({
    courseDir,
    location: effectiveLocation(),
    legacyGlobalRoot: legacyGlobalRoot(),
  });
}

/** Resolve a specific snapshot directory. Checks project-local first; falls
 *  back to legacy global when location='project' and the snapshot isn't found
 *  in the project location. */
export function snapshotDirFor(snapshotId: string, courseDir: string): string {
  return resolveSnapshotDir({
    snapshotId,
    courseDir,
    location: effectiveLocation(),
    legacyGlobalRoot: legacyGlobalRoot(),
  });
}

// === LEGACY (no-courseDir) wrappers — kept unchanged for backward compat ===

function snapshotsRootLegacy(): string {
  return legacyGlobalRoot();
}

export function newSnapshotId(): string {
  return randomUUID();
}

/** @deprecated — use createSnapshotDirFor(snapshotId, courseDir). */
export function createSnapshotDir(snapshotId: string): string {
  const dir = join(snapshotsRootLegacy(), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  return dir;
}

/** New courseDir-aware snapshot creation. Uses snapshotsRootFor() to land at
 *  <courseDir>/.canvas-toolchain/publish-snapshots/ (default) or the legacy
 *  global path (when setup_canvas has snapshotsLocation='global'). */
export function createSnapshotDirFor(snapshotId: string, courseDir: string): string {
  const dir = join(snapshotsRootFor(courseDir), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  return dir;
}

// === Existing helpers below — unchanged signatures (still work with legacy global) ===

export function writeManifest(dir: string, manifest: PreviewManifest): void {
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

export function readManifest(dir: string): PreviewManifest {
  return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
}

export function writePriorHtml(dir: string, filename: string, html: string): void {
  writeFileSync(join(dir, 'prior', filename), html, 'utf-8');
}

export function readPriorHtml(dir: string, filename: string): string {
  return readFileSync(join(dir, 'prior', filename), 'utf-8');
}

export function priorHtmlExists(dir: string, filename: string): boolean {
  return existsSync(join(dir, 'prior', filename));
}

export function writeNewHtml(dir: string, filename: string, html: string): void {
  writeFileSync(join(dir, 'new', filename), html, 'utf-8');
}

export function writeFullDiff(dir: string, filename: string, diff: string): void {
  writeFileSync(join(dir, 'diffs', `${filename}.diff`), diff, 'utf-8');
}

export function readFullDiff(dir: string, filename: string): string {
  return readFileSync(join(dir, 'diffs', `${filename}.diff`), 'utf-8');
}

export function writeState(dir: string, state: PublishState): void {
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

export function readState(dir: string): PublishState {
  return JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
}

/** @deprecated — use snapshotDirFor(snapshotId, courseDir). */
export function snapshotDir(snapshotId: string): string {
  return join(snapshotsRootLegacy(), snapshotId);
}

export function findStaleSnapshot(courseId: number): StaleSnapshotPointer | undefined {
  // Existing implementation — searches the legacy global path. Still correct
  // for partial-publish recovery from before this refactor. Project-local
  // partial-snapshot discovery is a future enhancement.
  const root = legacyGlobalRoot();
  if (!existsSync(root)) return undefined;
  const candidates: { snapshotId: string; state: PublishState; manifest: PreviewManifest }[] = [];
  for (const id of readdirSync(root)) {
    const dir = join(root, id);
    if (!existsSync(join(dir, 'state.json'))) continue;
    if (!existsSync(join(dir, 'manifest.json'))) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
      if (m.courseId !== courseId) continue;
      const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
      if (s.phase === 'partial') candidates.push({ snapshotId: id, state: s, manifest: m });
    } catch { /* skip corrupt */ }
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => a.state.lastUpdatedAt < b.state.lastUpdatedAt ? 1 : -1);
  const latest = candidates[0]!;
  const failed = latest.state.failed;
  if (!failed) return undefined;
  return {
    snapshotId: latest.snapshotId,
    lastFailedFile: failed.filename,
    failedAt: failed.failedAt,
    fix: [
      'Resolve the underlying Canvas error reported in state.json.',
      `Resume with publish_course { snapshotId: "${latest.snapshotId}", resume: true } once ready,`,
      `or rollback with rollback_course_publish { snapshotId: "${latest.snapshotId}" }.`,
    ],
  };
}
