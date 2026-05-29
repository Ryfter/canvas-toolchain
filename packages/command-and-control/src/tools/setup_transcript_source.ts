import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export interface TranscriptConfig {
  source: 'panopto' | 'whisper';
  engine: string;
  model: string;
  audioMode: 'auto' | 'manual';
}

const DEFAULTS: TranscriptConfig = {
  source: 'panopto',
  engine: 'faster-whisper',
  model: 'medium',
  audioMode: 'auto',
};

function configPath(): string {
  return join(getCcHomePath(), 'transcript-config.json');
}

export function loadTranscriptConfig(): TranscriptConfig {
  const p = configPath();
  if (!existsSync(p)) return { ...DEFAULTS };
  let parsed: Partial<TranscriptConfig>;
  try {
    parsed = JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    throw new Error('TRANSCRIPT_CONFIG_CORRUPT');
  }
  return { ...DEFAULTS, ...parsed };
}

function atomicWrite(cfg: TranscriptConfig): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  renameSync(tmp, p);
}

export interface SetupTranscriptSourceInput {
  action: 'get' | 'set';
  source?: 'panopto' | 'whisper';
  engine?: string;
  model?: string;
  audioMode?: 'auto' | 'manual';
}

export interface SetupTranscriptSourceResult {
  config: TranscriptConfig;
  message: string;
}

export async function setupTranscriptSource(
  input: SetupTranscriptSourceInput,
): Promise<SetupTranscriptSourceResult> {
  if (input.action === 'get') {
    return { config: loadTranscriptConfig(), message: 'Current transcript configuration.' };
  }
  const current = loadTranscriptConfig();
  const next: TranscriptConfig = {
    source: input.source ?? current.source,
    engine: input.engine ?? current.engine,
    model: input.model ?? current.model,
    audioMode: input.audioMode ?? current.audioMode,
  };
  atomicWrite(next);
  return {
    config: next,
    message: `transcriptSource set to ${next.source} (engine ${next.engine}, model ${next.model}, audioMode ${next.audioMode}).`,
  };
}
