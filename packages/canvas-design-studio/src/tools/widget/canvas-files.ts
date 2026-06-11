export interface CanvasConfig {
  host: string;
  token: string;
}

export interface UploadInput {
  courseId: number;
  filename: string;
  contentType: string;
  body: string;
  parentFolderPath?: string;
}

export interface UploadResult {
  fileId: number;
  displayName: string;
  previewUrl: string;
}

export type CanvasFilesErrorCode =
  | 'CANVAS_UPLOAD_INIT_ERROR'
  | 'CANVAS_UPLOAD_DATA_ERROR'
  | 'CANVAS_UPLOAD_CONFIRM_ERROR';

export class CanvasFilesError extends Error {
  constructor(public code: CanvasFilesErrorCode, public detail: Record<string, unknown>) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.name = 'CanvasFilesError';
  }
}

interface InitResponse {
  upload_url: string;
  upload_params: Record<string, string>;
  file_param: string;
}

interface ConfirmResponse {
  id: number;
  display_name: string;
  url?: string;
}

/** Three-step Canvas Files upload:
 *  1. POST /api/v1/courses/:id/files — returns presigned S3 upload URL + form params
 *  2. POST the multipart form to the S3 URL — returns 302 with confirm URL in Location
 *  3. GET the confirm URL — returns the finalized file metadata (id, display_name, url)
 *
 *  Always uses on_duplicate=overwrite, which on Canvas's actual file system is
 *  "delete + recreate under same display_name" (file_id changes each time —
 *  verified against University sandbox 2026-06-03 per spec amendment).
 */
export async function uploadCanvasFile(cfg: CanvasConfig, input: UploadInput): Promise<UploadResult> {
  const { courseId, filename, contentType, body, parentFolderPath = '/widgets' } = input;
  const baseUrl = `https://${cfg.host}/api/v1`;
  const auth = { Authorization: `Bearer ${cfg.token}` };

  // Step 1
  const initRes = await fetch(`${baseUrl}/courses/${courseId}/files`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      name: filename,
      size: body.length,
      content_type: contentType,
      on_duplicate: 'overwrite',
      parent_folder_path: parentFolderPath,
    }),
  });
  if (!initRes.ok) {
    throw new CanvasFilesError('CANVAS_UPLOAD_INIT_ERROR', { status: initRes.status, body: (await initRes.text()).slice(0, 200) });
  }
  const init = (await initRes.json()) as InitResponse;

  // Step 2
  const form = new FormData();
  for (const [k, v] of Object.entries(init.upload_params)) form.append(k, v);
  form.append(init.file_param, new Blob([body], { type: contentType }), filename);
  const putRes = await fetch(init.upload_url, { method: 'POST', body: form, redirect: 'manual' });
  if (putRes.status !== 301 && putRes.status !== 302 && !putRes.ok) {
    throw new CanvasFilesError('CANVAS_UPLOAD_DATA_ERROR', { status: putRes.status });
  }

  // Step 3
  const confirmUrl = putRes.headers.get('location');
  if (!confirmUrl) {
    throw new CanvasFilesError('CANVAS_UPLOAD_DATA_ERROR', { reason: 'no Location header in S3 response' });
  }
  const confirmRes = await fetch(confirmUrl, { method: 'GET', headers: auth });
  if (!confirmRes.ok) {
    throw new CanvasFilesError('CANVAS_UPLOAD_CONFIRM_ERROR', { status: confirmRes.status, body: (await confirmRes.text()).slice(0, 200) });
  }
  const confirm = (await confirmRes.json()) as ConfirmResponse;

  return {
    fileId: confirm.id,
    displayName: confirm.display_name,
    previewUrl: `https://${cfg.host}/courses/${courseId}/files/${confirm.id}/preview`,
  };
}
