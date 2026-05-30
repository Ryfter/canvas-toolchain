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
import {
  createSnapshotDir, newSnapshotId, writeManifest, writePriorHtml, writeNewHtml,
  writeFullDiff, writeState, findStaleSnapshot,
} from '../publish/snapshot_store.js';
import type { PreviewManifest, ManifestEntry } from '../publish/manifest_types.js';

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
  const dir = createSnapshotDir(snapshotId);
  const entries: ManifestEntry[] = [];

  for (const p of routed.pages) {
    const intendedTitle = intendedTitleFor(p.filename);
    const match = bestPageMatch(intendedTitle, canvasPages);
    let priorHtml: string | null = null;
    if (match) {
      try { priorHtml = await api.getPageBody(input.courseId, match.p.url); }
      catch { priorHtml = ''; }
    }
    writePriorHtml(dir, p.filename, priorHtml ?? '');
    writeNewHtml(dir, p.filename, p.html);
    const diff = buildDiffSummary(priorHtml, p.html);
    writeFullDiff(dir, p.filename, computeUnifiedDiff(priorHtml, p.html));
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
      warnings: scanWarnings(p.html),
    });
  }

  for (const a of routed.assignments) {
    const intendedTitle = intendedTitleFor(a.filename);
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
    writeFullDiff(dir, a.filename, computeUnifiedDiff(priorHtml, a.html));
    entries.push({
      type: 'assignment',
      filename: a.filename,
      pageType: a.pageType,
      intendedTitle,
      canvasMatch: { assignmentId: match.a.id, name: match.a.name, similarity: match.score },
      diff,
      warnings: scanWarnings(a.html),
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
  };

  writeManifest(dir, manifest);
  writeState(dir, { phase: 'preview', published: [], lastUpdatedAt: manifest.generatedAt });

  return { snapshotId, manifest };
}
