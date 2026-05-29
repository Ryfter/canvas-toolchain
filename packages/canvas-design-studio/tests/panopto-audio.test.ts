import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSessionAudio } from '../src/tools/panopto-audio.js';
import type { PanoptoConfig } from '../src/types.js';

const CONFIG: PanoptoConfig = {
  domain: 'bsu.hosted.panopto.com',
  clientId: 'cid',
  clientSecret: 'secret',
} as PanoptoConfig;

const SESSION = {
  sessionId: 's1',
  title: 'Week 03',
  startTime: '2026-06-01T14:00:00Z',
  duration: 3600,
  filename: '2026-06-01_week-03.panopto.vtt',
};

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'audio-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe('fetchSessionAudio', () => {
  it('falls back to a manually-supplied file when the download fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 403 }));
    writeFileSync(join(dir, '2026-06-01_week-03.mp3'), 'audio-bytes');
    const res = await fetchSessionAudio(SESSION, CONFIG, dir);
    expect(res.ok).toBe(true);
    expect(res.source).toBe('manual');
    expect(res.path).toBe(join(dir, '2026-06-01_week-03.mp3'));
  });

  it('returns ok:false with guided web-download instructions when no audio is available', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const res = await fetchSessionAudio(SESSION, CONFIG, dir);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('MANUAL_MISSING');
    expect(res.viewerUrl).toContain('Viewer.aspx?id=s1');
    expect(res.manualInstructions?.join('\n')).toContain('2026-06-01_week-03');
    expect(res.manualInstructions?.join('\n')).toMatch(/Download/i);
  });

  it('writes audio and reports source panopto on a successful download', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const res = await fetchSessionAudio(SESSION, CONFIG, dir);
    expect(res.ok).toBe(true);
    expect(res.source).toBe('panopto');
    expect(existsSync(res.path!)).toBe(true);
  });

  it('manual mode skips the API entirely and uses a present manual file', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    writeFileSync(join(dir, '2026-06-01_week-03.m4a'), 'audio-bytes');
    const res = await fetchSessionAudio(SESSION, CONFIG, dir, 'manual');
    expect(res.ok).toBe(true);
    expect(res.source).toBe('manual');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
