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
 * Every write here is atomic (tmp + rename, unique temp name per write), owner
 * only on POSIX, preserves fields it does not own, and never deletes anything: a
 * rewrite that replaces an existing non-empty Canvas value, or a file it cannot
 * parse, is preceded by a timestamped backup.
 */
import { randomBytes } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { normalizeCanvasHost } from './canvas-host.js';

export const CC_HOME_ENV = 'CC_HOME';
export const CANVAS_DESIGN_HOME_ENV = 'CANVAS_DESIGN_HOME';
export const CANVAS_CONFIG_FILENAME = 'canvas-config.json';
export const INSTITUTION_CONFIG_FILENAME = 'institution.json';
/** Where the bridge records its last outcome, for the doctor to surface. */
export const CANVAS_STORE_JOURNAL_FILENAME = 'canvas-store-migration.json';

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

/**
 * True when writing `next` would replace a non-empty Canvas value already on
 * disk. A field that is empty (or absent) is a fill — the file never had one —
 * but a differing non-empty value is the professor's data, so it is backed up.
 */
function replacesExistingCanvasValue(current: CanvasCredentials, next: CanvasCredentials): boolean {
  return (
    (current.host !== '' && current.host !== next.host) ||
    (current.token !== '' && current.token !== next.token)
  );
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
 * A filesystem-safe ISO 8601 stamp. `new Date().toISOString()` contains colons,
 * which are illegal in a Windows filename — the backup would simply fail to be
 * written on the platform most faculty use.
 */
function backupTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/** Copy a store file aside before rewriting it. Returns the backup's full path. */
function backupFile(path: string): string {
  const backupPath = `${path}.bak-${backupTimestamp(new Date())}`;
  copyFileSync(path, backupPath);
  if (platform() !== 'win32') chmodSync(backupPath, 0o600);
  return backupPath;
}

const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_MS = 50;

/** A synchronous pause, so a retry stays inside the one write call. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Rename the finished temp file over its destination.
 *
 * A fixed `${path}.tmp` name collides when several MCP hosts boot Command &
 * Control at the same moment — they all run the bridge — and on Windows a
 * rename over a file an indexer, antivirus or another host has open fails with
 * EPERM/EBUSY. So the temp name is unique per write, and the rename is retried
 * briefly before it reports a clear, actionable error.
 */
function renameIntoPlace(tmp: string, path: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY';
      if (!transient || attempt >= RENAME_ATTEMPTS) {
        try { unlinkSync(tmp); } catch { /* the temp file is best-effort cleanup */ }
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(
          transient
            ? `CANVAS_STORE_WRITE_BLOCKED: could not replace ${path} (${code}). Another program ` +
              `is holding the file — close your Canvas tools and retry, or delete ${path} by hand.`
            : `CANVAS_STORE_WRITE_FAILED: could not write ${path} (${detail}).`,
        );
      }
      sleepSync(RENAME_RETRY_MS);
    }
  }
}

/**
 * Atomic write (tmp + rename), owner-only on POSIX. `mode` is ignored when a
 * temp file left by an interrupted save already exists, so it is forced.
 */
function writeJsonOwnerOnly(path: string, value: JsonObject): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}-${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600 });
  if (platform() !== 'win32') chmodSync(tmp, 0o600);
  renameIntoPlace(tmp, path);
}

export interface CanvasConfigPatch {
  host: string;
  token: string;
  configuredAt?: string;
  lastValidatedAt?: string;
}

export interface WriteCanvasConfigOptions {
  /**
   * Default false: replacing a canvas-config.json we cannot parse throws
   * CANVAS_STORE_CORRUPT. Only the store's owner opts in — setup_canvas, because
   * re-configuring is exactly what the professor asked it to do.
   */
  replaceCorrupt?: boolean;
}

/**
 * Write the canonical store, setting only the fields passed and preserving every
 * other field already on disk — the snapshot retention, breadcrumb and backup
 * settings the Go installer and the V&R tooling write there are the professor's,
 * and a token rotation must not drop them.
 *
 * An unparseable existing content is refused (see `replaceCorrupt`); an unusable
 * host is refused rather than written.
 */
export function writeCanvasConfig(
  patch: CanvasConfigPatch,
  options: WriteCanvasConfigOptions = {},
): void {
  const host = normalizeCanvasHost(patch.host);
  if (!host) {
    throw new Error(
      'CANVAS_HOST_INVALID: no Canvas hostname configured. Run setup_canvas with your ' +
        'school\'s Canvas host (e.g. "example.instructure.com").',
    );
  }

  const { canvasConfig } = canvasStoreLocations();
  const existing = readJsonObject(canvasConfig);
  if (existing.status === 'corrupt' && options.replaceCorrupt !== true) {
    throw new Error(
      `CANVAS_STORE_CORRUPT: ${canvasConfig} could not be parsed, so it was left as it is. ` +
        'Move it aside, or re-run ct_setup canvas (Command & Control) to rewrite it.',
    );
  }
  // Even the owner replaces bytes it cannot read only with a copy kept aside.
  if (existing.status === 'corrupt') backupFile(canvasConfig);

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
  /** False when there is nothing to mirror, or when the file must not be touched. */
  mirrored: boolean;
  /** True when institution.json did not exist and was created. */
  created: boolean;
  path: string;
  detail: string;
  /** Basename of the backup written before an existing Canvas value changed. */
  backup?: string;
  /** Full path of that backup, so the doctor can point the professor at it. */
  backupPath?: string;
}

export interface MirrorToInstitutionOptions {
  /**
   * Default false: an absent institution.json is left absent. Creating it is a
   * setup entry point's job (`migrateCanvasStores({ createInstitution: true })`),
   * because the file this bridge would synthesize has no institution name — and
   * a file is what switches Canvas Design Studio out of its first-run brand
   * setup.
   */
  create?: boolean;
}

/** The mirrored Canvas fields, added to whatever the file already owns. */
function withMirroredCanvas(base: JsonObject, canonical: CanvasCredentials): JsonObject {
  return { ...base, canvasUrl: `https://${canonical.host}`, apiToken: canonical.token };
}

/**
 * Copy the canonical Canvas host and token into Canvas Design Studio's
 * institution.json, preserving every other field that file owns. A file that
 * cannot be parsed is never replaced — the caller gets a refusal it can report.
 */
export function mirrorToInstitution(
  options: MirrorToInstitutionOptions = {},
): MirrorToInstitutionResult {
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
  if (existing.status === 'corrupt') {
    return {
      mirrored: false,
      created: false,
      path: institutionConfig,
      detail:
        `Left ${basename(institutionConfig)} untouched: it could not be parsed. Fix or move it ` +
        'aside, then run setup_institution (Canvas Design Studio) or ct_setup canvas to rewrite it.',
    };
  }
  if (existing.status === 'absent') {
    if (options.create !== true) {
      return {
        mirrored: false,
        created: false,
        path: institutionConfig,
        detail:
          `${basename(institutionConfig)} does not exist yet; run setup_institution (Canvas Design ` +
          'Studio) or ct_setup canvas to create it with your institution name and brand colors.',
      };
    }
    // Minimal valid content every CDS reader accepts, marked so Design Studio
    // keeps asking for the institution name and brand colors it does not have.
    const base: JsonObject = {
      institution: '',
      colors: { ...MINIMAL_INSTITUTION_COLORS },
      brandSetupPending: true,
    };
    writeJsonOwnerOnly(institutionConfig, withMirroredCanvas(base, canonical));
    return {
      mirrored: true,
      created: true,
      path: institutionConfig,
      detail: `Created ${basename(institutionConfig)} from ${basename(canvasStoreLocations().canvasConfig)}.`,
    };
  }

  const base = existing.value!;
  const current = credentialsFromInstitution(base);
  const backupPath = replacesExistingCanvasValue(current, canonical)
    ? backupFile(institutionConfig)
    : undefined;
  writeJsonOwnerOnly(institutionConfig, withMirroredCanvas(base, canonical));

  return {
    mirrored: true,
    created: false,
    path: institutionConfig,
    ...(backupPath && { backup: basename(backupPath), backupPath }),
    detail: `Mirrored the Canvas host and token into ${basename(institutionConfig)}.`,
  };
}

export interface WriteInstitutionConfigOptions {
  /**
   * Keep the Canvas host and token exactly as the file already has them —
   * including their absence — instead of the values passed in. Canvas Design
   * Studio's ordinary saves (accessibility policy, WAVE key, kbTipShown) load the
   * canonical overlay through `loadConfig()`, and must not copy it onto disk.
   */
  preserveCanvasFields?: boolean;
}

export interface WriteInstitutionConfigResult {
  created: boolean;
  /** Basename of the backup written before an existing Canvas value changed. */
  backup?: string;
}

/** Replace a field with what the file already had, or drop it when it had none. */
function preserveCanvasField(existing: JsonObject, next: JsonObject, key: string): void {
  if (Object.prototype.hasOwnProperty.call(existing, key)) next[key] = existing[key];
  else delete next[key];
}

/**
 * Write canvas-design-studio's institution.json (Canvas Design Studio's own
 * store, reached through this package because the file mechanics — unique temp
 * name, owner-only mode, Windows rename retry, backup-before-overwrite — are the
 * same ones the bridge needs).
 *
 * A file that cannot be parsed is backed up before it is replaced: we cannot
 * tell what it held, and only the professor can decide it is disposable.
 */
export function writeInstitutionConfig(
  config: JsonObject,
  options: WriteInstitutionConfigOptions = {},
): WriteInstitutionConfigResult {
  const { institutionConfig } = canvasStoreLocations();
  const existing = readJsonObject(institutionConfig);
  const next: JsonObject = { ...config };

  if (existing.status === 'corrupt') {
    const backup = basename(backupFile(institutionConfig));
    writeJsonOwnerOnly(institutionConfig, next);
    return { created: false, backup };
  }

  if (existing.status === 'ok' && existing.value) {
    if (options.preserveCanvasFields === true) {
      preserveCanvasField(existing.value, next, 'canvasUrl');
      preserveCanvasField(existing.value, next, 'apiToken');
    } else if (replacesExistingCanvasValue(credentialsFromInstitution(existing.value), credentialsFromInstitution(next))) {
      const backup = basename(backupFile(institutionConfig));
      writeJsonOwnerOnly(institutionConfig, next);
      return { created: false, backup };
    }
  }

  writeJsonOwnerOnly(institutionConfig, next);
  return { created: existing.status === 'absent' };
}

export type CanvasStoreMigrationAction =
  /** No Canvas credentials anywhere, or nothing bridgeable — nothing to do. */
  | 'nothing-to-migrate'
  /** Only institution.json had credentials; they became the canonical store. */
  | 'canvas-config-created'
  /** canvas-config.json is canonical and institution.json now mirrors it. */
  | 'institution-config-mirrored'
  /** institution.json is absent and only a setup entry point may create it. */
  | 'institution-config-skipped'
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
  /** Basename of the backup written before rewriting a store file. */
  backup?: string;
  /** Full path of that backup, so the doctor can point the professor at it. */
  backupPath?: string;
}

export interface MigrateCanvasStoresOptions {
  /**
   * Default false. Only a setup entry point may create institution.json:
   * Command & Control reconciles the two stores at startup, and a file it
   * synthesized there would switch off Canvas Design Studio's first-run brand
   * setup on a machine that has only ever configured Canvas in Command &
   * Control.
   */
  createInstitution?: boolean;
}

/** The bridge's last outcome, as the doctor reads it back. No secrets. */
export interface CanvasStoreJournalRecord {
  at: string;
  action: CanvasStoreMigrationAction;
  detail: string;
  backupPath?: string;
}

function journalPath(): string {
  return join(ccHome(), CANVAS_STORE_JOURNAL_FILENAME);
}

/**
 * Record the outcome where the professor can see it. Diagnostics only: an
 * unwritable home must not turn a successful bridge into an error.
 */
function recordMigration(result: CanvasStoreMigrationResult): void {
  const record: CanvasStoreJournalRecord = {
    at: new Date().toISOString(),
    action: result.action,
    detail: result.detail,
    ...(result.backupPath && { backupPath: result.backupPath }),
  };
  try {
    writeJsonOwnerOnly(journalPath(), record as unknown as JsonObject);
  } catch {
    // Best effort. The migration itself already succeeded or reported.
  }
}

/** The last recorded bridge outcome, or null when the bridge has not acted yet. */
export function readCanvasStoreJournal(): CanvasStoreJournalRecord | null {
  const file = readJsonObject(journalPath());
  if (file.status !== 'ok' || !file.value) return null;
  const { at, action, detail, backupPath } = file.value;
  if (typeof at !== 'string' || typeof action !== 'string' || typeof detail !== 'string') return null;
  return {
    at,
    action: action as CanvasStoreMigrationAction,
    detail,
    ...(typeof backupPath === 'string' && { backupPath }),
  };
}

/**
 * Make the two Canvas stores consistent, once, in either direction (#151 R7, D1).
 *
 * Idempotent and never destructive: a file whose Canvas fields it rewrites is
 * backed up first, corrupt files are reported and left exactly as they are,
 * institution.json is never created unless `createInstitution` says a setup
 * entry point is driving, and nothing is ever deleted.
 *
 * Called after a successful `setup_canvas` save and once at C&C startup
 * (non-fatal). The result carries no secrets by design.
 */
export function migrateCanvasStores(
  options: MigrateCanvasStoresOptions = {},
): CanvasStoreMigrationResult {
  const { canvasConfig, institutionConfig } = canvasStoreLocations();
  const canvasFile = readJsonObject(canvasConfig);
  const institutionFile = readJsonObject(institutionConfig);

  const result = reconcile(canvasFile, institutionFile, canvasConfig, institutionConfig, options);
  if (result.changed || result.action === 'corrupt') recordMigration(result);
  return result;
}

function reconcile(
  canvasFile: StoreFile<JsonObject>,
  institutionFile: StoreFile<JsonObject>,
  canvasConfig: string,
  institutionConfig: string,
  options: MigrateCanvasStoresOptions,
): CanvasStoreMigrationResult {
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
    // canvas-config.json exists with only part of a credential — a host from an
    // earlier attempt, say. Overwriting a non-empty field is still the
    // professor's data going away, so it is backed up.
    const backupPath = replacesExistingCanvasValue(canvasCreds, institutionCreds)
      ? backupFile(canvasConfig)
      : undefined;
    writeCanvasConfig({ host: institutionCreds.host, token: institutionCreds.token });
    return {
      action: 'canvas-config-created',
      changed: true,
      ...(backupPath && { backup: basename(backupPath), backupPath }),
      detail:
        `Copied the Canvas host and token from ${basename(institutionConfig)} into ` +
        `${basename(canvasConfig)}, which is now the single source of truth.`,
    };
  }

  // Command & Control configured first (or institution.json lost its token):
  // fill the mirror — but creating the file is a setup entry point's job.
  if (!institutionHasCreds) {
    if (institutionFile.status === 'absent' && options.createInstitution !== true) {
      return {
        action: 'institution-config-skipped',
        changed: false,
        detail:
          `Canvas credentials are stored in ${basename(canvasConfig)}; Canvas Design Studio has no ` +
          `${basename(institutionConfig)} yet. Running ct_setup canvas, or the Design Studio setup ` +
          'wizard, creates it with your institution name and brand colors.',
      };
    }
    const mirror = mirrorToInstitution({ create: options.createInstitution === true });
    if (!mirror.mirrored) {
      return { action: 'nothing-to-migrate', changed: false, detail: mirror.detail };
    }
    return {
      action: 'institution-config-mirrored',
      changed: true,
      ...(mirror.backup && { backup: mirror.backup }),
      ...(mirror.backupPath && { backupPath: mirror.backupPath }),
      detail: mirror.detail,
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
  // write and the one a live Canvas check validates — but a stale or hand-edited
  // institution.json might hold the only copy of something, so it is backed up
  // before its Canvas fields are rewritten.
  const backupPath = backupFile(institutionConfig);
  writeJsonOwnerOnly(institutionConfig, withMirroredCanvas(institutionFile.value!, canvasCreds));

  return {
    action: 'canvas-config-wins',
    changed: true,
    backup: basename(backupPath),
    backupPath,
    detail:
      `Both stores held different Canvas credentials, so ${basename(canvasConfig)} won and the ` +
      `previous ${basename(institutionConfig)} was backed up to ${basename(backupPath)}.`,
  };
}
