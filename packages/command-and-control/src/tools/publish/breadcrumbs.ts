/** V&R Plan C — Canvas breadcrumb archive system.
 *
 *  Faculty-visible archived copies of pages/widgets in Canvas (renamed
 *  [ARCHIVED] + unpublished, files copied to /canvas-toolchain-archive/<date>/).
 *  Tasks C4.1, C4.2, C4.3. */

import { existsSync } from 'node:fs';
import { loadInstitutionConfig } from './canvas_config_bridge.js';
import { snapshotDir, snapshotDirFor } from './snapshot_store.js';
import { readPagesMeta } from './pages_meta.js';
import { readWidgetsMeta } from './widgets_meta.js';

export interface BreadcrumbCleanupResult {
  canvasBreadcrumbsCleaned: boolean;
  errors: Array<{ resource: string; reason: string }>;
}

// =============================================================================
// Task C4.1 — Page breadcrumb create
// =============================================================================

export interface CreatePageBreadcrumbInput {
  courseId: number;
  canvasUrl: string;
  apiToken: string;
  originalTitle: string;
  originalSlug: string;
  priorBodyHtml: string;
  /** YYYY-MM-DD — used in the new slug suffix. */
  date: string;
  /** Human-readable timestamp embedded in the [ARCHIVED] title (e.g. "2026-06-04 16:42 UTC"). */
  isoTimestamp: string;
}

export interface CreatePageBreadcrumbResult {
  archivedPageSlug: string;
  archivedPageId: string;
}

/** Create a date-stamped archived copy of the prior page body before publish
 *  replaces it. Returns the new slug + id for cleanup at prune time. */
export async function createPageBreadcrumb(input: CreatePageBreadcrumbInput): Promise<CreatePageBreadcrumbResult> {
  const title = `[ARCHIVED] ${input.originalTitle} — ${input.isoTimestamp}`;
  const res = await fetch(`${input.canvasUrl}/api/v1/courses/${input.courseId}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      wiki_page: {
        title,
        body: input.priorBodyHtml,
        published: false,
        notify_of_update: false,
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`createPageBreadcrumb: ${res.status} ${txt}`);
  }
  const data = await res.json() as { url: string; page_id: number };
  return { archivedPageSlug: data.url, archivedPageId: String(data.page_id) };
}

// =============================================================================
// Task C4.2 — Widget breadcrumb upload
// =============================================================================

export interface UploadWidgetBreadcrumbInput {
  courseId: number;
  canvasHost: string;
  apiToken: string;
  /** YYYY-MM-DD — used to name the date sub-folder. */
  date: string;
  /** Page slug (first path segment of the widget reference). */
  slug: string;
  widgetId: string;
  /** Prior content bytes that will be archived. Source is
   *  <snapshot>/prior/widgets/<slug>__<id>.html captured by Plan B at preview time. */
  priorContentHtml: string;
}

export interface UploadWidgetBreadcrumbResult {
  folderId: number;
  /** /canvas-toolchain-archive/<date>/<slug>__<id>.html */
  filePath: string;
  breadcrumbFileId: number;
}

const ARCHIVE_ROOT_FOLDER = 'canvas-toolchain-archive';

/** Upload the prior widget bytes into a hidden /canvas-toolchain-archive/<date>/
 *  folder. Both the root archive folder and the date sub-folder are created on
 *  first encounter (hidden:true). Returns ids for cleanup at prune time. */
export async function uploadWidgetBreadcrumb(
  input: UploadWidgetBreadcrumbInput,
): Promise<UploadWidgetBreadcrumbResult> {
  const baseUrl = `https://${input.canvasHost}/api/v1`;
  const authHeader = { Authorization: `Bearer ${input.apiToken}` };

  // 1. Find or create /canvas-toolchain-archive
  const rootResp = await fetch(`${baseUrl}/courses/${input.courseId}/folders/root`, { headers: authHeader });
  if (!rootResp.ok) throw new Error(`folder root: ${rootResp.status}`);
  const rootFolder = await rootResp.json() as { id: number };

  let rootFolderId: number;
  {
    const childrenResp = await fetch(`${baseUrl}/folders/${rootFolder.id}/folders`, { headers: authHeader });
    const children = await childrenResp.json() as Array<{ id: number; name: string }>;
    const existing = Array.isArray(children) ? children.find(f => f.name === ARCHIVE_ROOT_FOLDER) : undefined;
    if (existing) {
      rootFolderId = existing.id;
    } else {
      const createResp = await fetch(`${baseUrl}/courses/${input.courseId}/folders`, {
        method: 'POST',
        headers: { ...authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name: ARCHIVE_ROOT_FOLDER, hidden: true, parent_folder_id: rootFolder.id }),
      });
      if (!createResp.ok) throw new Error(`folder create: ${createResp.status}`);
      const cf = await createResp.json() as { id: number };
      rootFolderId = cf.id;
    }
  }

  // 2. Find or create /canvas-toolchain-archive/<date>
  let dateFolderId: number;
  {
    const childrenResp = await fetch(`${baseUrl}/folders/${rootFolderId}/folders`, { headers: authHeader });
    const children = await childrenResp.json() as Array<{ id: number; name: string }>;
    const existing = Array.isArray(children) ? children.find(f => f.name === input.date) : undefined;
    if (existing) {
      dateFolderId = existing.id;
    } else {
      const createResp = await fetch(`${baseUrl}/courses/${input.courseId}/folders`, {
        method: 'POST',
        headers: { ...authHeader, 'content-type': 'application/json' },
        body: JSON.stringify({ name: input.date, hidden: true, parent_folder_id: rootFolderId }),
      });
      if (!createResp.ok) throw new Error(`date folder create: ${createResp.status}`);
      const cf = await createResp.json() as { id: number };
      dateFolderId = cf.id;
    }
  }

  // 3. Two-step file upload
  const fileName = `${input.slug}__${input.widgetId}.html`;
  const initBody = new URLSearchParams({
    name: fileName,
    parent_folder_id: String(dateFolderId),
    content_type: 'text/html',
    on_duplicate: 'overwrite',
  });
  const initResp = await fetch(`${baseUrl}/courses/${input.courseId}/files`, {
    method: 'POST',
    headers: { ...authHeader, 'content-type': 'application/x-www-form-urlencoded' },
    body: initBody,
  });
  if (!initResp.ok) throw new Error(`file init: ${initResp.status}`);
  const initData = await initResp.json() as { upload_url: string; upload_params: Record<string, string> };

  const form = new FormData();
  for (const [k, v] of Object.entries(initData.upload_params ?? {})) form.append(k, v);
  form.append('file', new Blob([input.priorContentHtml], { type: 'text/html' }), fileName);
  const uploadResp = await fetch(initData.upload_url, { method: 'POST', body: form });
  if (!uploadResp.ok && uploadResp.status !== 301 && uploadResp.status !== 302) {
    throw new Error(`upload: ${uploadResp.status}`);
  }
  const final = await uploadResp.json() as { id: number };

  return {
    folderId: dateFolderId,
    filePath: `/${ARCHIVE_ROOT_FOLDER}/${input.date}/${fileName}`,
    breadcrumbFileId: final.id,
  };
}

// =============================================================================
// Task C4.3 — Cleanup at prune
// =============================================================================

/** Resolve the snapshot directory for cleanup. The pruner iterates project-local
 *  snapshots, but the publish workflow today writes meta sidecars to whichever
 *  directory `snapshotDir(id)` returned (legacy global). Try both layouts so we
 *  find the meta files wherever they live. */
function resolveSnapshotDirForCleanup(snapshotId: string, courseDir: string): string | undefined {
  try {
    const projectLocal = snapshotDirFor(snapshotId, courseDir);
    if (existsSync(projectLocal)) return projectLocal;
  } catch { /* fall through */ }
  try {
    const legacy = snapshotDir(snapshotId);
    if (existsSync(legacy)) return legacy;
  } catch { /* fall through */ }
  return undefined;
}

export async function cleanupCanvasBreadcrumbsForSnapshot(input: {
  snapshotId: string;
  courseId: number;
  courseDir: string;
}): Promise<BreadcrumbCleanupResult> {
  const errors: Array<{ resource: string; reason: string }> = [];
  let any = false;

  let cfg;
  try { cfg = loadInstitutionConfig(); }
  catch {
    return {
      canvasBreadcrumbsCleaned: false,
      errors: [{ resource: 'canvas-config', reason: 'MISSING_API_TOKEN' }],
    };
  }

  const host = new URL(cfg.canvasUrl).host;
  const authHeader = { Authorization: `Bearer ${cfg.apiToken}` };
  const baseUrl = `https://${host}/api/v1`;

  const dir = resolveSnapshotDirForCleanup(input.snapshotId, input.courseDir);
  if (!dir) {
    // No meta sidecars to clean up — treat as a no-op.
    return { canvasBreadcrumbsCleaned: false, errors: [] };
  }

  const pagesMeta = readPagesMeta(dir);
  const widgetsMeta = readWidgetsMeta(dir);

  // Delete archived pages
  for (const [, entry] of Object.entries(pagesMeta.pages)) {
    if (!entry.canvasBreadcrumb) continue;
    any = true;
    const slug = entry.canvasBreadcrumb.archivedPageSlug;
    try {
      const res = await fetch(`${baseUrl}/courses/${input.courseId}/pages/${slug}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      if (!res.ok && res.status !== 404) {
        errors.push({ resource: `page:${slug}`, reason: `${res.status}` });
      }
    } catch (e) {
      errors.push({ resource: `page:${slug}`, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // Delete archived widget files + remember their containing date folders
  const dateFolderIds = new Set<number>();
  for (const [, entry] of Object.entries(widgetsMeta.widgets)) {
    if (!entry.canvasBreadcrumb) continue;
    any = true;
    dateFolderIds.add(entry.canvasBreadcrumb.folderId);
    const fileId = entry.canvasBreadcrumb.breadcrumbFileId;
    try {
      const res = await fetch(`${baseUrl}/files/${fileId}`, {
        method: 'DELETE',
        headers: authHeader,
      });
      if (!res.ok && res.status !== 404) {
        errors.push({ resource: `file:${fileId}`, reason: `${res.status}` });
      }
    } catch (e) {
      errors.push({ resource: `file:${fileId}`, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // Best-effort: delete empty date folders
  for (const folderId of dateFolderIds) {
    try {
      const list = await fetch(`${baseUrl}/folders/${folderId}/files`, { headers: authHeader });
      const files = await list.json() as unknown;
      if (Array.isArray(files) && files.length === 0) {
        await fetch(`${baseUrl}/folders/${folderId}?force=true`, { method: 'DELETE', headers: authHeader });
      }
    } catch {
      // best-effort — silent
    }
  }

  return { canvasBreadcrumbsCleaned: any && errors.length === 0, errors };
}
