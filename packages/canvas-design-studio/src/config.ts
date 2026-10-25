import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { InstitutionConfig } from './types.js';
import {
  canvasBaseUrl, cdsSecretsHome, normalizeCanvasHost, readCanonicalCanvas, writeCanvasConfig, writeInstitutionConfig,
} from '@canvas-toolchain/shared-types';

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
 *  bridge existed fall back to their own values.
 *
 *  The overlay is for READING only: saveConfig() puts the file's own Canvas
 *  fields back before it writes, so a load -> save cycle never copies these
 *  values onto disk. */
function withCanonicalCanvas(config: InstitutionConfig): InstitutionConfig {
  const canonical = readCanonicalCanvas();
  if (!canonical) return config;
  return { ...config, canvasUrl: canvasBaseUrl(canonical.host), apiToken: canonical.token };
}

// institution.json carries the Canvas API token and WAVE key, so it lives in
// the secrets root (spec 9 Q1a). CANVAS_DESIGN_HOME overrides every root.
function configDir(): string {
  return cdsSecretsHome();
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

/**
 * Design Studio's brand setup is still owed: no file at all, one it cannot read,
 * or one the Canvas store bridge synthesized while setting up Canvas in Command
 * & Control — that file carries the Canvas connection but no institution name
 * and only placeholder colors, so reporting it as "fully configured" (or
 * generating pages from it) would be a lie.
 */
export function needsBrandSetup(): boolean {
  if (!configExists()) return true;
  try {
    return loadConfig().brandSetupPending === true;
  } catch {
    return true;
  }
}

export interface SaveConfigOptions {
  /** Also write the Canvas host and token into the canonical store
   *  (~/.command-and-control/canvas-config.json) so both entry points converge on
   *  one Canvas credential. Only the setup_institution wizard sets this: a save of
   *  the accessibility policy or the WAVE key is Design Studio's own business and
   *  must not touch the Canvas connection.
   *
   *  Without it, the Canvas fields already in institution.json are written back
   *  exactly as they are (including their absence), so an ordinary save can never
   *  copy the canonical store's token onto disk. With it, the wizard's answers win
   *  — and a file that disagrees is backed up first. */
  syncCanvasStore?: boolean;
}

/**
 * Save institution.json.
 *
 * The file holds the Canvas API token and the WAVE key, so the write itself goes
 * through the shared store writer: unique temp name, atomic rename with a
 * Windows retry, owner-only on POSIX, and a timestamped backup before any
 * existing non-empty Canvas value (or an unreadable file) is replaced.
 */
export function saveConfig(input: InstitutionConfig, options: SaveConfigOptions = {}): void {
  const config = withCanonicalCanvasUrl(input);

  if (options.syncCanvasStore) {
    const token = config.apiToken?.trim();
    // No token to mirror: the manual generate-and-paste workflow is first-class
    // and leaves the canonical store exactly as it was.
    if (token && config.canvasUrl) {
      const host = normalizeCanvasHost(config.canvasUrl);
      const current = readCanonicalCanvas();
      const rotating = current === null || current.host !== host || current.token !== token;
      // A rotated host or token has never been checked against Canvas by this
      // wizard, so the previous validation time must not be carried over as if it
      // were. Unchanged credentials keep the time ct_setup canvas recorded.
      writeCanvasConfig(
        rotating
          ? { host, token, configuredAt: new Date().toISOString(), lastValidatedAt: '' }
          : { host, token },
      );
    }
  }

  writeInstitutionConfig(
    { ...config },
    { preserveCanvasFields: options.syncCanvasStore !== true },
  );
}
