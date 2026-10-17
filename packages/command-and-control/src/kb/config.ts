import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CcConfig } from '../types.js';
import { DEFAULT_CONFIG } from '../types.js';

export function getCcHomePath(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

export function loadConfig(): CcConfig {
  const configPath = join(getCcHomePath(), 'config.json');
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG, lastRun: { ...DEFAULT_CONFIG.lastRun } };
  return JSON.parse(readFileSync(configPath, 'utf-8')) as CcConfig;
}

/** Atomic write (tmp + rename) with 0o600 — config.json holds the premium
 *  registry token, so a crash mid-write must never leave a partial or
 *  world-readable file. Same pattern as setup_canvas / setup_anthropic. */
export function saveConfig(config: CcConfig): void {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const configPath = join(home, 'config.json');
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // `mode` is ignored when tmpPath already exists (a tmp left by an interrupted
  // save), so force it. POSIX only — Windows has no POSIX modes.
  if (process.platform !== 'win32') chmodSync(tmpPath, 0o600);
  renameSync(tmpPath, configPath);
}
