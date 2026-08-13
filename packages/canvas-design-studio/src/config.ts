import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import type { InstitutionConfig } from './types.js';
import { canvasBaseUrl } from '@canvas-toolchain/shared-types';

/** Canonicalize canvasUrl to a bare origin ("https://example.instructure.com").
 *  The only prior check was a startsWith('https://') test, which happily accepts
 *  "https://schoolname" — a host that resolves nowhere and surfaces later as an
 *  opaque TLS failure. Applied on both read and write so configs already on disk
 *  heal without the professor re-running setup. */
function withCanonicalCanvasUrl(config: InstitutionConfig): InstitutionConfig {
  if (!config?.canvasUrl) return config;
  return { ...config, canvasUrl: canvasBaseUrl(config.canvasUrl) };
}

// CANVAS_DESIGN_HOME overrides the app home — same env var C&C's kb-bridge
// honors for this directory.
function configDir(): string {
  return process.env.CANVAS_DESIGN_HOME ?? join(homedir(), '.canvas-design-mcp');
}

function configPath(): string {
  return join(configDir(), 'institution.json');
}

export function configExists(): boolean {
  return existsSync(configPath());
}

export function loadConfig(): InstitutionConfig {
  if (!configExists()) {
    throw new Error(`No institution config found at ${configPath()}. Run setup_institution first.`);
  }
  const raw = readFileSync(configPath(), 'utf-8');
  return withCanonicalCanvasUrl(JSON.parse(raw) as InstitutionConfig);
}

/** Atomic write (tmp + rename) with 0o600 — the file holds the Canvas API
 *  token and WAVE key, so a crash mid-write must never leave a partial or
 *  world-readable config. */
export function saveConfig(input: InstitutionConfig): void {
  const config = withCanonicalCanvasUrl(input);
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = configPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
}
