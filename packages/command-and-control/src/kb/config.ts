import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export function saveConfig(config: CcConfig): void {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
}
