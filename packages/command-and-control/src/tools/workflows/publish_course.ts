import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishToCanvas } from 'canvas-design-mcp/dist/tools/publish.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { CanvasApiClient, CanvasApiError } from 'canvas-design-mcp/dist/canvas-api.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import {
  readManifest, readState, writeState, snapshotDir,
} from '../publish/snapshot_store.js';
import { validateApprovals } from '../publish/approvals.js';
import { detectGitState, gitCommitPrePublish, gitTagSuccess, gitPushTag } from '../publish/git_state.js';
import type {
  PreviewManifest, PublishState, PublishedEntry, FailedEntry,
} from '../publish/manifest_types.js';
import type { ApprovalMap } from '../publish/approvals.js';

export interface PublishCourseInput {
  snapshotId: string;
  approvals: ApprovalMap;
  resume?: boolean;
  gitCommit?: boolean;
  pushTag?: boolean;
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
}

function readNewHtml(dir: string, filename: string): string {
  return readFileSync(join(dir, 'new', filename), 'utf-8');
}

function tagFor(manifest: PreviewManifest): string {
  return `published-${manifest.generatedAt.slice(0, 10)}-${manifest.courseId}`;
}

export async function publishCourse(input: PublishCourseInput): Promise<PublishCourseResult> {
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

  const validation = validateApprovals(manifest, input.approvals);
  if (!validation.ok) {
    return {
      snapshotId: input.snapshotId, phase: state.phase, published: state.published,
      error: 'APPROVALS_INCOMPLETE',
      message: `missing: ${validation.missing.join(', ')}; unknown: ${validation.unknown.join(', ')}`,
      fix: ['Provide an approve|skip action for every non-skipped manifest entry.'],
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
    const newHtml = readNewHtml(dir, entry.filename);
    try {
      if (entry.type === 'page') {
        const out = await publishToCanvas(
          { courseId: manifest.courseId, html: newHtml, pageTitle: entry.intendedTitle,
            collisionAction: entry.canvasMatch ? 'update' : 'create' },
          { canvasUrl: cfg.canvasUrl, apiToken: cfg.apiToken } as any, api as any,
        );
        if ('error' in out) throw new CanvasApiError(0, (out.code as string) ?? 'PUBLISH_FAILED', out.error ?? 'publish failed');
        published.push({
          filename: entry.filename, type: 'page', canvasUrl: out.url, action: out.action,
          publishedAt: new Date().toISOString(),
        });
      } else if (entry.type === 'assignment') {
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

  writeState(dir, { phase: 'published', published, lastUpdatedAt: new Date().toISOString() });
  return { snapshotId: input.snapshotId, phase: 'published', published, gitTag, pushResult };
}
