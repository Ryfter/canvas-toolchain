import { existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEmbedUrl,
  buildViewerUrl,
  buildEmbedHtml,
  formatDuration,
  formatSearchResults,
  parseVttToText,
  sanitizeFilename,
  searchPanoptoVideos,
  embedPanoptoVideo,
  fetchPanoptoCaptions,
  bulkDownloadPanoptoCaptions,
} from '../src/panopto/client.js';
import type { PanoptoConfig } from '../src/types.js';

const DOMAIN = 'example.hosted.panopto.com';
const VIDEO_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const TITLE = 'Introduction to Tableau';

const CFG_TRUE: PanoptoConfig = { domain: DOMAIN, iframeWhitelisted: true };
const CFG_FALSE: PanoptoConfig = { domain: DOMAIN, iframeWhitelisted: false };
const CFG_NULL: PanoptoConfig = { domain: DOMAIN, iframeWhitelisted: null };

describe('buildEmbedUrl', () => {
  it('produces correct URL with captions=true and autoplay=false', () => {
    expect(buildEmbedUrl(DOMAIN, VIDEO_ID)).toBe(
      `https://${DOMAIN}/Panopto/Pages/Embed.aspx?id=${VIDEO_ID}&autoplay=false&captions=true`,
    );
  });
});

describe('buildViewerUrl', () => {
  it('produces correct viewer URL', () => {
    expect(buildViewerUrl(DOMAIN, VIDEO_ID)).toBe(
      `https://${DOMAIN}/Panopto/Pages/Viewer.aspx?id=${VIDEO_ID}`,
    );
  });
});

describe('buildEmbedHtml', () => {
  it('returns iframe when iframeWhitelisted is true', () => {
    const html = buildEmbedHtml(CFG_TRUE, VIDEO_ID, TITLE, 'inline');
    expect(html).toContain('<iframe');
    expect(html).toContain(`aria-label="${TITLE}"`);
    expect(html).toContain('allowfullscreen');
    expect(html).not.toContain('<a href');
  });

  it('returns fallback link when iframeWhitelisted is false', () => {
    const html = buildEmbedHtml(CFG_FALSE, VIDEO_ID, TITLE, 'inline');
    expect(html).toContain('<a href');
    expect(html).toContain('Watch:');
    expect(html).not.toContain('<iframe');
  });

  it('returns fallback link when iframeWhitelisted is null', () => {
    const html = buildEmbedHtml(CFG_NULL, VIDEO_ID, TITLE, 'inline');
    expect(html).toContain('<a href');
    expect(html).not.toContain('<iframe');
  });

  it('inline placement — no wrapper div', () => {
    const html = buildEmbedHtml(CFG_TRUE, VIDEO_ID, TITLE, 'inline');
    expect(html).not.toContain('max-width:720px;margin:0 auto');
  });

  it('full-page placement — centered wrapper present', () => {
    const html = buildEmbedHtml(CFG_TRUE, VIDEO_ID, TITLE, 'full-page');
    expect(html).toContain('max-width:720px;margin:0 auto');
  });
});

describe('formatDuration', () => {
  it('converts seconds to mm:ss or h:mm:ss', () => {
    expect(formatDuration(1934)).toBe('32:14');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(5400)).toBe('1:30:00');
  });
});

describe('formatSearchResults', () => {
  it('includes ✓ captions for videos with captions', () => {
    const results = [{ id: VIDEO_ID, title: TITLE, duration: 1934, hasCaptions: true }];
    const text = formatSearchResults(results, 'tableau');
    expect(text).toContain('✓ captions');
    expect(text).toContain(VIDEO_ID);
    expect(text).toContain(TITLE);
    expect(text).toContain('32:14');
  });

  it('includes ⚠ no captions for videos without captions', () => {
    const results = [{ id: VIDEO_ID, title: TITLE, duration: 1125, hasCaptions: false }];
    const text = formatSearchResults(results, 'tableau');
    expect(text).toContain('⚠ no captions');
  });
});

describe('parseVttToText', () => {
  it('strips WEBVTT header, timestamps, cue IDs, and NOTE blocks', () => {
    const vtt = [
      'WEBVTT',
      '',
      'NOTE This is a comment',
      '',
      '1',
      '00:00:01.000 --> 00:00:04.000',
      'Hello students.',
      '',
      '2',
      '00:00:05.000 --> 00:00:08.000',
      'Welcome to Tableau.',
      '',
    ].join('\n');
    const text = parseVttToText(vtt);
    expect(text).not.toContain('WEBVTT');
    expect(text).not.toContain('-->');
    expect(text).not.toContain('NOTE');
    expect(text).toContain('Hello students.');
    expect(text).toContain('Welcome to Tableau.');
    expect(text).not.toMatch(/\b1\b.*Hello/);  // cue ID "1" should not appear before text
  });
});

describe('sanitizeFilename', () => {
  it('replaces special characters with hyphens and lowercases', () => {
    expect(sanitizeFilename('Week 3: Data & Viz!')).toBe('week-3-data-viz');
  });
});

const CFG_API: PanoptoConfig = {
  domain: DOMAIN,
  iframeWhitelisted: true,
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};
const CFG_NO_API: PanoptoConfig = { domain: DOMAIN, iframeWhitelisted: true };

describe('searchPanoptoVideos', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns formatted list with titles and IDs (mocked fetch)', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Results: [{ Id: VIDEO_ID, Name: TITLE, Duration: 1934, HasCaptions: true }],
          TotalNumberOfResults: 1,
        }),
      } as Response);

    const result = await searchPanoptoVideos({ query: 'tableau' }, CFG_API);
    expect(result).toContain(TITLE);
    expect(result).toContain(VIDEO_ID);
    expect(result).toContain('✓ captions');
  });

  it('returns API_NOT_CONFIGURED when no credentials', async () => {
    const result = await searchPanoptoVideos({ query: 'tableau' }, CFG_NO_API);
    expect(result).toContain('API_NOT_CONFIGURED');
  });
});

describe('embedPanoptoVideo', () => {
  it('returns embed HTML without API — title required, hasCaptions null', async () => {
    const result = await embedPanoptoVideo(
      { videoId: VIDEO_ID, placement: 'inline', title: TITLE },
      CFG_TRUE,
    );
    expect(result.html).toContain('<iframe');
    expect(result.videoTitle).toBe(TITLE);
    expect(result.hasCaptions).toBeNull();
    expect(result.iframeUsed).toBe(true);
    expect(result.captionWarning).toBeUndefined();
  });

  it('sets captionWarning when API reports HasCaptions: false', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Name: TITLE, HasCaptions: false }),
      } as Response);

    const result = await embedPanoptoVideo(
      { videoId: VIDEO_ID, placement: 'inline' },
      CFG_API,
    );
    expect(result.hasCaptions).toBe(false);
    expect(result.captionWarning).toBeDefined();
    expect(result.captionWarning).toContain('captions');
    vi.unstubAllGlobals();
  });
});

describe('fetchPanoptoCaptions', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns API_NOT_CONFIGURED when no credentials', async () => {
    const result = await fetchPanoptoCaptions({ videoId: VIDEO_ID, title: TITLE }, CFG_NO_API);
    expect(result).toContain('API_NOT_CONFIGURED');
  });

  it('returns transcript summary with file path (mocked fetch)', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ Language: 'en', FileUrl: 'https://example.hosted.panopto.com/captions/abc.vtt', IsDefault: true }]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello students.\n\n00:00:05.000 --> 00:00:08.000\nWelcome to Tableau.\n',
      } as Response);

    const result = await fetchPanoptoCaptions({ videoId: VIDEO_ID, title: TITLE }, CFG_API);
    expect(result).toContain('transcripts');
    expect(result).toContain('.md');
    expect(result).toContain('Hello students.');
  });
});

describe('bulkDownloadPanoptoCaptions — filename format', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('prefixes filename with YYYY-MM-DD from session.startTime', async () => {
    const outDir = join(tmpdir(), `panopto-bulk-test-${Date.now()}`);
    const mockFetch = vi.mocked(fetch);

    // 1. OAuth2 token (for listSessionsInFolder → getPanoptoToken)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) } as Response);
    // 2. List sessions in folder
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Results: [{ Id: 'sess-01', Name: 'Week 03: Tableau Intro', StartTime: '2026-06-01T14:00:00Z', Duration: 3600, HasCaptions: true }],
        TotalNumberOfResults: 1,
      }),
    } as Response);
    // 3. OAuth2 token (for bulkDownloadPanoptoCaptions → getPanoptoToken)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) } as Response);
    // 4. Captions list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{ Language: 'en', FileUrl: 'https://example.hosted.panopto.com/captions/abc.vtt', IsDefault: true }]),
    } as Response);
    // 5. VTT content
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello students.\n' } as Response);

    try {
      await bulkDownloadPanoptoCaptions({ folderId: 'folder-01', outputDir: outDir }, CFG_API);
      const files = readdirSync(outDir);
      expect(files).toContain('2026-06-01_week-03-tableau-intro.panopto.vtt');
    } finally {
      if (existsSync(outDir)) rmSync(outDir, { recursive: true });
    }
  });
});
