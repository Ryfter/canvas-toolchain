import { existsSync } from 'node:fs';
import { restorePage } from 'canvas-design-mcp/dist/tools/restore-page.js';
import { updateAssignmentDescription } from 'canvas-design-mcp/dist/tools/update-assignment-description.js';
import { CanvasApiClient } from 'canvas-design-mcp/dist/canvas-api.js';
import { loadInstitutionConfig } from '../publish/canvas_config_bridge.js';
import { readManifest, readState, snapshotDir, readPriorHtml, writeState } from '../publish/snapshot_store.js';
import type { PublishedEntry, PublishState } from '../publish/manifest_types.js';

export interface RollbackCoursePublishInput { snapshotId: string; }

export interface RollbackCoursePublishResult {
  snapshotId: string;
  restored: PublishedEntry[];
  restoreFailed: { filename: string; reason: string }[];
  phase: PublishState['phase'];
  error?: string;
  fix?: string[];
}

export async function rollbackCoursePublish(
  input: RollbackCoursePublishInput,
): Promise<RollbackCoursePublishResult> {
  const dir = snapshotDir(input.snapshotId);
  if (!existsSync(dir)) {
    return {
      snapshotId: input.snapshotId, restored: [], restoreFailed: [], phase: 'preview',
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
      snapshotId: input.snapshotId, restored: [], restoreFailed: [], phase: state.phase,
      error: 'MISSING_API_TOKEN', fix: ['Run setup_canvas with your Canvas host and API token.'],
    };
  }
  const api = new CanvasApiClient({
    institution: '',
    colors: { primary: '', primaryDark: '', primaryLight: '', secondary: '' },
    canvasUrl: cfg.canvasUrl,
    apiToken: cfg.apiToken,
  });

  const restored: PublishedEntry[] = [];
  const restoreFailed: { filename: string; reason: string }[] = [];

  for (let i = state.published.length - 1; i >= 0; i -= 1) {
    const entry = state.published[i];
    const priorHtml = readPriorHtml(dir, entry.filename);
    const isCreated = entry.action === 'created' && entry.type === 'page';
    try {
      if (entry.type === 'page') {
        await restorePage(
          manifest.courseId,
          (entry.canvasUrl ?? entry.filename).split('/').pop()!,
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
    } catch (e) {
      restoreFailed.push({ filename: entry.filename, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  writeState(dir, { phase: 'rolled-back', published: state.published, lastUpdatedAt: new Date().toISOString() });
  return { snapshotId: input.snapshotId, restored, restoreFailed, phase: 'rolled-back' };
}
