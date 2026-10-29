import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ciConfigHome, ciDataHome, remapLegacyPath, type PathEnv } from '@canvas-toolchain/shared-types';
import type { AppConfig } from './types.js';

/**
 * Root directory for Curriculum Intelligence state.
 *
 * Resolved fresh on each call so tests can set CURRICULUM_INTELLIGENCE_HOME
 * to a temp dir per-test without caching surprises.
 */
export function getAppHome(): string {
  return ciConfigHome();
}

export function getAppConfigPath(): string {
  return join(getAppHome(), 'config.json');
}

export function getDefaultCourseRoot(): string {
  return join(ciDataHome(), 'courses');
}

export function appConfigExists(): boolean {
  return existsSync(getAppConfigPath());
}

/**
 * `remapEnv` is a test seam for the stored-path remap only (it never changes
 * where config.json itself is read from).
 */
export function loadAppConfig(remapEnv?: PathEnv): AppConfig {
  if (!appConfigExists()) {
    return { version: 1, courses: {} };
  }
  const raw = readFileSync(getAppConfigPath(), 'utf-8');
  const config = JSON.parse(raw) as AppConfig;
  // A courseRoot stored before the Windows migration points into the legacy
  // ~/.curriculum-intelligence folder (or its .migrated-* rename). Remap it on
  // read (spec Q7, option A); the file on disk is not rewritten here.
  for (const course of Object.values(config.courses ?? {})) {
    if (course && typeof course.courseRoot === 'string') {
      course.courseRoot = remapLegacyPath(course.courseRoot, 'ci', remapEnv);
    }
  }
  return config;
}

export function saveAppConfig(config: AppConfig): void {
  mkdirSync(getAppHome(), { recursive: true });
  writeFileSync(getAppConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}
