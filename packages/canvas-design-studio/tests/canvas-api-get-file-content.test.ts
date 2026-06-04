import { describe, expect, it, vi, afterEach } from 'vitest';
import { CanvasApiClient } from '../src/canvas-api.js';
import type { InstitutionConfig } from '../src/types.js';

const cfg: InstitutionConfig = {
  institution: '',
  colors: { primary: '', primaryDark: '', primaryLight: '', secondary: '' },
  canvasUrl: 'https://canvas.example',
  apiToken: 'tk',
};

afterEach(() => vi.unstubAllGlobals());

describe('CanvasApiClient.getFileContent', () => {
  it('fetches metadata then downloads the file body as UTF-8', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 12345,
        url: 'https://canvas.example/files/12345/download?download_frd=1&verifier=abc',
        'content-type': 'text/html',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('<p>widget body</p>', {
        status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const api = new CanvasApiClient(cfg);
    const body = await api.getFileContent(12345);
    expect(body).toBe('<p>widget body</p>');

    // Verifies two-step flow: metadata then download via the `url` field.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/files/12345');
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/files/12345/download');
  });

  it('throws CanvasApiError when metadata fetch fails (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const api = new CanvasApiClient(cfg);
    await expect(api.getFileContent(99)).rejects.toMatchObject({ status: 404, code: 'CANVAS_NOT_FOUND' });
  });

  it('throws when the download URL returns non-2xx', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1, url: 'https://canvas.example/files/1/download?verifier=x',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = new CanvasApiClient(cfg);
    await expect(api.getFileContent(1)).rejects.toThrow(/403|forbidden/i);
  });
});
