/** V&R Plan C — Canvas breadcrumb archive system.
 *
 *  Faculty-visible archived copies of pages/widgets in Canvas (renamed
 *  [ARCHIVED] + unpublished, files copied to /canvas-toolchain-archive/<date>/).
 *  Tasks C4.1, C4.2, C4.3. */

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
// Task C4.3 — Cleanup at prune (stub until C4.3 ships)
// =============================================================================

export async function cleanupCanvasBreadcrumbsForSnapshot(_input: {
  snapshotId: string;
  courseId: number;
  courseDir: string;
}): Promise<BreadcrumbCleanupResult> {
  return { canvasBreadcrumbsCleaned: false, errors: [] };
}
