import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishToCanvas } from 'canvas-design-mcp/dist/tools/publish.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { CanvasApiClient, CanvasApiError } from 'canvas-design-mcp/dist/canvas-api.js';
import { publishWidget as publishWidgetReal } from 'canvas-design-mcp/dist/tools/publish-widget.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import {
  readManifest, readState, writeState, snapshotDir,
} from '../publish/snapshot_store.js';
import { snapshotsRootFor } from '../publish/snapshot_store.js';
import { updateCurrentlyLive } from '../publish/state_meta.js';
import { pruneSnapshots, type PruneSnapshotsResult } from '../publish/pruning.js';
import { cleanupCanvasBreadcrumbsForSnapshot, createPageBreadcrumb } from '../publish/breadcrumbs.js';
import { loadCanvasConfig } from '../setup_canvas.js';
import { updatePageMetaEntry } from '../publish/pages_meta.js';
import { validateApprovals } from '../publish/approvals.js';
import { detectGitState, gitCommitPrePublish, gitTagSuccess, gitPushTag } from '../publish/git_state.js';
import { detectBackupState } from '../publish/backup_detection.js';
import {
  discoverWidgetRefs,
  substituteWidgetIframeSrc,
  resolveWidgetFiles,
  loadWidgetSpec,
} from '../publish/widget_discovery.js';
import { updateWidgetMetaEntry, widgetMetaKey } from '../publish/widgets_meta.js';
import type {
  PreviewManifest, PublishState, PublishedEntry, FailedEntry, WidgetPublishResult, BackupStatus,
} from '../publish/manifest_types.js';
import type { ApprovalMap } from '../publish/approvals.js';

export interface PublishCourseInput {
  snapshotId: string;
  approvals: ApprovalMap;
  resume?: boolean;
  gitCommit?: boolean;
  pushTag?: boolean;
  /** V&R Plan C — per-run override for Canvas breadcrumbs. When unset, falls back
   *  to setup_canvas.canvasBreadcrumbs (default enabled). */
  canvasBreadcrumbs?: boolean;
}

/** Optional dependency-injection hooks for tests. Production callers pass nothing. */
export interface PublishCourseHooks {
  /** Override the publish_widget function (canvas-design-mcp). Tests inject a mock
   *  to avoid round-tripping through real Canvas Files. */
  publishWidget?: typeof publishWidgetReal;
}

export interface PublishCourseResult {
  snapshotId: string;
  phase: PublishState['phase'];
  published: PublishedEntry[];
  failed?: FailedEntry;
  gitTag?: string;
  pushResult?: { ok: true } | { ok: false; reason: string };
  error?: string;
  message?: string;
  fix?: string[];
  /** NEW (V&R Plan C): backup recommendation at publish time. */
  backup?: BackupStatus;
  /** NEW (V&R Plan C): auto-prune summary. Failure is swallowed; an empty result
   *  here means pruning errored, not that there was nothing to prune. */
  pruning?: PruneSnapshotsResult;
}

function readNewHtml(dir: string, filename: string): string {
  return readFileSync(join(dir, 'new', filename), 'utf-8');
}

function tagFor(manifest: PreviewManifest): string {
  return `published-${manifest.generatedAt.slice(0, 10)}-${manifest.courseId}`;
}

/** Process widgets referenced by the page HTML: discover iframe refs, upload each
 *  via publish_widget, substitute Canvas URLs into the HTML. Per-widget fail-soft —
 *  a single widget failure leaves its local-relative iframe untouched and records
 *  the error, but does NOT abort the page or other widgets. */
async function processPageWidgets(
  pageHtml: string,
  courseId: number,
  courseDir: string,
  canvasConfig: { host: string; token: string },
  publishWidgetFn: typeof publishWidgetReal,
  snapshotDir: string,
): Promise<{ rewrittenHtml: string; widgets: WidgetPublishResult[] }> {
  const refs = discoverWidgetRefs(pageHtml);
  if (refs.length === 0) return { rewrittenHtml: pageHtml, widgets: [] };

  const widgets: WidgetPublishResult[] = [];
  let html = pageHtml;

  for (const ref of refs) {
    try {
      const files = resolveWidgetFiles(courseDir, ref);
      if (!existsSync(files.htmlPath)) {
        widgets.push({ id: ref.id, status: 'failed', error: `widget HTML not found at ${files.htmlPath}` });
        continue;
      }
      const spec = loadWidgetSpec(files.specPath);
      const result = await publishWidgetFn({
        htmlPath: files.htmlPath,
        courseId,
        canvasConfig,
        widgetSpec: spec,
      });
      // V&R Plan B: record the file_id for rollback. Distinct from priorCanvasFileId
      // because overwrite changes the id (Phase 0 finding 2026-06-03).
      updateWidgetMetaEntry(snapshotDir, widgetMetaKey(ref.slug, ref.id), {
        publishedCanvasFileId: result.canvasFileId,
      });
      html = substituteWidgetIframeSrc(html, ref, result.embedSrc);
      widgets.push({ id: ref.id, status: 'published', canvasFileId: result.canvasFileId });
    } catch (e) {
      widgets.push({
        id: ref.id,
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { rewrittenHtml: html, widgets };
}

export async function publishCourse(input: PublishCourseInput, hooks: PublishCourseHooks = {}): Promise<PublishCourseResult> {
  const publishWidgetFn = hooks.publishWidget ?? publishWidgetReal;
  const dir = snapshotDir(input.snapshotId);
  if (!existsSync(dir)) {
    return {
      snapshotId: input.snapshotId, phase: 'preview', published: [],
      error: 'SNAPSHOT_NOT_FOUND',
      fix: ['Run preview_course_publish first to create a snapshot.'],
    };
  }

  const manifest = readManifest(dir);
  const state = readState(dir);
  const backup = detectBackupState(manifest.courseDir);

  const validation = validateApprovals(manifest, input.approvals);
  if (!validation.ok) {
    return {
      snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'APPROVALS_INCOMPLETE',
      message: `missing: ${validation.missing.join(', ')}; unknown: ${validation.unknown.join(', ')}`,
      fix: ['Provide an approve|skip action for every non-skipped manifest entry.'],
    };
  }

  // Phase guard: refuse re-running against a snapshot that already finished or got rolled back,
  // and refuse a partial snapshot unless the caller explicitly opted into resume. Without this,
  // a second invocation silently orphans the prior published[] from the final state and breaks
  // rollback coverage.
  if (state.phase === 'published') {
    return {
      snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'ALREADY_PUBLISHED',
      fix: ['This snapshot has already been published. Run preview_course_publish for a fresh snapshot.'],
    };
  }
  if (state.phase === 'rolled-back') {
    return {
      snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'ALREADY_ROLLED_BACK',
      fix: ['This snapshot has been rolled back. Run preview_course_publish for a fresh snapshot.'],
    };
  }
  if (state.phase === 'partial' && !input.resume) {
    return {
      snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'PARTIAL_SNAPSHOT_REQUIRES_RESUME',
      message: `Snapshot ${input.snapshotId} stopped partway. Call publish_course again with resume:true to continue, or rollback_course_publish to undo the ${state.published.length} entries already published.`,
      fix: ['Pass resume:true to continue from the failed entry, or call rollback_course_publish.'],
    };
  }

  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch (e) {
    return {
      snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'MISSING_API_TOKEN', message: e instanceof Error ? e.message : String(e),
      fix: ['Run setup_canvas with your Canvas host and API token.'],
    };
  }

  // CanvasApiClient requires the full InstitutionConfig shape; institution/colors are display-only
  // fields unused by the HTTP client. Supply minimal placeholders so the type is satisfied.
  const api = new CanvasApiClient({
    institution: '',
    colors: { primary: '', primaryDark: '', primaryLight: '', secondary: '' },
    canvasUrl: cfg.canvasUrl,
    apiToken: cfg.apiToken,
  });

  // V&R Plan C: per-run override beats setup_canvas default (which defaults to enabled).
  const breadcrumbsEnabled = (() => {
    if (typeof input.canvasBreadcrumbs === 'boolean') return input.canvasBreadcrumbs;
    try { return loadCanvasConfig().canvasBreadcrumbs !== 'disabled'; }
    catch { return true; }
  })();

  const gitCommit = input.gitCommit !== false;
  const git = detectGitState(manifest.courseDir);
  let gitTag: string | undefined;

  if (gitCommit && git.isRepo) {
    if (!git.clean && !input.resume) {
      return {
        snapshotId: input.snapshotId, phase: state.phase, published: state.published,
        error: 'GIT_DIRTY_TREE',
        fix: ['Commit or stash uncommitted changes in courseDir before publishing, or pass gitCommit:false.'],
      };
    }
    if (!input.resume) {
      gitCommitPrePublish(manifest.courseDir, `publish_course: pre-publish snapshot ${input.snapshotId}`);
    }
  }

  const alreadyPublished = new Set(state.published.map(p => p.filename));
  const published: PublishedEntry[] = input.resume ? [...state.published] : [];

  for (const entry of manifest.entries) {
    if (entry.type === 'skipped') continue;
    if (input.approvals[entry.filename] !== 'approve') continue;
    if (alreadyPublished.has(entry.filename)) continue;
    if ('warnings' in entry && entry.warnings.some(w => w.severity === 'block')) {
      const failed: FailedEntry = {
        filename: entry.filename, type: entry.type, reason: 'blocked by severity:block warning',
        code: 'BLOCKING_WARNINGS', failedAt: new Date().toISOString(),
      };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return { snapshotId: input.snapshotId, phase: 'partial', published, failed };
    }
    const newHtmlRaw = readNewHtml(dir, entry.filename);
    try {
      if (entry.type === 'page') {
        // V&R Plan C — Task C4.1: archive prior page body before publish overwrites it.
        // Only fires when a Canvas page already exists at the matched slug (collisionAction='update').
        // Failure here MUST NOT abort publish — log + continue.
        if (breadcrumbsEnabled && entry.canvasMatch) {
          try {
            const priorHtml = readFileSync(join(dir, 'prior', entry.filename), 'utf-8');
            const date = manifest.generatedAt.slice(0, 10);
            const isoTimestamp = `${manifest.generatedAt.slice(0, 10)} ${manifest.generatedAt.slice(11, 16)} UTC`;
            const breadcrumb = await createPageBreadcrumb({
              courseId: manifest.courseId,
              canvasUrl: cfg.canvasUrl,
              apiToken: cfg.apiToken,
              originalTitle: entry.intendedTitle,
              originalSlug: entry.canvasMatch.pageId,
              priorBodyHtml: priorHtml,
              date,
              isoTimestamp,
            });
            updatePageMetaEntry(dir, entry.filename, { canvasBreadcrumb: breadcrumb });
          } catch (e) {
            console.warn(`page breadcrumb failed for ${entry.filename}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Process any widget iframe references before publishing the page HTML.
        // The host is derived from canvasUrl (which includes scheme + maybe port);
        // publish_widget's CanvasConfig wants the bare host.
        const canvasHost = new URL(cfg.canvasUrl).host;
        const { rewrittenHtml, widgets } = await processPageWidgets(
          newHtmlRaw,
          manifest.courseId,
          manifest.courseDir,
          { host: canvasHost, token: cfg.apiToken },
          publishWidgetFn,
          dir,
        );
        const out = await publishToCanvas(
          { courseId: manifest.courseId, html: rewrittenHtml, pageTitle: entry.intendedTitle,
            collisionAction: entry.canvasMatch ? 'update' : 'create' },
          { canvasUrl: cfg.canvasUrl, apiToken: cfg.apiToken } as any, api as any,
        );
        if ('error' in out) throw new CanvasApiError(0, (out.code as string) ?? 'PUBLISH_FAILED', out.error ?? 'publish failed');
        published.push({
          filename: entry.filename, type: 'page', canvasUrl: out.url, action: out.action,
          canvasPageSlug: entry.canvasMatch?.pageId,
          publishedAt: new Date().toISOString(),
          ...(widgets.length > 0 ? { widgets } : {}),
        });
      } else if (entry.type === 'assignment') {
        const newHtml = newHtmlRaw;
        await updateAssignmentDescription(
          manifest.courseId, entry.canvasMatch.assignmentId, newHtml, api as any,
        );
        published.push({
          filename: entry.filename, type: 'assignment', action: 'updated',
          publishedAt: new Date().toISOString(),
        });
      }
      writeState(dir, { phase: 'partial', published, lastUpdatedAt: new Date().toISOString() });
    } catch (e) {
      const code = e instanceof CanvasApiError ? e.code : 'PUBLISH_FAILED';
      const reason = e instanceof Error ? e.message : String(e);
      const failed: FailedEntry = {
        filename: entry.filename, type: entry.type as 'page' | 'assignment',
        reason, code, failedAt: new Date().toISOString(),
      };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return { snapshotId: input.snapshotId, phase: 'partial', published, failed };
    }
  }

  if (gitCommit && git.isRepo) {
    gitTag = tagFor(manifest);
    try { gitTagSuccess(manifest.courseDir, gitTag); } catch { /* tag may already exist on resume */ }
  }

  let pushResult: { ok: true } | { ok: false; reason: string } | undefined;
  if (input.pushTag && gitTag && git.remote) {
    pushResult = gitPushTag(manifest.courseDir, gitTag);
  }

  // V&R Pattern B: update the pointer file. This snapshot is now currently-live.
  const snapshotsRoot = snapshotsRootFor(manifest.courseDir);
  updateCurrentlyLive(snapshotsRoot, manifest.courseId, input.snapshotId, 'publish', new Date().toISOString());

  writeState(dir, { phase: 'published', published, lastUpdatedAt: new Date().toISOString() });

  // V&R Plan C: auto-prune after a successful publish. Failure here must NEVER
  // mask a successful publish — swallow the error, return an empty pruning result.
  const pruning = await pruneSnapshots({
    courseId: manifest.courseId,
    courseDir: manifest.courseDir,
    dryRun: false,
    onBeforeDelete: (snapshotId) =>
      cleanupCanvasBreadcrumbsForSnapshot({
        snapshotId,
        courseId: manifest.courseId,
        courseDir: manifest.courseDir,
      }),
  }).catch((): PruneSnapshotsResult => ({ wouldPrune: [], pruned: [], kept: 0 }));

  return { snapshotId: input.snapshotId, phase: 'published', published, gitTag, pushResult, backup, pruning };
}
