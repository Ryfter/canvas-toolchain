import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Engine + audio fetch are injected, so no real Whisper/Panopto here.
const fakeEngine = {
  name: 'fake',
  isAvailable: vi.fn().mockResolvedValue({ available: true, engine: 'fake', detail: 'ok' }),
  transcribe: vi.fn().mockResolvedValue([{ startSec: 0, endSec: 5, text: 'welcome to COBE' }]),
};
vi.mock('curriculum-intelligence-mcp/dist/transcription/faster_whisper_engine.js', () => ({
  getTranscriptionEngine: () => fakeEngine,
}));
vi.mock('@canvas-toolchain/module-video', () => ({
  fetchSessionAudio: vi.fn().mockResolvedValue({ ok: true, path: '/tmp/a.mp4', source: 'manual' }),
  loadPanoptoConfig: () => ({ domain: 'bsu.hosted.panopto.com', clientId: 'c', clientSecret: 's' }),
  loadPanoptoVocab: () => ({ fillerWords: [], corrections: [] }),
}));

import { compareTranscriptsWorkflow } from '../../../src/tools/workflows/compare_transcripts.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'compare-'));
  process.env.CC_HOME = dir;
  writeFileSync(
    join(dir, '2026-06-01_w3.panopto.vtt'),
    'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nwelcome to KOBE\n',
  );
  writeFileSync(
    join(dir, '_sessions.json'),
    JSON.stringify({
      domain: 'bsu.hosted.panopto.com',
      generatedAt: '2026-06-01T20:00:00Z',
      sessions: [
        {
          sessionId: 's1',
          title: 'W3',
          startTime: '2026-06-01T14:00:00Z',
          duration: 3600,
          filename: '2026-06-01_w3.panopto.vtt',
        },
      ],
    }),
  );
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CC_HOME;
  vi.clearAllMocks();
});

describe('compareTranscriptsWorkflow', () => {
  it('returns MANIFEST_NOT_FOUND when _sessions.json is absent', async () => {
    rmSync(join(dir, '_sessions.json'));
    const r = await compareTranscriptsWorkflow({ transcriptsPath: dir });
    expect(r.error).toBe('MANIFEST_NOT_FOUND');
  });

  it('transcribes, compares, writes .comparison.md, and surfaces suggestions', async () => {
    fakeEngine.isAvailable.mockResolvedValue({ available: true, engine: 'fake', detail: 'ok' });
    fakeEngine.transcribe.mockResolvedValue([{ startSec: 0, endSec: 5, text: 'welcome to COBE' }]);
    const r = await compareTranscriptsWorkflow({ transcriptsPath: dir });
    expect(r.reports).toHaveLength(1);
    expect(existsSync(join(dir, '2026-06-01_w3.comparison.md'))).toBe(true);
    expect(existsSync(join(dir, '2026-06-01_w3.whisper.vtt'))).toBe(true);
    expect(r.suggestedCorrections.some((s) => s.from === 'KOBE' && s.to === 'COBE')).toBe(true);
  });

  it('short-circuits with setupSteps when the engine is unavailable', async () => {
    fakeEngine.isAvailable.mockResolvedValueOnce({
      available: false,
      engine: 'fake',
      detail: 'no python',
      setupSteps: ['Install Python 3'],
    });
    const r = await compareTranscriptsWorkflow({ transcriptsPath: dir });
    expect(r.error).toBe('ENGINE_UNAVAILABLE');
    expect(r.setupSteps).toContain('Install Python 3');
    expect(r.reports).toHaveLength(0);
  });
});
