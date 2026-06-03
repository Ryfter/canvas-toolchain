import { existsSync } from 'node:fs';
import { restorePage } from 'canvas-design-mcp/dist/tools/restore-page.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { CanvasApiClient } from 'canvas-design-mcp/dist/canvas-api.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { readManifest, readState, snapshotDir, readPriorHtml, writeState } from '../publish/snapshot_store.js';
import type { PublishedEntry, PublishState } from '../publish/manifest_types.js';

export interface RollbackCoursePublishInput { snapshotId: string; }

export interface WidgetRollbackResult {
  /** Widget id (matches PublishedEntry.widgets[].id). */
  id: string;
  /** `deleted` = file removed from Canvas Files; `skipped` = nothing to clean
   *  up (the widget had `status: 'failed'` during publish so no file was created);
   *  `failed` = Canvas Files DELETE call errored. */
  status: 'deleted' | 'skipped' | 'failed';
  canvasFileId?: number;
  error?: string;
}

export interface RollbackCoursePublishResult {
  snapshotId: string;
  restored: PublishedEntry[];
  restoreFailed: { filename: string; reason: string }[];
  widgetsCleaned: WidgetRollbackResult[];
  phase: PublishState['phase'];
  error?: string;
  fix?: string[];
}

/** Issue a DELETE against /api/v1/files/{fileId}. Cheap inline fetch keeps the
 *  rollback path self-contained and avoids growing CanvasApiClient with a single-
 *  use surface. */
async function deleteCanvasFile(host: string, token: string, fileId: number): Promise<void> {
  const res = await fetch(`https://${host}/api/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    // 404 means already gone — treat as success (idempotent rollback).
    const body = await res.text().catch(() => '');
    throw new Error(`DELETE /files/${fileId}: ${res.status} ${body.slice(0, 200)}`);
  }
}

/** Optional DI hook so tests can stub the Canvas DELETE without round-tripping. */
export interface RollbackHooks {
  deleteCanvasFile?: typeof deleteCanvasFile;
}

export async function rollbackCoursePublish(
  input: RollbackCoursePublishInput,
  hooks: RollbackHooks = {},
): Promise<RollbackCoursePublishResult> {
  const deleteFileFn = hooks.deleteCanvasFile ?? deleteCanvasFile;
  const dir = snapshotDir(input.snapshotId);
  if (!existsSync(dir)) {
    return {
      snapshotId: input.snapshotId, restored: [], restoreFailed: [], widgetsCleaned: [], phase: 'preview',
      error: 'SNAPSHOT_NOT_FOUND',
      fix: ['Snapshot ID is unknown or already cleaned up.'],
    };
  }

  const manifest = readManifest(dir);
  const state = readState(dir);
  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch (e) {
    return {
      snapshotId: input.snapshotId, restored: [], restoreFailed: [], widgetsCleaned: [], phase: state.phase,
      error: 'MISSING_API_TOKEN', fix: ['Run setup_canvas with your Canvas host and API token.'],
    };
  }
  const api = new CanvasApiClient({
    institution: '',
    colors: { primary: '', primaryDark: '', primaryLight: '', secondary: '' },
    canvasUrl: cfg.canvasUrl,
    apiToken: cfg.apiToken,
  });
  const canvasHost = new URL(cfg.canvasUrl).host;

  const restored: PublishedEntry[] = [];
  const restoreFailed: { filename: string; reason: string }[] = [];
  const widgetsCleaned: WidgetRollbackResult[] = [];

  for (let i = state.published.length - 1; i >= 0; i -= 1) {
    const entry = state.published[i];
    const priorHtml = readPriorHtml(dir, entry.filename);
    const isCreated = entry.action === 'created' && entry.type === 'page';
    try {
      if (entry.type === 'page') {
        await restorePage(
          manifest.courseId,
          entry.canvasPageSlug ?? (entry.canvasUrl ?? entry.filename).split('/').pop()!,
          isCreated ? null : priorHtml,
          api as any,
        );
      } else {
        const manifestEntry = manifest.entries.find(e => e.type === 'assignment' && e.filename === entry.filename);
        if (manifestEntry && manifestEntry.type === 'assignment') {
          await updateAssignmentDescription(
            manifest.courseId, manifestEntry.canvasMatch.assignmentId, priorHtml, api as any,
          );
        }
      }
      restored.push(entry);

      // After page/assignment restore: clean up widget files this publish created.
      // The restored page HTML points at the pre-publish iframe src (the local
      // path or whatever the prior file_id was), so the new widget files we
      // uploaded during publish are no longer referenced — delete them so they
      // don't sit orphaned in Canvas Files.
      //
      // Per Phase 0 finding (file_id changes on every overwrite), we can't restore
      // the PRIOR widget content via re-upload from the snapshot — we'd need to
      // have captured it at preview time (deferred to v1.x). Today's rollback is
      // delete-only: it removes our pollution but does not re-create what was
      // there before.
      for (const w of (entry.widgets ?? [])) {
        if (w.status !== 'published' || typeof w.canvasFileId !== 'number') {
          widgetsCleaned.push({ id: w.id, status: 'skipped' });
          continue;
        }
        try {
          await deleteFileFn(canvasHost, cfg.apiToken, w.canvasFileId);
          widgetsCleaned.push({ id: w.id, status: 'deleted', canvasFileId: w.canvasFileId });
        } catch (e) {
          widgetsCleaned.push({
            id: w.id, status: 'failed', canvasFileId: w.canvasFileId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (e) {
      restoreFailed.push({ filename: entry.filename, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  writeState(dir, { phase: 'rolled-back', published: state.published, lastUpdatedAt: new Date().toISOString() });
  return { snapshotId: input.snapshotId, restored, restoreFailed, widgetsCleaned, phase: 'rolled-back' };
}
