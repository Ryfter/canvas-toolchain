import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotsRootFor } from './snapshot_store.js';
import { readPublishStateMeta } from './state_meta.js';
import { loadCanvasConfig } from '../setup_canvas.js';
import type { PreviewManifest, PublishState } from './manifest_types.js';

export interface ComputePruneInput {
  courseId: number;
  courseDir: string;
  retainCount: number;
  retainDays: number;
  now?: number;
}

export interface ComputePruneResult {
  kept: string[];
  pruned: string[];
  prunedDetail: Array<{
    snapshotId: string;
    publishedAt: string;
    reason: 'count' | 'age';
    daysOld: number;
  }>;
}

interface SnapshotIndexEntry {
  snapshotId: string;
  publishedAt: string;
  phase: PublishState['phase'];
}

function readSnapshotIndex(courseDir: string, courseId: number): SnapshotIndexEntry[] {
  const root = snapshotsRootFor(courseDir);
  if (!existsSync(root)) return [];
  const out: SnapshotIndexEntry[] = [];
  for (const id of readdirSync(root)) {
    const dir = join(root, id);
    if (!existsSync(join(dir, 'manifest.json')) || !existsSync(join(dir, 'state.json'))) continue;
    try {
      const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8')) as PreviewManifest;
      const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8')) as PublishState;
      if (m.courseId !== courseId) continue;
      out.push({ snapshotId: id, publishedAt: m.generatedAt, phase: s.phase });
    } catch { /* skip corrupt */ }
  }
  return out;
}

export function computePruneList(input: ComputePruneInput): ComputePruneResult {
  const all = readSnapshotIndex(input.courseDir, input.courseId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const now = input.now ?? Date.now();
  const ageThresholdMs = input.retainDays * 86_400_000;

  const kept: string[] = [];
  const pruned: string[] = [];
  const prunedDetail: ComputePruneResult['prunedDetail'] = [];

  for (let i = 0; i < all.length; i++) {
    const s = all[i]!;
    const ageMs = now - Date.parse(s.publishedAt);
    const daysOld = Math.floor(ageMs / 86_400_000);
    if (i < input.retainCount) {
      kept.push(s.snapshotId);
    } else if (ageMs < ageThresholdMs) {
      kept.push(s.snapshotId);
    } else {
      pruned.push(s.snapshotId);
      prunedDetail.push({
        snapshotId: s.snapshotId, publishedAt: s.publishedAt,
        reason: i >= input.retainCount ? 'age' : 'count', daysOld,
      });
    }
  }

  const meta = readPublishStateMeta(snapshotsRootFor(input.courseDir), input.courseId);
  const liveId = meta?.currentlyLiveSnapshotId;
  if (liveId && pruned.includes(liveId)) {
    kept.push(liveId);
    const idx = pruned.indexOf(liveId);
    pruned.splice(idx, 1);
    const detailIdx = prunedDetail.findIndex(p => p.snapshotId === liveId);
    if (detailIdx >= 0) prunedDetail.splice(detailIdx, 1);
  }

  return { kept, pruned, prunedDetail };
}

export interface PruneSnapshotsInput {
  courseId: number;
  courseDir: string;
  dryRun?: boolean;
  now?: number;
  onBeforeDelete?: (snapshotId: string) => Promise<BreadcrumbCleanupResult>;
}

export interface BreadcrumbCleanupResult {
  canvasBreadcrumbsCleaned: boolean;
  errors: Array<{ resource: string; reason: string }>;
}

export interface PruneSnapshotsResult {
  wouldPrune: Array<{
    snapshotId: string;
    publishedAt: string;
    reason: 'count' | 'age';
    daysOld: number;
    canvasBreadcrumbsToDelete: number;
  }>;
  pruned?: Array<{
    snapshotId: string;
    canvasBreadcrumbsCleaned: boolean;
    errors: Array<{ resource: string; reason: string }>;
  }>;
  kept: number;
}

export async function pruneSnapshots(input: PruneSnapshotsInput): Promise<PruneSnapshotsResult> {
  let retainCount = 3;
  let retainDays = 30;
  try {
    const cfg = loadCanvasConfig();
    retainCount = cfg.snapshotRetentionCount ?? 3;
    retainDays = cfg.snapshotRetentionDays ?? 30;
  } catch { /* defaults */ }

  const { kept, pruned, prunedDetail } = computePruneList({
    courseId: input.courseId, courseDir: input.courseDir,
    retainCount, retainDays, now: input.now,
  });

  const root = snapshotsRootFor(input.courseDir);
  const wouldPrune = prunedDetail.map(p => ({
    snapshotId: p.snapshotId, publishedAt: p.publishedAt, reason: p.reason, daysOld: p.daysOld,
    canvasBreadcrumbsToDelete: countBreadcrumbs(join(root, p.snapshotId)),
  }));

  if (input.dryRun) {
    return { wouldPrune, kept: kept.length };
  }

  const prunedResults: NonNullable<PruneSnapshotsResult['pruned']> = [];
  for (const id of pruned) {
    const dir = join(root, id);
    let cleanup: BreadcrumbCleanupResult = { canvasBreadcrumbsCleaned: false, errors: [] };
    if (input.onBeforeDelete) {
      try { cleanup = await input.onBeforeDelete(id); }
      catch (e) { cleanup.errors.push({ resource: 'breadcrumb-cleanup', reason: e instanceof Error ? e.message : String(e) }); }
    }
    try {
      rmSync(dir, { recursive: true, force: true });
      prunedResults.push({ snapshotId: id, ...cleanup });
    } catch (e) {
      prunedResults.push({
        snapshotId: id, canvasBreadcrumbsCleaned: cleanup.canvasBreadcrumbsCleaned,
        errors: [...cleanup.errors, { resource: 'snapshot-dir', reason: e instanceof Error ? e.message : String(e) }],
      });
    }
  }

  return { wouldPrune, pruned: prunedResults, kept: kept.length };
}

function countBreadcrumbs(snapshotDir: string): number {
  let n = 0;
  for (const file of ['pages-meta.json', 'widgets-meta.json']) {
    const path = join(snapshotDir, file);
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      const records = (data.pages ?? data.widgets ?? {}) as Record<string, { canvasBreadcrumb?: unknown }>;
      for (const v of Object.values(records)) {
        if (v.canvasBreadcrumb) n++;
      }
    } catch { /* skip */ }
  }
  return n;
}
