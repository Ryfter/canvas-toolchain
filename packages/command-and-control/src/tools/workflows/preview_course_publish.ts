import { generateCourse } from 'canvas-design-mcp/dist/tools/generate-course.js';
import { titleSimilarity } from 'canvas-design-mcp/dist/tools/publish.js';
import { listCanvasPages, listCanvasAssignments, type CanvasAssignment } from 'canvas-design-mcp/dist/tools/list-canvas-objects.js';
import { CanvasApiClient } from 'canvas-design-mcp/dist/canvas-api.js';
import type { CanvasPage } from 'canvas-design-mcp/dist/types.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { routePages } from '../publish/route_pages.js';
import { buildDiffSummary, computeUnifiedDiff } from '../publish/build_diff_summary.js';
import { scanWarnings } from '../publish/scan_warnings.js';
import { detectGitState } from '../publish/git_state.js';
import { detectBackupState } from '../publish/backup_detection.js';
import {
  createSnapshotDir, newSnapshotId, writeManifest, writePriorHtml, writeNewHtml,
  writeFullDiff, writeState, findStaleSnapshot,
} from '../publish/snapshot_store.js';
import { discoverWidgetRefs, resolveWidgetFiles, discoverPriorWidgetRefs } from '../publish/widget_discovery.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../publish/hash.js';
import { updateWidgetMetaEntry, widgetMetaKey } from '../publish/widgets_meta.js';
import { updatePageMetaEntry } from '../publish/pages_meta.js';
import type { PreviewManifest, ManifestEntry, WidgetPreviewStatus, Warning } from '../publish/manifest_types.js';

const MATCH_THRESHOLD = 0.8;

export interface PreviewCoursePublishInput {
  courseDir: string;
  courseId: number;
  outputDir?: string;
  fullDiffFor?: string[];
}

export interface PreviewCoursePublishResult {
  snapshotId?: string;
  manifest?: PreviewManifest;
  error?: string;
  message?: string;
  fix?: string[];
}

function bestAssignmentMatch(intendedTitle: string, all: CanvasAssignment[]) {
  let best: { a: CanvasAssignment; score: number } | undefined;
  for (const a of all) {
    const score = titleSimilarity(a.name, intendedTitle);
    if (!best || score > best.score) best = { a, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : undefined;
}

function bestPageMatch(intendedTitle: string, all: CanvasPage[]) {
  let best: { p: CanvasPage; score: number } | undefined;
  for (const p of all) {
    const score = titleSimilarity(p.title, intendedTitle);
    if (!best || score > best.score) best = { p, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : undefined;
}

function intendedTitleFor(filename: string): string {
  return filename
    .replace(/\.html$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Per-page widget capture + status determination (V&R Plan B). For each widget
 *  reference in the locally-rendered HTML (paired positionally with iframes in
 *  the prior Canvas page HTML), fetch the prior widget content from Canvas Files,
 *  hash both prior + new, set status, save to snapshot dirs, record to widgets-meta.
 *
 *  Pairing: local widget at index N → prior iframe at index N. Excess prior iframes
 *  are ignored; excess local widgets get 'new' status. Mismatch in counts can
 *  happen when faculty adds/removes widgets between publishes.
 *
 *  WIDGET_FETCH_FAILED on prior content fetch falls back to 'new' with a warning;
 *  preview is not blocked. */
async function captureWidgetContent(
  newPageHtml: string,
  priorPageHtml: string,
  courseDir: string,
  snapshotDir: string,
  api: CanvasApiClient,
  warnings: Warning[],
): Promise<WidgetPreviewStatus[]> {
  const localRefs = discoverWidgetRefs(newPageHtml);
  const priorRefs = discoverPriorWidgetRefs(priorPageHtml);
  const out: WidgetPreviewStatus[] = [];

  for (let i = 0; i < localRefs.length; i++) {
    const ref = localRefs[i]!;
    const files = resolveWidgetFiles(courseDir, ref);
    const key = widgetMetaKey(ref.slug, ref.id);

    if (!existsSync(files.htmlPath)) {
      out.push({ id: ref.id, slug: ref.slug, htmlPath: files.htmlPath, specPath: files.specPath, status: 'missing-html' });
      continue;
    }
    if (!existsSync(files.specPath)) {
      out.push({ id: ref.id, slug: ref.slug, htmlPath: files.htmlPath, specPath: files.specPath, status: 'missing-spec' });
      continue;
    }

    const localHtml = readFileSync(files.htmlPath, 'utf-8');
    const newContentHash = sha256(localHtml);
    writeFileSync(join(snapshotDir, 'new', 'widgets', `${key}.html`), localHtml, 'utf-8');

    const priorRef = priorRefs[i];
    let priorContentHash: string | null = null;
    let priorCanvasFileId: number | null = null;
    let status: WidgetPreviewStatus['status'] = 'new';

    if (priorRef) {
      try {
        const priorHtml = await api.getFileContent(priorRef.canvasFileId);
        priorContentHash = sha256(priorHtml);
        priorCanvasFileId = priorRef.canvasFileId;
        writeFileSync(join(snapshotDir, 'prior', 'widgets', `${key}.html`), priorHtml, 'utf-8');
        writeFileSync(
          join(snapshotDir, 'diffs', 'widgets', `${key}.diff`),
          computeUnifiedDiff(priorHtml, localHtml),
          'utf-8',
        );
        status = priorContentHash === newContentHash ? 'unchanged' : 'changed';
      } catch (e) {
        warnings.push({
          kind: 'validation',
          severity: 'warn',
          message: `WIDGET_FETCH_FAILED for "${ref.id}" (slug "${ref.slug}", prior file_id ${priorRef.canvasFileId}): ${e instanceof Error ? e.message : String(e)}. Treating as new widget; rollback will not restore prior content for this widget.`,
        });
        status = 'new';
      }
    }

    updateWidgetMetaEntry(snapshotDir, key, {
      priorCanvasFileId,
      priorContentHash,
      newContentHash,
    });

    out.push({ id: ref.id, slug: ref.slug, htmlPath: files.htmlPath, specPath: files.specPath, status });
  }

  return out;
}

export async function previewCoursePublish(
  input: PreviewCoursePublishInput,
): Promise<PreviewCoursePublishResult> {
  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch (e) {
    return {
      error: 'MISSING_API_TOKEN',
      message: e instanceof Error ? e.message : String(e),
      fix: ['Run setup_canvas with your Canvas host and API token.'],
    };
  }

  let generated;
  try { generated = generateCourse({ courseDir: input.courseDir, outputDir: input.outputDir }); }
  catch (e) {
    return {
      error: 'GENERATE_FAILED',
      message: e instanceof Error ? e.message : String(e),
      fix: ['Run import_course to populate the course folder, or fix the underlying generate error.'],
    };
  }

  const routed = routePages(generated);
  // CanvasApiClient requires the full InstitutionConfig shape; institution/colors are display-only
  // fields unused by the HTTP client. Supply minimal placeholders so the type is satisfied.
  const api = new CanvasApiClient({
    institution: '',
    colors: { primary: '', primaryDark: '', primaryLight: '', secondary: '' },
    canvasUrl: cfg.canvasUrl,
    apiToken: cfg.apiToken,
  });
  const [canvasPages, canvasAssignments] = await Promise.all([
    listCanvasPages(input.courseId, api),
    listCanvasAssignments(input.courseId, api),
  ]);

  const snapshotId = newSnapshotId();
  // Use legacy createSnapshotDir so publish_course / rollback_course_publish's
  // snapshotDir() lookups find this snapshot. Full migration to project-local
  // requires updating publish/rollback lookups too — tracked as v1.x follow-up.
  const dir = createSnapshotDir(snapshotId);
  const entries: ManifestEntry[] = [];
  const fullDiffSet = new Set(input.fullDiffFor ?? []);

  for (const p of routed.pages) {
    const intendedTitle = p.title ?? intendedTitleFor(p.filename);
    const match = bestPageMatch(intendedTitle, canvasPages);
    let priorHtml: string | null = null;
    let priorFetchError: string | undefined;
    if (match) {
      try { priorHtml = await api.getPageBody(input.courseId, match.p.url); }
      catch (e) {
        // Don't silently store empty string — that would let rollback wipe real Canvas content.
        // Flag with a block-severity warning so publish refuses this entry until the prior body
        // can be re-fetched (typically by re-running preview).
        priorFetchError = e instanceof Error ? e.message : String(e);
        priorHtml = null;
      }
    }
    writePriorHtml(dir, p.filename, priorHtml ?? '');
    writeNewHtml(dir, p.filename, p.html);
    const diff = buildDiffSummary(priorHtml, p.html);
    const unified = computeUnifiedDiff(priorHtml, p.html);
    writeFullDiff(dir, p.filename, unified);
    if (fullDiffSet.has(p.filename)) diff.fullDiff = unified;
    const warnings = await scanWarnings(p.html);
    if (priorFetchError) {
      warnings.push({
        kind: 'validation',
        severity: 'block',
        message: `Could not fetch current Canvas body for rollback baseline: ${priorFetchError}. Re-run preview_course_publish when Canvas is reachable.`,
      });
    }
    const widgets = await captureWidgetContent(p.html, priorHtml ?? '', input.courseDir, dir, api, warnings);
    // V&R drift detector foundation — record per-page hashes.
    updatePageMetaEntry(dir, p.filename, {
      priorCanvasPageSlug: match ? match.p.url : null,
      priorContentHash: priorHtml === null ? null : sha256(priorHtml),
      newContentHash: sha256(p.html),
    });
    // Surface any missing widget files as warnings (captureWidgetContent does NOT push
    // these — only WIDGET_FETCH_FAILED). Not a block; publish handles per-widget failure soft.
    for (const w of widgets) {
      if (w.status === 'missing-html' || w.status === 'missing-spec') {
        warnings.push({
          kind: 'validation',
          severity: 'warn',
          message: `Widget "${w.id}" (slug "${w.slug}"): ${w.status === 'missing-html' ? 'HTML file' : 'spec.json'} not found at ${w.status === 'missing-html' ? w.htmlPath : w.specPath}. publish_course will skip this widget.`,
        });
      }
    }
    entries.push({
      type: 'page',
      filename: p.filename,
      pageType: p.pageType,
      intendedTitle,
      canvasMatch: match
        ? { pageId: match.p.url, url: match.p.html_url ?? match.p.url, existingTitle: match.p.title, similarity: match.score }
        : undefined,
      collisionAction: match ? 'update' : 'create',
      diff,
      warnings,
      ...(widgets.length > 0 ? { widgets } : {}),
    });
  }

  for (const a of routed.assignments) {
    const intendedTitle = a.title ?? intendedTitleFor(a.filename);
    const match = bestAssignmentMatch(intendedTitle, canvasAssignments);
    if (!match) {
      entries.push({
        type: 'skipped',
        filename: a.filename,
        pageType: a.pageType,
        reason: 'unmatched-assignment',
        recommendation: `No Canvas assignment matched "${intendedTitle}" (>=0.8 similarity). Create the assignment in Canvas first, then re-run preview_course_publish.`,
      });
      continue;
    }
    const priorHtml = match.a.description;
    writePriorHtml(dir, a.filename, priorHtml ?? '');
    writeNewHtml(dir, a.filename, a.html);
    const diff = buildDiffSummary(priorHtml, a.html);
    const unified = computeUnifiedDiff(priorHtml, a.html);
    writeFullDiff(dir, a.filename, unified);
    if (fullDiffSet.has(a.filename)) diff.fullDiff = unified;
    entries.push({
      type: 'assignment',
      filename: a.filename,
      pageType: a.pageType,
      intendedTitle,
      canvasMatch: { assignmentId: match.a.id, name: match.a.name, similarity: match.score },
      diff,
      warnings: await scanWarnings(a.html),
    });
  }

  for (const s of routed.skipped) entries.push({ type: 'skipped', ...s });

  const summary = {
    total: entries.length,
    pages: entries.filter(e => e.type === 'page').length,
    assignments: entries.filter(e => e.type === 'assignment').length,
    skipped: entries.filter(e => e.type === 'skipped').length,
    warningsCount: entries
      .filter(e => e.type !== 'skipped')
      .reduce((n, e) => n + (e as { warnings: unknown[] }).warnings.length, 0),
    ferpaCount: entries
      .filter(e => e.type !== 'skipped')
      .reduce(
        (n, e) => n + (e as { warnings: Array<{ kind: string }> }).warnings.filter(w => w.kind === 'ferpa').length,
        0,
      ),
    collisionsCount: entries.filter(e => e.type === 'page' && (e as { canvasMatch?: unknown }).canvasMatch).length,
  };

  const manifest: PreviewManifest = {
    snapshotId,
    courseId: input.courseId,
    courseDir: input.courseDir,
    generatedAt: new Date().toISOString(),
    git: detectGitState(input.courseDir),
    staleSnapshot: findStaleSnapshot(input.courseId),
    entries,
    summary,
    backup: detectBackupState(input.courseDir),
  };

  writeManifest(dir, manifest);
  writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: manifest.generatedAt });

  return { snapshotId, manifest };
}
