/**
 * The Canvas credential store bridge (#151 R7, decision D1).
 *
 * ~/.command-and-control/canvas-config.json (honoring CC_HOME) is the single
 * source of truth for the Canvas host and API token. Canvas Design Studio keeps
 * owning its own institution.json (honoring CANVAS_DESIGN_HOME) — institution
 * name, brand colors, accessibility policy, WAVE key — but its `canvasUrl` and
 * `apiToken` are a mirror of the canonical store, so the two entry points cannot
 * drift and a professor who configured Canvas once can use either app.
 *
 * This lives in shared-types because Command & Control depends on Canvas Design
 * Studio (C&C imports CDS dist modules), so CDS can never import C&C. This
 * package is the only common ground with no cycle, and it already owns
 * normalizeCanvasHost — the one host rule every consumer must share rather than
 * re-derive. Consumers without a shared-types dependency (the plug-in module
 * packages) duplicate that rule deliberately.
 *
 * Every write here is atomic (tmp + rename), owner-only on POSIX, preserves
 * fields it does not own, and never deletes anything: a rewrite of a file whose
 * shape changes is preceded by a timestamped backup.
 */
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { normalizeCanvasHost } from './canvas-host.js';

export const CC_HOME_ENV = 'CC_HOME';
export const CANVAS_DESIGN_HOME_ENV = 'CANVAS_DESIGN_HOME';
export const CANVAS_CONFIG_FILENAME = 'canvas-config.json';
export const INSTITUTION_CONFIG_FILENAME = 'institution.json';

export interface CanvasStoreLocations {
  /** Command & Control's app home (`CC_HOME`). */
  ccHome: string;
  /** Canvas Design Studio's app home (`CANVAS_DESIGN_HOME`). */
  designHome: string;
  canvasConfig: string;
  institutionConfig: string;
}

export function ccHome(): string {
  return process.env[CC_HOME_ENV] ?? join(homedir(), '.command-and-control');
}

export function canvasDesignHome(): string {
  return process.env[CANVAS_DESIGN_HOME_ENV] ?? join(homedir(), '.canvas-design-mcp');
}

export function canvasStoreLocations(): CanvasStoreLocations {
  const cch = ccHome();
  const design = canvasDesignHome();
  return {
    ccHome: cch,
    designHome: design,
    canvasConfig: join(cch, CANVAS_CONFIG_FILENAME),
    institutionConfig: join(design, INSTITUTION_CONFIG_FILENAME),
  };
}

export type JsonObject = Record<string, unknown>;

type StoreFileStatus = 'ok' | 'absent' | 'corrupt';

interface StoreFile<T> {
  status: StoreFileStatus;
  path: string;
  value?: T;
}

/** The Canvas credentials a store file holds, with the host canonicalized. */
export interface CanvasCredentials {
  host: string;
  token: string;
}

const NO_CREDENTIALS: CanvasCredentials = { host: '', token: '' };

function readJsonObject(path: string): StoreFile<JsonObject> {
  if (!existsSync(path)) return { status: 'absent', path };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { status: 'corrupt', path };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'corrupt', path };
  }
  return { status: 'ok', path, value: parsed as JsonObject };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function credentialsFromCanvasConfig(record: JsonObject): CanvasCredentials {
  return { host: normalizeCanvasHost(text(record.host)), token: text(record.token) };
}

function credentialsFromInstitution(record: JsonObject): CanvasCredentials {
  return { host: normalizeCanvasHost(text(record.canvasUrl)), token: text(record.apiToken) };
}

function usable(creds: CanvasCredentials): boolean {
  return creds.host !== '' && creds.token !== '';
}

function readCanvasConfigFile(): StoreFile<JsonObject> {
  return readJsonObject(canvasStoreLocations().canvasConfig);
}

function readInstitutionConfigFile(): StoreFile<JsonObject> {
  return readJsonObject(canvasStoreLocations().institutionConfig);
}

/**
 * The canonical Canvas credentials, with the host canonicalized — or null when
 * canvas-config.json is absent, unparseable, or missing either field. Never
 * throws: callers decide what a missing store means for them.
 */
export function readCanonicalCanvas(): CanvasCredentials | null {
  const file = readCanvasConfigFile();
  if (file.status !== 'ok' || !file.value) return null;
  const creds = credentialsFromCanvasConfig(file.value);
  return usable(creds) ? creds : null;
}

/**
 * Atomic write (tmp + rename), owner-only on POSIX. `mode` is ignored when a
 * temp file left by an interrupted save already exists, so it is forced.
 */
function writeJsonOwnerOnly(path: string, value: JsonObject): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600 });
  if (platform() !== 'win32') chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

export interface CanvasConfigPatch {
  host: string;
  token: string;
  configuredAt?: string;
  lastValidatedAt?: string;
}

/**
 * Write the canonical store, setting only the fields passed and preserving every
 * other field already on disk — the snapshot retention, breadcrumb and backup
 * settings the Go installer and the V&R tooling write there are the professor's,
 * and a token rotation must not drop them.
 *
 * Unparseable existing content is replaced (the caller is explicitly
 * re-configuring); an unusable host is refused rather than written.
 */
export function writeCanvasConfig(patch: CanvasConfigPatch): void {
  const host = normalizeCanvasHost(patch.host);
  if (!host) {
    throw new Error(
      'CANVAS_HOST_INVALID: no Canvas hostname configured. Run setup_canvas with your ' +
        'school\'s Canvas host (e.g. "example.instructure.com").',
    );
  }

  const { canvasConfig } = canvasStoreLocations();
  const existing = readJsonObject(canvasConfig);
  const base = existing.status === 'ok' && existing.value ? existing.value : {};
  const configuredAt = patch.configuredAt ?? (text(base.configuredAt) || new Date().toISOString());

  const next: JsonObject = { ...base, host, token: patch.token, configuredAt };
  // Last-validation time is kept exactly as the caller described it: setup_canvas
  // records an empty string when it skipped the live check, and nothing else
  // should invent or drop that field.
  const lastValidatedAt = patch.lastValidatedAt ?? text(base.lastValidatedAt);
  if (patch.lastValidatedAt !== undefined || lastValidatedAt !== '') {
    next.lastValidatedAt = lastValidatedAt;
  }
  writeJsonOwnerOnly(canvasConfig, next);
}

/** Brand colors CDS itself falls back to when no institution colors are set
 *  (course-config.ts / import-course.ts). A store created by the bridge must be
 *  consumable by every CDS reader, so it carries a complete, valid config. */
const MINIMAL_INSTITUTION_COLORS = {
  primary: '#0033A0',
  primaryDark: '#002277',
  primaryLight: '#E6ECF9',
  secondary: '#D64309',
};

export interface MirrorToInstitutionResult {
  /** False when the canonical store has no host+token yet — nothing to mirror. */
  mirrored: boolean;
  /** True when institution.json did not exist and was created. */
  created: boolean;
  path: string;
  detail: string;
}

/**
 * Copy the canonical Canvas host and token into Canvas Design Studio's
 * institution.json, preserving every other field that file owns. Creates it with
 * minimal valid content when absent — the state C&C's own accessibility tools
 * (`review_accessibility_policy`, `wave_deep_check`) need to stop failing.
 *
 * No backup is taken here: this writes values already present in the canonical
 * store, so nothing is lost. migrateCanvasStores() takes a backup before the one
 * destructive case (a disagreement).
 */
export function mirrorToInstitution(): MirrorToInstitutionResult {
  const { institutionConfig } = canvasStoreLocations();
  const canonical = readCanonicalCanvas();
  if (!canonical) {
    return {
      mirrored: false,
      created: false,
      path: institutionConfig,
      detail: 'No Canvas credentials are stored yet; nothing to mirror.',
    };
  }

  const existing = readJsonObject(institutionConfig);
  const created = existing.status !== 'ok';
  const base: JsonObject = existing.value ?? {
    institution: '',
    colors: { ...MINIMAL_INSTITUTION_COLORS },
  };
  const next: JsonObject = {
    ...base,
    canvasUrl: `https://${canonical.host}`,
    apiToken: canonical.token,
  };
  writeJsonOwnerOnly(institutionConfig, next);

  return {
    mirrored: true,
    created,
    path: institutionConfig,
    detail: created
      ? `Created ${basename(institutionConfig)} from ${basename(canvasStoreLocations().canvasConfig)}.`
      : `Mirrored the Canvas host and token into ${basename(institutionConfig)}.`,
  };
}

export type CanvasStoreMigrationAction =
  /** No Canvas credentials anywhere, or nothing bridgeable — nothing to do. */
  | 'nothing-to-migrate'
  /** Only institution.json had credentials; they became the canonical store. */
  | 'canvas-config-created'
  /** canvas-config.json is canonical and institution.json now mirrors it. */
  | 'institution-config-mirrored'
  /** Both stores exist and already agree. */
  | 'in-sync'
  /** Both existed and disagreed; canvas-config.json won and institution.json was backed up. */
  | 'canvas-config-wins'
  /** At least one file could not be parsed; both were left untouched. */
  | 'corrupt';

export interface CanvasStoreMigrationResult {
  action: CanvasStoreMigrationAction;
  changed: boolean;
  /** What happened, in professor-readable terms. Never contains a token. */
  detail: string;
  /** Basename of the backup written before rewriting institution.json. */
  backup?: string;
}

/**
 * A filesystem-safe ISO 8601 stamp. `new Date().toISOString()` contains colons,
 * which are illegal in a Windows filename — the backup would simply fail to be
 * written on the platform most faculty use.
 */
function backupTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * Make the two Canvas stores consistent, once, in either direction (#151 R7, D1).
 *
 * Idempotent and never destructive: files it disagrees with are backed up before
 * their Canvas fields are rewritten, corrupt files are reported and left exactly
 * as they are, and nothing is ever deleted.
 *
 * Called after a successful `setup_canvas` save and once at C&C startup
 * (non-fatal). The result carries no secrets by design.
 */
export function migrateCanvasStores(): CanvasStoreMigrationResult {
  const { canvasConfig, institutionConfig } = canvasStoreLocations();
  const canvasFile = readJsonObject(canvasConfig);
  const institutionFile = readJsonObject(institutionConfig);

  const corrupt = [canvasFile, institutionFile]
    .filter((file) => file.status === 'corrupt')
    .map((file) => basename(file.path));
  if (corrupt.length > 0) {
    return {
      action: 'corrupt',
      changed: false,
      detail:
        `Left ${corrupt.join(' and ')} untouched: it could not be parsed. ` +
        `Re-run setup_canvas (Command & Control) or setup_institution (Canvas Design Studio) to rewrite it.`,
    };
  }

  const canvasCreds = canvasFile.value ? credentialsFromCanvasConfig(canvasFile.value) : NO_CREDENTIALS;
  const institutionCreds = institutionFile.value
    ? credentialsFromInstitution(institutionFile.value)
    : NO_CREDENTIALS;
  const canvasHasCreds = usable(canvasCreds);
  const institutionHasCreds = usable(institutionCreds);

  if (!canvasHasCreds && !institutionHasCreds) {
    const urlOnly = institutionFile.status === 'ok' && text(institutionFile.value?.canvasUrl) !== '';
    return {
      action: 'nothing-to-migrate',
      changed: false,
      detail: urlOnly
        ? `Left ${basename(institutionConfig)} alone: it has a Canvas URL but no API token, so there is nothing to mirror.`
        : 'No Canvas credentials are stored yet.',
    };
  }

  // Canvas Design Studio configured first: promote its credentials to canonical.
  if (!canvasHasCreds) {
    writeCanvasConfig({ host: institutionCreds.host, token: institutionCreds.token });
    return {
      action: 'canvas-config-created',
      changed: true,
      detail:
        `Copied the Canvas host and token from ${basename(institutionConfig)} into ` +
        `${basename(canvasConfig)}, which is now the single source of truth.`,
    };
  }

  // Command & Control configured first (or institution.json lost its token):
  // create or fill the mirror.
  if (!institutionHasCreds) {
    const mirror = mirrorToInstitution();
    return {
      action: 'institution-config-mirrored',
      changed: true,
      detail: mirror.created
        ? `Created ${basename(institutionConfig)} from ${basename(canvasConfig)}.`
        : `Filled the Canvas fields in ${basename(institutionConfig)} from ${basename(canvasConfig)}.`,
    };
  }

  if (canvasCreds.host === institutionCreds.host && canvasCreds.token === institutionCreds.token) {
    return {
      action: 'in-sync',
      changed: false,
      detail: `Already in sync: ${basename(institutionConfig)} mirrors ${basename(canvasConfig)}.`,
    };
  }

  // A disagreement. canvas-config.json wins — it is the store both entry points
  // write and the only one whose token was ever validated — but a stale or
  // hand-edited institution.json might hold the only copy of something, so it is
  // backed up before its Canvas fields are rewritten.
  const backup = `${basename(institutionConfig)}.bak-${backupTimestamp(new Date())}`;
  const backupPath = join(dirname(institutionConfig), backup);
  copyFileSync(institutionConfig, backupPath);
  if (platform() !== 'win32') chmodSync(backupPath, 0o600);
  mirrorToInstitution();

  return {
    action: 'canvas-config-wins',
    changed: true,
    backup,
    detail:
      `Both stores held different Canvas credentials, so ${basename(canvasConfig)} won and the ` +
      `previous ${basename(institutionConfig)} was backed up to ${backup}.`,
  };
}
