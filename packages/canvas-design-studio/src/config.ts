import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import type { InstitutionConfig } from './types.js';
import { canvasBaseUrl, readCanonicalCanvas, writeCanvasConfig } from '@canvas-toolchain/shared-types';

/** Canonicalize canvasUrl to a bare origin ("https://example.instructure.com").
 *  The only prior check was a startsWith('https://') test, which happily accepts
 *  "https://schoolname" — a host that resolves nowhere and surfaces later as an
 *  opaque TLS failure. Applied on both read and write so configs already on disk
 *  heal without the professor re-running setup. */
function withCanonicalCanvasUrl(config: InstitutionConfig): InstitutionConfig {
  if (!config?.canvasUrl) return config;
  return { ...config, canvasUrl: canvasBaseUrl(config.canvasUrl) };
}

/** The canonical Canvas store (#151 R7, decision D1) —
 *  ~/.command-and-control/canvas-config.json — wins whenever it holds a host and
 *  a token. institution.json keeps owning every other field (institution name,
 *  brand colors, accessibility policy, WAVE key); installs written before the
 *  bridge existed fall back to their own values. */
function withCanonicalCanvas(config: InstitutionConfig): InstitutionConfig {
  const canonical = readCanonicalCanvas();
  if (!canonical) return config;
  return { ...config, canvasUrl: canvasBaseUrl(canonical.host), apiToken: canonical.token };
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
  return withCanonicalCanvasUrl(withCanonicalCanvas(JSON.parse(raw) as InstitutionConfig));
}

export interface SaveConfigOptions {
  /** Also write the Canvas host and token into the canonical store
   *  (~/.command-and-control/canvas-config.json) so both entry points converge on
   *  one Canvas credential. Only the setup_institution wizard sets this: a save of
   *  the accessibility policy or the WAVE key is Design Studio's own business and
   *  must not touch the Canvas connection. */
  syncCanvasStore?: boolean;
}

/** Atomic write (tmp + rename) with 0o600 — the file holds the Canvas API
 *  token and WAVE key, so a crash mid-write must never leave a partial or
 *  world-readable config. */
export function saveConfig(input: InstitutionConfig, options: SaveConfigOptions = {}): void {
  const config = withCanonicalCanvasUrl(input);
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = configPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);

  if (!options.syncCanvasStore) return;
  const token = config.apiToken?.trim();
  // No token to mirror: the manual generate-and-paste workflow is first-class and
  // leaves the canonical store exactly as it was.
  if (!token || !config.canvasUrl) return;
  writeCanvasConfig({ host: config.canvasUrl, token });
}
