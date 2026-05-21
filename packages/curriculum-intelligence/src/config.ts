import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from './types.js';

/**
 * Root directory for Curriculum Intelligence state.
 *
 * Resolved fresh on each call so tests can set CURRICULUM_INTELLIGENCE_HOME
 * to a temp dir per-test without caching surprises.
 */
export function getAppHome(): string {
  return process.env.CURRICULUM_INTELLIGENCE_HOME || join(homedir(), '.curriculum-intelligence');
}

export function getAppConfigPath(): string {
  return join(getAppHome(), 'config.json');
}

export function getDefaultCourseRoot(): string {
  return join(getAppHome(), 'courses');
}

export function appConfigExists(): boolean {
  return existsSync(getAppConfigPath());
}

export function loadAppConfig(): AppConfig {
  if (!appConfigExists()) {
    return { version: 1, courses: {} };
  }
  const raw = readFileSync(getAppConfigPath(), 'utf-8');
  return JSON.parse(raw) as AppConfig;
}

export function saveAppConfig(config: AppConfig): void {
  mkdirSync(getAppHome(), { recursive: true });
  writeFileSync(getAppConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
