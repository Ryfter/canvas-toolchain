import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@canvas-toolchain/module-video', () => ({
  loadPanoptoConfig: vi.fn(),
  loadPanoptoVocab: vi.fn(),
  enrichVttFile: vi.fn(),
  BUILTIN_FILLER_WORDS: ['uh', 'um'],
}));
vi.mock('../../../src/tools/setup_transcript_source.js', () => ({
  loadTranscriptConfig: vi.fn(),
}));

import { loadPanoptoConfig, loadPanoptoVocab, enrichVttFile } from '@canvas-toolchain/module-video';
import { loadTranscriptConfig } from '../../../src/tools/setup_transcript_source.js';
import { enrichPanoptoTranscripts } from '../../../src/tools/workflows/enrich_panopto_transcripts.js';

const MOCK_CONFIG = {
  domain: 'bsu.hosted.panopto.com',
  clientId: 'id',
  clientSecret: 'secret',
  iframeWhitelisted: true,
  configuredAt: '2026-01-01T00:00:00Z',
  lastValidatedAt: '2026-01-01T00:00:00Z',
};

const MOCK_VOCAB = { fillerWords: [], corrections: [] };

const MANIFEST = {
  domain: 'bsu.hosted.panopto.com',
  generatedAt: '2026-06-01T00:00:00Z',
  sessions: [
    {
      sessionId: 's1',
      title: 'Lecture 1',
      startTime: '2026-06-01T14:00:00Z',
      duration: 3600,
      filename: '2026-06-01_lecture-1.panopto.vtt',
    },
    {
      sessionId: 's2',
      title: 'Lecture 2',
      startTime: '2026-06-03T14:00:00Z',
      duration: 3600,
      filename: '2026-06-03_lecture-2.panopto.vtt',
    },
    {
      sessionId: 's3',
      title: 'Lecture 3',
      startTime: '2026-06-05T14:00:00Z',
      duration: 3600,
      filename: '2026-06-05_lecture-3.panopto.vtt',
    },
  ],
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `enrich-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  vi.mocked(loadPanoptoConfig).mockReturnValue(MOCK_CONFIG);
  vi.mocked(loadPanoptoVocab).mockReturnValue(MOCK_VOCAB);
  vi.mocked(enrichVttFile).mockReturnValue('# Lecture\n\nContent');
  vi.mocked(loadTranscriptConfig).mockReturnValue({
    source: 'panopto',
    engine: 'faster-whisper',
    model: 'medium',
    audioMode: 'auto',
  });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('enrichPanoptoTranscripts', () => {
  it('returns MANIFEST_NOT_FOUND when _sessions.json is absent', async () => {
    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.error).toBe('MANIFEST_NOT_FOUND');
    expect(result.fix).toBeDefined();
    expect(enrichVttFile).not.toHaveBeenCalled();
  });

  it('returns PANOPTO_NOT_CONFIGURED when panopto config is absent', async () => {
    vi.mocked(loadPanoptoConfig).mockImplementation(() => {
      throw new Error('PANOPTO_NOT_CONFIGURED');
    });
    writeFileSync(join(tmpDir, '_sessions.json'), JSON.stringify(MANIFEST), 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.error).toBe('PANOPTO_NOT_CONFIGURED');
  });

  it('3-session folder: 2 enrich successfully, 1 fails (missing VTT)', async () => {
    writeFileSync(join(tmpDir, '_sessions.json'), JSON.stringify(MANIFEST), 'utf-8');
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');
    writeFileSync(join(tmpDir, '2026-06-03_lecture-2.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');
    // s3 VTT intentionally absent

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.enriched).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].sessionId).toBe('s3');
    expect(result.summary).toEqual({ total: 3, enrichedCount: 2, failedCount: 1 });
    expect(result.error).toBeUndefined();
  });

  it('panopto-vocab.json absent: enrichment succeeds using built-in fillers only', async () => {
    vi.mocked(loadPanoptoVocab).mockReturnValue({ fillerWords: [], corrections: [] });
    writeFileSync(
      join(tmpDir, '_sessions.json'),
      JSON.stringify({ ...MANIFEST, sessions: [MANIFEST.sessions[0]] }),
      'utf-8',
    );
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    expect(result.error).toBeUndefined();
    expect(result.enriched).toHaveLength(1);
    expect(enrichVttFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ fillerWords: expect.arrayContaining(['uh', 'um']) }),
    );
  });

  it('.enriched.md is written alongside .panopto.vtt with correct filename', async () => {
    writeFileSync(
      join(tmpDir, '_sessions.json'),
      JSON.stringify({ ...MANIFEST, sessions: [MANIFEST.sessions[0]] }),
      'utf-8',
    );
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    const mdPath = join(tmpDir, '2026-06-01_lecture-1.enriched.md');
    expect(existsSync(mdPath)).toBe(true);
    expect(result.enriched[0].mdPath).toBe(mdPath);
  });

  it('reads .whisper.vtt when source is whisper and the file exists', async () => {
    vi.mocked(loadTranscriptConfig).mockReturnValue({
      source: 'whisper', engine: 'faster-whisper', model: 'medium', audioMode: 'auto',
    });
    writeFileSync(
      join(tmpDir, '_sessions.json'),
      JSON.stringify({ ...MANIFEST, sessions: [MANIFEST.sessions[0]] }),
      'utf-8',
    );
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.whisper.vtt'), 'WEBVTT\n\n', 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    const calledPath = vi.mocked(enrichVttFile).mock.calls[0][0] as string;
    expect(calledPath).toContain('.whisper.vtt');
    expect(result.enriched[0].note).toBeUndefined();
  });

  it('falls back to .panopto.vtt with a note when no .whisper.vtt exists', async () => {
    vi.mocked(loadTranscriptConfig).mockReturnValue({
      source: 'whisper', engine: 'faster-whisper', model: 'medium', audioMode: 'auto',
    });
    writeFileSync(
      join(tmpDir, '_sessions.json'),
      JSON.stringify({ ...MANIFEST, sessions: [MANIFEST.sessions[0]] }),
      'utf-8',
    );
    writeFileSync(join(tmpDir, '2026-06-01_lecture-1.panopto.vtt'), 'WEBVTT\n\n', 'utf-8');

    const result = await enrichPanoptoTranscripts({ transcriptsPath: tmpDir });

    const calledPath = vi.mocked(enrichVttFile).mock.calls[0][0] as string;
    expect(calledPath).toContain('.panopto.vtt');
    expect(result.enriched[0].note).toContain('fell back to Panopto');
  });
});
