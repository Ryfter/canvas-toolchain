import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPanoptoFolders, listSessionsInFolder, bulkDownloadPanoptoCaptions } from '../src/tools/panopto.js';
import type { PanoptoConfig } from '../src/types.js';
import * as fs from 'node:fs';

vi.mock('node:fs', async () => {
  return {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

const DOMAIN = 'bsu.hosted.panopto.com';
const CFG_API: PanoptoConfig = {
  domain: DOMAIN,
  iframeWhitelisted: true,
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

describe('listPanoptoFolders', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches and maps folders correctly', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      // OAuth Token call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      } as Response)
      // list folders call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Results: [
            {
              Id: 'folder-1',
              Name: 'Course Recordings',
              ParentFolder: 'parent-1',
              SessionCount: 12,
            },
            {
              Id: 'folder-2',
              Name: 'Sub Folder',
              ParentFolder: { Id: 'folder-1' },
              SessionCount: 0,
            }
          ],
        }),
      } as Response);

    const folders = await listPanoptoFolders({ query: 'course' }, CFG_API);
    expect(folders).toHaveLength(2);
    expect(folders[0]).toEqual({
      id: 'folder-1',
      name: 'Course Recordings',
      parentFolderId: 'parent-1',
      sessionCount: 12,
    });
    expect(folders[1]).toEqual({
      id: 'folder-2',
      name: 'Sub Folder',
      parentFolderId: 'folder-1',
      sessionCount: 0,
    });

    // Verify token was requested
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `https://${DOMAIN}/Panopto/oauth2/connect/token`,
      expect.any(Object)
    );
  });
});

describe('listSessionsInFolder', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('fetches sessions and handles pagination', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      // OAuth Token
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      } as Response)
      // Page 1
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Results: Array.from({ length: 100 }, (_, idx) => ({
            Id: `sess-${idx}`,
            Name: `Lecture ${idx}`,
            StartTime: '2026-05-01T12:00:00Z',
            Duration: 3600.2,
            HasCaptions: true,
          })),
          TotalNumberOfResults: 101,
        }),
      } as Response)
      // Page 2
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Results: [
            { Id: 'sess-100', Name: 'Lecture 100', StartTime: '2026-05-08T12:00:00Z', Duration: 3500.5, HasCaptions: false }
          ],
          TotalNumberOfResults: 101,
        }),
      } as Response);

    const sessions = await listSessionsInFolder('folder-1', CFG_API);
    expect(sessions).toHaveLength(101);
    expect(sessions[0]).toEqual({
      id: 'sess-0',
      title: 'Lecture 0',
      startTime: '2026-05-01T12:00:00Z',
      duration: 3600,
      hasCaptions: true,
    });
    expect(sessions[100]).toEqual({
      id: 'sess-100',
      title: 'Lecture 100',
      startTime: '2026-05-08T12:00:00Z',
      duration: 3501,
      hasCaptions: false,
    });
  });
});

describe('bulkDownloadPanoptoCaptions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(fs.mkdirSync).mockClear();
    vi.mocked(fs.writeFileSync).mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('downloads captions sequentially, skips when no captions, and logs progress', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch
      // OAuth Token (inside listSessionsInFolder)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      } as Response)
      // list sessions call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Results: [
            { Id: 'sess-1', Name: 'Lecture 1', StartTime: '2026-05-01T12:00:00Z', Duration: 3600, HasCaptions: true },
            { Id: 'sess-2', Name: 'Lecture 2', StartTime: '2026-05-08T12:00:00Z', Duration: 3600, HasCaptions: false },
            { Id: 'sess-3', Name: 'Lecture 3', StartTime: '2026-05-15T12:00:00Z', Duration: 3600, HasCaptions: true },
          ],
          TotalNumberOfResults: 3,
        }),
      } as Response)
      // OAuth Token (inside bulkDownloadPanoptoCaptions)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      } as Response)
      // get captions for sess-1
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ Language: 'en', FileUrl: 'https://panopto/1.vtt', IsDefault: true }],
      } as Response)
      // download VTT for sess-1
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'WEBVTT\n\n00:01.000 --> 00:04.000\nHello from lecture 1',
      } as Response)
      // get captions for sess-3 (failures)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

    const progressEvents: any[] = [];
    const onProgress = (event: any) => progressEvents.push(event);

    const result = await bulkDownloadPanoptoCaptions(
      { folderId: 'folder-1', outputDir: '/transcripts' },
      CFG_API,
      onProgress
    );

    expect(result.downloaded).toHaveLength(1);
    expect(result.downloaded[0].sessionId).toBe('sess-1');
    expect(result.downloaded[0].title).toBe('Lecture 1');
    expect(result.downloaded[0].path).toContain('lecture-1.panopto.vtt');

    expect(result.skippedNoCaptions).toHaveLength(1);
    expect(result.skippedNoCaptions[0].sessionId).toBe('sess-2');

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].sessionId).toBe('sess-3');
    expect(result.failed[0].reason).toContain('failed with status 500');

    // Verify progress events
    expect(progressEvents).toEqual([
      { type: 'session-start', sessionId: 'sess-1', title: 'Lecture 1', index: 0, total: 3 },
      { type: 'session-complete', sessionId: 'sess-1', title: 'Lecture 1', index: 0, total: 3 },
      { type: 'session-start', sessionId: 'sess-3', title: 'Lecture 3', index: 2, total: 3 },
      { type: 'session-failed', sessionId: 'sess-3', title: 'Lecture 3', index: 2, total: 3, reason: expect.stringContaining('500') },
    ]);

    // Verify file write
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('lecture-1.panopto.vtt'),
      'WEBVTT\n\n00:01.000 --> 00:04.000\nHello from lecture 1',
      'utf-8'
    );
  });
});
