import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { uploadCanvasFile, type CanvasConfig } from '../../src/tools/widget/canvas-files.js';

const cfg: CanvasConfig = { host: 'canvas.example.com', token: 'tk' };

describe('uploadCanvasFile', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function mockInit(uploadUrl = 'https://s3.example/upload', fileParam = 'file') {
    return new Response(JSON.stringify({ upload_url: uploadUrl, upload_params: { key: 'k1', token: 't1' }, file_param: fileParam }), { status: 200 });
  }
  function mockPut(location = 'https://canvas.example.com/api/v1/files/confirm/42') {
    return new Response('', { status: 302, headers: { location } });
  }
  function mockConfirm(fileId = 42) {
    return new Response(JSON.stringify({ id: fileId, display_name: 'widget.html', url: 'https://canvas.example.com/files/42/preview' }), { status: 200 });
  }

  it('completes the 3-step upload and returns file_id + display_name', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(mockConfirm(123));

    const result = await uploadCanvasFile(cfg, {
      courseId: 20255,
      filename: 'widget.html',
      contentType: 'text/html',
      body: '<!DOCTYPE html>...',
    });

    expect(result.fileId).toBe(123);
    expect(result.displayName).toBe('widget.html');
  });

  it('sends Authorization Bearer on the init call', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(mockConfirm());

    await uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' });

    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tk');
  });

  it('passes on_duplicate=overwrite + parent_folder_path by default', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(mockConfirm());

    await uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' });

    const initBody = JSON.parse(f.mock.calls[0][1].body);
    expect(initBody.on_duplicate).toBe('overwrite');
    expect(initBody.parent_folder_path).toBeTruthy();
  });

  it('throws CANVAS_UPLOAD_INIT_ERROR on init failure', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' }))
      .rejects.toThrow(/CANVAS_UPLOAD_INIT_ERROR.*403/);
  });

  it('throws CANVAS_UPLOAD_DATA_ERROR on S3 PUT failure', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(new Response('', { status: 500 }));

    await expect(uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' }))
      .rejects.toThrow(/CANVAS_UPLOAD_DATA_ERROR/);
  });

  it('throws CANVAS_UPLOAD_CONFIRM_ERROR when confirm 4xx', async () => {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(mockInit());
    f.mockResolvedValueOnce(mockPut());
    f.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    await expect(uploadCanvasFile(cfg, { courseId: 1, filename: 'x.html', contentType: 'text/html', body: 'x' }))
      .rejects.toThrow(/CANVAS_UPLOAD_CONFIRM_ERROR/);
  });
});
