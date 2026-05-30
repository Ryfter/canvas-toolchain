import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCcHomePath } from '../../kb/config.js';
import type { PreviewManifest, PublishState, StaleSnapshotPointer } from './manifest_types.js';

function snapshotsRoot(): string {
  const root = join(getCcHomePath(), 'publish-snapshots');
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

export function newSnapshotId(): string {
  return randomUUID();
}

export function createSnapshotDir(snapshotId: string): string {
  const dir = join(snapshotsRoot(), snapshotId);
  mkdirSync(join(dir, 'prior'), { recursive: true });
  mkdirSync(join(dir, 'new'), { recursive: true });
  mkdirSync(join(dir, 'diffs'), { recursive: true });
  return dir;
}

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

export function snapshotDir(snapshotId: string): string {
  return join(snapshotsRoot(), snapshotId);
}

export function findStaleSnapshot(courseId: number): StaleSnapshotPointer | undefined {
  const root = snapshotsRoot();
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
  const latest = candidates[0];
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
