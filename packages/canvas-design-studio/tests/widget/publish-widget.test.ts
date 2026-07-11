import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishWidget } from '../../src/tools/publish-widget.js';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'publish-widget-'));
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

function mockUploadOk(fileId = 99) {
  const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  f.mockResolvedValueOnce(new Response(JSON.stringify({ upload_url: 'https://s3', upload_params: {}, file_param: 'file' }), { status: 200 }));
  f.mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'https://canvas/confirm' } }));
  f.mockResolvedValueOnce(new Response(JSON.stringify({ id: fileId, display_name: 'widget.html', url: '' }), { status: 200 }));
}

describe('publishWidget', () => {
  it('uploads the local widget HTML file and returns canvasFileId + embedSrc + embedHtml', async () => {
    const htmlPath = join(tmp, 'flip.html');
    writeFileSync(htmlPath, '<!DOCTYPE html><html><body>flip</body></html>');
    mockUploadOk(777);

    const result = await publishWidget({
      htmlPath,
      courseId: 20255,
      canvasConfig: { host: 'canvas.example', token: 'tk' },
      widgetSpec: {
        id: 'flip', name: 'Flip', kind: 'card-flip-reveal', purpose: '',
        contentSchema: {}, initialContent: {},
        dimensions: { minHeight: 200, maxHeight: 400 },
        accessibility: { keyboardEquivalent: '', screenReaderSummary: 'flip', minTouchTarget: 44 },
      },
    });

    expect(result.canvasFileId).toBe(777);
    expect(result.embedSrc).toBe('https://canvas.example/courses/20255/files/777/preview');
    expect(result.embedHtml).toContain('<iframe');
    expect(result.embedHtml).toContain('src="https://canvas.example/courses/20255/files/777/preview"');
    expect(result.embedHtml).toContain('sandbox="allow-scripts allow-same-origin allow-forms"');
    expect(result.embedHtml).toContain('title="Flip"');
    expect(result.embedHtml).toContain('height="400"');
  });

  it('throws if htmlPath does not exist', async () => {
    await expect(publishWidget({
      htmlPath: join(tmp, 'nope.html'),
      courseId: 1,
      canvasConfig: { host: 'h', token: 't' },
      widgetSpec: {
        id: 'x', name: 'X', kind: 'card-flip-reveal', purpose: '',
        contentSchema: {}, initialContent: {},
        dimensions: { minHeight: 100, maxHeight: 200 },
        accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
      },
    })).rejects.toThrow(/htmlPath/);
  });

  it('propagates CanvasFilesError on upload failure', async () => {
    const htmlPath = join(tmp, 'x.html');
    writeFileSync(htmlPath, 'x');
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

    await expect(publishWidget({
      htmlPath,
      courseId: 1,
      canvasConfig: { host: 'h', token: 't' },
      widgetSpec: {
        id: 'x', name: 'X', kind: 'card-flip-reveal', purpose: '',
        contentSchema: {}, initialContent: {},
        dimensions: { minHeight: 100, maxHeight: 200 },
        accessibility: { keyboardEquivalent: '', screenReaderSummary: '', minTouchTarget: 44 },
      },
    })).rejects.toThrow(/CANVAS_UPLOAD_INIT_ERROR/);
  });
});
