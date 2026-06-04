import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { restorePage } from 'canvas-design-mcp/dist/tools/restore-page.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { CanvasApiClient } from 'canvas-design-mcp/dist/canvas-api.js';
import { publishWidget as publishWidgetReal } from 'canvas-design-mcp/dist/tools/publish-widget.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { readManifest, readState, snapshotDir, readPriorHtml, writeState, snapshotsRootFor, snapshotDirFor } from '../publish/snapshot_store.js';
import { readPublishStateMeta, updateCurrentlyLive } from '../publish/state_meta.js';
import { readWidgetsMeta } from '../publish/widgets_meta.js';
import { loadWidgetSpec, resolveWidgetFiles } from '../publish/widget_discovery.js';
import { rewriteIframeFileId } from '../publish/widget_iframe_rewrite.js';
import type { PublishedEntry, PublishState } from '../publish/manifest_types.js';

export interface RollbackCoursePublishInput {
  /** Snapshot being undone — the one whose state.phase will become 'rolled-back'. */
  snapshotId: string;
  /** NEW: target snapshot to restore TO. When omitted, defaults to the snapshot
   *  immediately PRIOR to currently-live (matches today's "undo last publish"
   *  behavior). */
  targetSnapshotId?: string;
}

export interface WidgetRollbackResult {
  /** Widget id (matches PublishedEntry.widgets[].id). */
  id: string;
  /** V&R Plan B values:
   *  - 'restored'   — prior content re-uploaded to Canvas Files (new file_id per
   *                   Phase 0); host page iframe src rewritten in lockstep.
   *  - 'deleted'    — no prior content existed (widget was 'new' at preview);
   *                   the publish-time file was deleted from Canvas Files.
   *  - 'skipped'    — widget had status:'failed' during publish; nothing to undo.
   *  - 'failed'     — Canvas API call errored during restore or delete. */
  status: 'restored' | 'deleted' | 'skipped' | 'failed';
  /** For 'restored': the new file_id after re-upload. For 'deleted': the file_id
   *  just removed from Canvas. */
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

/** Optional DI hooks so tests can stub Canvas writes without round-tripping. */
export interface RollbackHooks {
  deleteCanvasFile?: typeof deleteCanvasFile;
  /** Override the publish_widget function (canvas-design-mcp). Tests inject a mock
   *  to avoid round-tripping through real Canvas Files when restoring prior content. */
  publishWidget?: typeof publishWidgetReal;
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

  // V&R Plan B: widget content restore reads the snapshot's widgets-meta to know
  // which widgets had prior content captured at preview time.
  const widgetsMeta = readWidgetsMeta(dir);
  const publishWidgetFn = hooks.publishWidget ?? publishWidgetReal;

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

      // V&R Plan B widget restore (closes the rollback-content-restore v1.x gap).
      // For each published widget: if prior content was captured at preview time,
      // re-upload it via publishWidget (gets a new file_id per Phase 0) and rewrite
      // the host page's iframe src in lockstep. Otherwise fall back to the
      // pre-V&R delete-only behavior (no prior content to restore).
      const pageSlugForRestore = entry.canvasPageSlug
        ?? (entry.canvasUrl ?? entry.filename).split('/').pop()!;
      let pageHtmlForRewrite: string | undefined;
      let pageHtmlChanged = false;

      for (const w of (entry.widgets ?? [])) {
        if (w.status !== 'published' || typeof w.canvasFileId !== 'number') {
          widgetsCleaned.push({ id: w.id, status: 'skipped' });
          continue;
        }

        // Find the widgets-meta entry by id (key format is `<slug>__<id>`).
        const metaKey = Object.keys(widgetsMeta.widgets).find(k => k.endsWith(`__${w.id}`));
        const meta = metaKey ? widgetsMeta.widgets[metaKey]! : undefined;
        const slug = metaKey ? metaKey.slice(0, metaKey.length - `__${w.id}`.length) : undefined;
        const priorWidgetPath = (metaKey && slug)
          ? join(dir, 'prior', 'widgets', `${metaKey}.html`)
          : undefined;

        const canRestore = !!(
          meta
          && meta.priorCanvasFileId !== null
          && priorWidgetPath
          && existsSync(priorWidgetPath)
          && slug
        );

        if (canRestore) {
          try {
            // Re-upload prior content. publishWidget needs a spec (read from the
            // courseDir copy — same spec that was used at publish time).
            const files = resolveWidgetFiles(manifest.courseDir, { slug: slug!, id: w.id, fullMatch: '' });
            const spec = loadWidgetSpec(files.specPath);

            const restoredWidget = await publishWidgetFn({
              htmlPath: priorWidgetPath!,
              courseId: manifest.courseId,
              canvasConfig: { host: canvasHost, token: cfg.apiToken },
              widgetSpec: spec,
            });

            // Lazily fetch + rewrite the page HTML.
            // restorePage above wrote the snapshot's prior page HTML to Canvas;
            // that HTML's iframe srcs point at the ORIGINAL priorCanvasFileId
            // (which may not exist anymore on Canvas — the publish overwrote it
            // per Phase 0). We re-uploaded the prior content and got a fresh
            // file_id back. Swap iframe srcs from priorCanvasFileId →
            // restoredWidget.canvasFileId so the restored page points at the
            // newly-uploaded copy of the prior content.
            if (entry.type === 'page' && meta!.priorCanvasFileId !== null) {
              if (pageHtmlForRewrite === undefined) {
                pageHtmlForRewrite = await api.getPageBody(manifest.courseId, pageSlugForRestore);
              }
              const rewritten = rewriteIframeFileId(pageHtmlForRewrite, meta!.priorCanvasFileId, restoredWidget.canvasFileId);
              if (rewritten !== pageHtmlForRewrite) {
                pageHtmlForRewrite = rewritten;
                pageHtmlChanged = true;
              }
            }

            widgetsCleaned.push({ id: w.id, status: 'restored', canvasFileId: restoredWidget.canvasFileId });
          } catch (e) {
            widgetsCleaned.push({
              id: w.id, status: 'failed', canvasFileId: w.canvasFileId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        } else {
          // Pre-V&R delete-only fallback for widgets with no prior content.
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
      }

      // After all widgets settled, push the rewritten page HTML back to Canvas
      // (only when any iframe src actually changed).
      if (pageHtmlChanged && entry.type === 'page' && pageHtmlForRewrite !== undefined) {
        try {
          await api.updatePage(manifest.courseId, pageSlugForRestore, pageHtmlForRewrite);
        } catch (e) {
          restoreFailed.push({
            filename: entry.filename,
            reason: `widget restore succeeded but page HTML rewrite failed: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
    } catch (e) {
      restoreFailed.push({ filename: entry.filename, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // V&R Pattern B: flip the pointer file. Determine the rollback target:
  // - If input.targetSnapshotId is set, use it directly.
  // - Otherwise, default to the snapshot immediately PRIOR to input.snapshotId
  //   from the pointer file's history (matches "undo my last publish" semantics).
  const snapshotsRoot = snapshotsRootFor(manifest.courseDir);
  const meta = readPublishStateMeta(snapshotsRoot, manifest.courseId);
  let pointerTarget: string | null = input.targetSnapshotId ?? null;

  if (!pointerTarget && meta) {
    const idxOfRolledBack = meta.history.findIndex(h => h.snapshotId === input.snapshotId);
    if (idxOfRolledBack > 0) {
      pointerTarget = meta.history[idxOfRolledBack - 1]!.snapshotId;
    }
  }

  if (pointerTarget) {
    updateCurrentlyLive(snapshotsRoot, manifest.courseId, pointerTarget, 'rollback', new Date().toISOString());

    // Update the TARGET snapshot's state.phase to 'restored' and bump restoredCount.
    const targetDir = snapshotDirFor(pointerTarget, manifest.courseDir);
    if (existsSync(join(targetDir, 'state.json'))) {
      const targetState = readState(targetDir);
      writeState(targetDir, {
        ...targetState,
        phase: 'restored',
        restoredCount: (targetState.restoredCount ?? 0) + 1,
        lastUpdatedAt: new Date().toISOString(),
      });
    }
  }

  writeState(dir, { phase: 'rolled-back', published: state.published, lastUpdatedAt: new Date().toISOString() });
  return { snapshotId: input.snapshotId, restored, restoreFailed, widgetsCleaned, phase: 'rolled-back' };
}
