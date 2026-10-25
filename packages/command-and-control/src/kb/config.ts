import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ccConfigHome, ccDataHome, ccSecretsHome, type PathEnv } from '@canvas-toolchain/shared-types';
import type { CcConfig } from '../types.js';
import { DEFAULT_CONFIG } from '../types.js';

/** Config root: settings and irreplaceable state (#200). `o` is a test seam. */
export function getCcHomePath(o?: PathEnv): string {
  return ccConfigHome(o);
}

/** Data root: caches, artifacts, snapshots, installed module bundles (#200). */
export function getCcDataPath(o?: PathEnv): string {
  return ccDataHome(o);
}

/** Secrets root: token/key-bearing files, module-credentials/, roster-vault/ (#200). */
export function getCcSecretsPath(o?: PathEnv): string {
  return ccSecretsHome(o);
}

export function loadConfig(): CcConfig {
  // secrets-class (legacyEntryRoot): config.json holds the premium registry token.
  const configPath = join(getCcSecretsPath(), 'config.json');
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG, lastRun: { ...DEFAULT_CONFIG.lastRun } };
  return JSON.parse(readFileSync(configPath, 'utf-8')) as CcConfig;
}

/** Atomic write (tmp + rename) with 0o600 — config.json holds the premium
 *  registry token, so a crash mid-write must never leave a partial or
 *  world-readable file. Same pattern as setup_canvas / setup_anthropic. */
export function saveConfig(config: CcConfig): void {
  const home = getCcSecretsPath(); // secrets-class: carries the registry token
  mkdirSync(home, { recursive: true });
  const configPath = join(home, 'config.json');
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // `mode` is ignored when tmpPath already exists (a tmp left by an interrupted
  // save), so force it. POSIX only — Windows has no POSIX modes.
  if (process.platform !== 'win32') chmodSync(tmpPath, 0o600);
  renameSync(tmpPath, configPath);
}
