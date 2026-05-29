import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setupTranscriptSource,
  loadTranscriptConfig,
} from '../../src/tools/setup_transcript_source.js';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-home-'));
  process.env.CC_HOME = home;
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  delete process.env.CC_HOME;
});

describe('loadTranscriptConfig', () => {
  it('returns defaults when the file is absent', () => {
    expect(loadTranscriptConfig()).toEqual({
      source: 'panopto',
      engine: 'faster-whisper',
      model: 'medium',
      audioMode: 'auto',
    });
  });

  it('throws TRANSCRIPT_CONFIG_CORRUPT on malformed JSON', () => {
    writeFileSync(join(home, 'transcript-config.json'), '{not json');
    expect(() => loadTranscriptConfig()).toThrow(/TRANSCRIPT_CONFIG_CORRUPT/);
  });
});

describe('setupTranscriptSource', () => {
  it('get returns defaults when absent', async () => {
    const r = await setupTranscriptSource({ action: 'get' });
    expect(r.config.source).toBe('panopto');
  });

  it('set writes provided fields and preserves others', async () => {
    await setupTranscriptSource({ action: 'set', source: 'whisper' });
    await setupTranscriptSource({ action: 'set', model: 'small' });
    const cfg = loadTranscriptConfig();
    expect(cfg.source).toBe('whisper');
    expect(cfg.model).toBe('small');
    expect(cfg.engine).toBe('faster-whisper');
    expect(cfg.audioMode).toBe('auto');
    expect(existsSync(join(home, 'transcript-config.json'))).toBe(true);
  });
});
