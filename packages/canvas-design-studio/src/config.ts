import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import type { InstitutionConfig } from './types.js';

const CONFIG_DIR = join(homedir(), '.canvas-design-mcp');
const CONFIG_PATH = join(CONFIG_DIR, 'institution.json');

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): InstitutionConfig {
  if (!configExists()) {
    throw new Error(`No institution config found at ${CONFIG_PATH}. Run setup_institution first.`);
  }
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw) as InstitutionConfig;
}

export function saveConfig(config: InstitutionConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
