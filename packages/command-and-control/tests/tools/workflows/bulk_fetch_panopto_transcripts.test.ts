import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/tools/setup_panopto.js', () => ({
  loadPanoptoConfig: vi.fn(),
}));
vi.mock('canvas-design-mcp/dist/tools/panopto.js', () => ({
  bulkDownloadPanoptoCaptions: vi.fn(),
}));
vi.mock('curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js', () => ({
  ingestTranscripts: vi.fn(),
}));

import { loadPanoptoConfig } from '../../../src/tools/setup_panopto.js';
import { bulkDownloadPanoptoCaptions } from 'canvas-design-mcp/dist/tools/panopto.js';
import { ingestTranscripts } from 'curriculum-intelligence-mcp/dist/tools/ingest_transcripts.js';
import { bulkFetchPanoptoTranscripts } from '../../../src/tools/workflows/bulk_fetch_panopto_transcripts.js';

const MOCK_CONFIG = {
  domain: 'bsu.hosted.panopto.com',
  clientId: 'id',
  clientSecret: 'secret',
  iframeWhitelisted: true,
  configuredAt: '2026-01-01T00:00:00Z',
  lastValidatedAt: '2026-01-01T00:00:00Z',
};

const MOCK_DOWNLOAD_RESULT = {
  folderId: 'folder-01',
  outputDir: '/tmp/panopto-out',
  downloaded: [
    { sessionId: 's1', title: 'Lecture 1', path: '/tmp/panopto-out/2026-06-01_lecture-1.panopto.vtt' },
    { sessionId: 's2', title: 'Lecture 2', path: '/tmp/panopto-out/2026-06-03_lecture-2.panopto.vtt' },
  ],
  skippedNoCaptions: [{ sessionId: 's3', title: 'Lecture 3' }],
  failed: [{ sessionId: 's4', title: 'Lecture 4', reason: 'HTTP 500' }],
};

const MOCK_INGEST_RESULT = {
  courseId: 'itm310',
  semesterId: 'fall2026',
  transcriptCount: 2,
  transcriptsJsonPath: '/tmp/ci/transcripts.json',
  copiedTo: null,
};

beforeEach(() => {
  vi.mocked(loadPanoptoConfig).mockReturnValue(MOCK_CONFIG);
  vi.mocked(bulkDownloadPanoptoCaptions).mockResolvedValue(MOCK_DOWNLOAD_RESULT);
  vi.mocked(ingestTranscripts).mockReturnValue(MOCK_INGEST_RESULT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bulkFetchPanoptoTranscripts', () => {
  it('returns PANOPTO_NOT_CONFIGURED error when config is absent', async () => {
    vi.mocked(loadPanoptoConfig).mockImplementation(() => {
      throw new Error('PANOPTO_NOT_CONFIGURED: Run setup_panopto...');
    });

    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
    });

    expect(result.error).toBe('PANOPTO_NOT_CONFIGURED');
    expect(result.downloaded).toHaveLength(0);
    expect(bulkDownloadPanoptoCaptions).not.toHaveBeenCalled();
  });

  it('populates all four buckets correctly from the download result', async () => {
    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
    });

    expect(result.downloaded).toHaveLength(2);
    expect(result.skippedNoCaptions).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.summary).toEqual({
      total: 4,
      downloadedCount: 2,
      skippedCount: 1,
      failedCount: 1,
    });
    expect(result.error).toBeUndefined();
  });

  it('does not include ingestResult when courseId and semesterId are absent', async () => {
    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
    });

    expect(result.ingestResult).toBeUndefined();
    expect(ingestTranscripts).not.toHaveBeenCalled();
  });

  it('includes ingestResult and calls ingestTranscripts when courseId and semesterId provided', async () => {
    const result = await bulkFetchPanoptoTranscripts({
      folderId: 'folder-01',
      outputPath: '/tmp/panopto-out',
      courseId: 'itm310',
      semesterId: 'fall2026',
    });

    expect(result.ingestResult).toBeDefined();
    expect(result.ingestResult?.courseId).toBe('itm310');
    expect(ingestTranscripts).toHaveBeenCalledWith({
      courseId: 'itm310',
      semesterId: 'fall2026',
      transcriptsPath: '/tmp/panopto-out',
      source: 'panopto',
      copy: false,
    });
  });

  it('forwards progress events from bulkDownloadPanoptoCaptions to the caller', async () => {
    vi.mocked(bulkDownloadPanoptoCaptions).mockImplementation(
      async (_input, _config, onProgress) => {
        onProgress?.({ type: 'session-start', sessionId: 's1', title: 'L1', index: 0, total: 2 });
        onProgress?.({ type: 'session-complete', sessionId: 's1', title: 'L1', index: 0, total: 2 });
        onProgress?.({ type: 'session-failed', sessionId: 's2', title: 'L2', index: 1, total: 2, reason: 'err' });
        return {
          folderId: 'folder-01',
          outputDir: '/tmp/panopto-out',
          downloaded: [{ sessionId: 's1', title: 'L1', path: '/tmp/l1.vtt' }],
          skippedNoCaptions: [],
          failed: [{ sessionId: 's2', title: 'L2', reason: 'err' }],
        };
      },
    );

    const events: unknown[] = [];
    await bulkFetchPanoptoTranscripts(
      { folderId: 'folder-01', outputPath: '/tmp/panopto-out' },
      (e) => events.push(e),
    );

    expect(events).toHaveLength(3);
    expect((events[0] as { type: string }).type).toBe('session-start');
    expect((events[1] as { type: string }).type).toBe('session-complete');
    expect((events[2] as { type: string }).type).toBe('session-failed');
  });
});
