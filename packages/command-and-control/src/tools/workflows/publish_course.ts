import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishToCanvas } from 'canvas-design-mcp/dist/tools/publish.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { CanvasApiClient, CanvasApiError } from 'canvas-design-mcp/dist/canvas-api.js';
import { publishWidget as publishWidgetReal } from 'canvas-design-mcp/dist/tools/publish-widget.js';
import { appendAcknowledgment, upsertReviewEntry, clearReviewEntryIfClean } from 'canvas-design-mcp/dist/tools/a11y/records.js';
import { DEFAULT_REQUIRED_LEVEL } from '@canvas-toolchain/shared-types';
import { evaluateEntryA11yGate } from '../publish/a11y_gate.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import {
  readManifest, readState, writeState, snapshotDir,
} from '../publish/snapshot_store.js';
import { snapshotsRootFor } from '../publish/snapshot_store.js';
import { updateCurrentlyLive } from '../publish/state_meta.js';
import { pruneSnapshots, type PruneSnapshotsResult } from '../publish/pruning.js';
import { cleanupCanvasBreadcrumbsForSnapshot, createPageBreadcrumb, uploadWidgetBreadcrumb } from '../publish/breadcrumbs.js';
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
  /** Per-file accessibility acknowledgments (spec §3): true = borderline-only;
   *  string[] = named clear-failure SCs. Recorded to <courseDir>/.a11y/. */
  a11yAcknowledgments?: { [filename: string]: true | string[] };
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
  breadcrumbsEnabled: boolean,
  generatedAt: string,
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

      // V&R Plan C — Task C4.2: archive prior widget bytes before publish overwrites them.
      // Source is the prior-content capture Plan B wrote at preview time. If that file
      // doesn't exist (no prior content to archive), silently skip — non-fatal.
      if (breadcrumbsEnabled) {
        const priorWidgetPath = join(snapshotDir, 'prior', 'widgets', `${ref.slug}__${ref.id}.html`);
        if (existsSync(priorWidgetPath)) {
          try {
            const priorContent = readFileSync(priorWidgetPath, 'utf-8');
            const breadcrumb = await uploadWidgetBreadcrumb({
              courseId,
              canvasHost: canvasConfig.host,
              apiToken: canvasConfig.token,
              date: generatedAt.slice(0, 10),
              slug: ref.slug,
              widgetId: ref.id,
              priorContentHtml: priorContent,
            });
            updateWidgetMetaEntry(snapshotDir, widgetMetaKey(ref.slug, ref.id), {
              canvasBreadcrumb: breadcrumb,
            });
          } catch (e) {
            console.warn(`widget breadcrumb failed for ${ref.slug}__${ref.id}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

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
    const entryWarnings = 'warnings' in entry ? entry.warnings : [];
    // Canonical review-queue page key (#111): output-relative, forward-slashed path,
    // matching audit_course_accessibility's derivation. Pre-#111 snapshots have no
    // relPath and fall back to filename (legacy key, not unique across weeks).
    const queuePage = entry.relPath ?? entry.filename;
    if (entryWarnings.some(w => w.severity === 'block' && w.kind !== 'a11y')) {
      const failed: FailedEntry = {
        filename: entry.filename, type: entry.type, reason: 'blocked by severity:block warning',
        code: 'BLOCKING_WARNINGS', failedAt: new Date().toISOString(),
      };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return { snapshotId: input.snapshotId, phase: 'partial', published, failed };
    }
    const a11yGate = evaluateEntryA11yGate(entryWarnings, input.a11yAcknowledgments?.[entry.filename]);
    if (!a11yGate.ok) {
      const failed: FailedEntry = {
        filename: entry.filename, type: entry.type,
        reason: a11yGate.reason ?? 'accessibility acknowledgment required',
        code: 'ACCESSIBILITY_ACK_REQUIRED', failedAt: new Date().toISOString(),
      };
      writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
      return {
        snapshotId: input.snapshotId, phase: 'partial', published, failed,
        fix: [
          a11yGate.tier === 'fail'
            ? `Fix the findings and re-run preview_course_publish, or pass a11yAcknowledgments: { "${entry.filename}": [${a11yGate.requiredScs.map(s => `"${s}"`).join(', ')}] } to publish past the named failures. The professor is the final arbiter; acknowledgments are recorded.`
            : `Fix the borderline findings and re-run preview_course_publish, or pass a11yAcknowledgments: { "${entry.filename}": true } after reviewing them.`,
        ],
      };
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
          breadcrumbsEnabled,
          manifest.generatedAt,
        );
        // CDS re-runs the conformance check on the rewritten HTML and re-evaluates the acknowledgment
        // independently — safe because the widget-src rewrite doesn't affect finding classification and the
        // engine is deterministic (defense-in-depth, not a divergence risk).
        const out = await publishToCanvas(
          { courseId: manifest.courseId, html: rewrittenHtml, pageTitle: entry.intendedTitle,
            collisionAction: entry.canvasMatch ? 'update' : 'create',
            acknowledgeAccessibility: input.a11yAcknowledgments?.[entry.filename],
            // #113: canonical record key so page-branch acknowledgments match the
            // assignment branch and the review queue (relPath, not Canvas title).
            a11yPageKey: queuePage,
            courseDir: manifest.courseDir },
          { canvasUrl: cfg.canvasUrl, apiToken: cfg.apiToken } as any, api as any,
        );
        // #112: CDS re-gates the rewritten HTML independently and its message names
        // acknowledgeAccessibility — a publish_to_canvas parameter this tool doesn't
        // accept. Translate to the course-path a11yAcknowledgments syntax; the run is
        // already partial, so the retry needs resume:true.
        if ('error' in out && out.code === 'ACCESSIBILITY_ACK_REQUIRED') {
          const requiredScs = (out.details as { requiredScs?: string[] } | undefined)?.requiredScs ?? [];
          const failed: FailedEntry = {
            filename: entry.filename, type: entry.type,
            reason: out.error ?? 'accessibility acknowledgment required',
            code: 'ACCESSIBILITY_ACK_REQUIRED', failedAt: new Date().toISOString(),
          };
          writeState(dir, { phase: 'partial', published, failed, lastUpdatedAt: failed.failedAt });
          return {
            snapshotId: input.snapshotId, phase: 'partial', published, failed,
            fix: [
              requiredScs.length > 0
                ? `The Canvas-ready HTML (widget URLs substituted) failed the accessibility re-check. Fix the findings and re-run preview_course_publish, or pass a11yAcknowledgments: { "${entry.filename}": [${requiredScs.map(s => `"${s}"`).join(', ')}] } with resume:true to publish past the named failures. The professor is the final arbiter; acknowledgments are recorded.`
                : `The Canvas-ready HTML (widget URLs substituted) has borderline accessibility findings. Fix them and re-run preview_course_publish, or pass a11yAcknowledgments: { "${entry.filename}": true } with resume:true after reviewing them.`,
            ],
          };
        }
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
        // Assignment pages don't run through CDS's publishToCanvas, so the
        // acknowledgment record (when this entry required one) is appended here.
        if (a11yGate.tier !== 'none') {
          try {
            appendAcknowledgment(manifest.courseDir, {
              at: new Date().toISOString(), page: queuePage,
              tier: a11yGate.tier, scIds: a11yGate.requiredScs,
              requiredLevel: `WCAG ${DEFAULT_REQUIRED_LEVEL.version} ${DEFAULT_REQUIRED_LEVEL.level}`,
            });
          } catch (e) {
            console.warn(`a11y acknowledgment record failed for ${entry.filename}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      // Per-entry review-queue upkeep (both branches reach here). Fail-soft — a
      // records-store error must never fail an otherwise-successful publish.
      try {
        const a11yWarns = entryWarnings.filter(w => w.kind === 'a11y' && w.a11yTier);
        if (a11yWarns.length > 0) {
          upsertReviewEntry(manifest.courseDir, {
            page: queuePage,
            canvasUrl: published[published.length - 1]?.canvasUrl,
            reasons: a11yWarns.map(w => ({
              sc: w.sc ?? 'unknown', detail: w.message,
              ...(w.marginRatio !== undefined && { marginRatio: w.marginRatio }),
            })),
            lastCheckedAt: new Date().toISOString().slice(0, 10),
          });
        } else {
          clearReviewEntryIfClean(manifest.courseDir, queuePage);
        }
      } catch (e) {
        console.warn(`a11y review queue update failed for ${entry.filename}: ${e instanceof Error ? e.message : String(e)}`);
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
