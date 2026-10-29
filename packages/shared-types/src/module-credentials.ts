/**
 * Per-module credential store and the one shared credential loader (#201).
 * Spec: docs/specs/2026-10-18-paths-and-module-credentials.md sections 4.2, 6,
 * Q1a (the store lives in the SECRETS root) and Q2 (the caller passes
 * `shareDefault`: true for built-in modules, false for channel modules).
 *
 * Layout: `<ccSecretsHome>/module-credentials/<moduleId>.json`
 *
 *   { "schemaVersion": 1,
 *     "share": { "canvas": true },
 *     "credentials": { "canvas": { "host": "school.instructure.com", "token": "…" } } }
 *
 * The store sits outside `<cc>/modules/` on purpose: uninstall and retired-
 * version pruning `rmSync` that tree recursively.
 *
 * Resolution for module M and kind K, first match wins and nothing mixes:
 *  1. M's own entry for K. Complete: used (`source: 'module'`). Present but
 *     incomplete, or the file is unparseable: `missing: 'incomplete'`. The gaps
 *     are never filled from the shared file, so one identity's token can never
 *     travel to another identity's host.
 *  2. The shared credential, when the file's `share[K]` (else
 *     `policy.shareDefault`) allows it. Shared Canvas is read through
 *     canvas-store's loader, so its host is normalized.
 *  3. Otherwise `missing: 'none'` or `missing: 'share-denied'`.
 *
 * Secret hygiene: no thrown message, returned status or log ever carries a
 * credential value or file contents. JSON parse errors are swallowed because
 * V8's SyntaxError message quotes the offending text. Module ids are never
 * echoed back either (a pasted token could arrive as one).
 *
 * Scoping, not a security boundary: modules run in-process (spec section 6).
 */
import { randomBytes } from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { ccSecretsHome, type PathEnv } from './app-paths.js';
import { normalizeCanvasHost } from './canvas-host.js';
import { ccHome as canvasStoreHome, readCanonicalCanvas } from './canvas-store.js';

export const MODULE_CREDENTIALS_DIRNAME = 'module-credentials';
export const MODULE_CREDENTIALS_SCHEMA_VERSION = 1;

/** Same rule as the channel's MODULE_ID_SEGMENT, plus a length cap. */
const MODULE_ID = /^[a-z0-9][a-z0-9-]*$/;
const MODULE_ID_MAX = 64;

export type CredentialKind = 'canvas' | 'anthropic' | 'panopto';
export const CREDENTIAL_KINDS: readonly CredentialKind[] = ['canvas', 'anthropic', 'panopto'];

/** The host is always normalizeCanvasHost'd. */
export interface CanvasCredential { host: string; token: string }
export interface AnthropicCredential { apiKey: string; model?: string }
/** The saved Panopto setup config shape (module-video `PanoptoSetupConfig`). */
export interface PanoptoCredential {
  domain: string;
  clientId: string;
  clientSecret: string;
  iframeWhitelisted: boolean | null;
  configuredAt: string;
  lastValidatedAt: string;
}

export interface CredentialValueMap {
  canvas: CanvasCredential;
  anthropic: AnthropicCredential;
  panopto: PanoptoCredential;
}
export type CredentialValue<K extends CredentialKind> = CredentialValueMap[K];

export type CredentialSource = 'module' | 'shared';
export interface Resolved<T> { value: T; source: CredentialSource }
export interface MissingCredential { missing: 'none' | 'incomplete' | 'share-denied' }
export type ModuleCredentialResult<K extends CredentialKind> = Resolved<CredentialValue<K>> | MissingCredential;

export interface SharePolicy {
  /** Used when the module's file sets no `share[kind]`. Built-in: true; channel: false. */
  shareDefault: boolean;
}

export type ModuleCredentialPresence = 'module' | 'none' | 'incomplete';

/** What `setModuleCredential` accepts; Panopto's bookkeeping fields are optional. */
export interface CredentialInputMap {
  canvas: CanvasCredential;
  anthropic: AnthropicCredential;
  panopto: Pick<PanoptoCredential, 'domain' | 'clientId' | 'clientSecret'> &
    Partial<Omit<PanoptoCredential, 'domain' | 'clientId' | 'clientSecret'>>;
}

// ── validation ───────────────────────────────────────────────────────────────

function assertModuleId(moduleId: unknown): asserts moduleId is string {
  if (typeof moduleId !== 'string' || moduleId.length > MODULE_ID_MAX || !MODULE_ID.test(moduleId)) {
    throw new Error(
      `MODULE_ID_INVALID: a module id must be 1-${MODULE_ID_MAX} characters of lowercase letters, ` +
        'digits and hyphens, starting with a letter or digit.',
    );
  }
}

function assertKind(kind: unknown): asserts kind is CredentialKind {
  if (!CREDENTIAL_KINDS.includes(kind as CredentialKind)) {
    throw new Error(`CREDENTIAL_KIND_INVALID: the credential kind must be one of ${CREDENTIAL_KINDS.join(', ')}.`);
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A complete credential of `kind` built from `raw`, or null. Never throws. */
function complete<K extends CredentialKind>(kind: K, raw: unknown): CredentialValue<K> | null {
  if (!isObject(raw)) return null;
  if (kind === 'canvas') {
    const host = normalizeCanvasHost(text(raw.host));
    const token = text(raw.token);
    return host && token ? ({ host, token } as CredentialValue<K>) : null;
  }
  if (kind === 'anthropic') {
    const apiKey = text(raw.apiKey);
    if (!apiKey) return null;
    const model = text(raw.model);
    return (model ? { apiKey, model } : { apiKey }) as CredentialValue<K>;
  }
  const domain = text(raw.domain);
  const clientId = text(raw.clientId);
  const clientSecret = text(raw.clientSecret);
  if (!domain || !clientId || !clientSecret) return null;
  const value: PanoptoCredential = {
    domain,
    clientId,
    clientSecret,
    iframeWhitelisted: typeof raw.iframeWhitelisted === 'boolean' ? raw.iframeWhitelisted : null,
    configuredAt: text(raw.configuredAt),
    lastValidatedAt: text(raw.lastValidatedAt),
  };
  return value as CredentialValue<K>;
}

// ── files ────────────────────────────────────────────────────────────────────

interface ModuleCredentialFile {
  schemaVersion: number;
  share: Partial<Record<CredentialKind, boolean>>;
  credentials: Partial<Record<CredentialKind, unknown>>;
}

type ReadResult =
  | { status: 'absent' }
  | { status: 'corrupt' }
  | { status: 'ok'; file: ModuleCredentialFile };

function credentialsDir(o?: PathEnv): string {
  return join(ccSecretsHome(o), MODULE_CREDENTIALS_DIRNAME);
}

function credentialPath(moduleId: string, o?: PathEnv): string {
  return join(credentialsDir(o), `${moduleId}.json`);
}

function readJson(path: string): { status: 'absent' } | { status: 'corrupt' } | { status: 'ok'; value: unknown } {
  if (!existsSync(path)) return { status: 'absent' };
  try {
    return { status: 'ok', value: JSON.parse(readFileSync(path, 'utf-8')) };
  } catch {
    // Deliberately dropped: a SyntaxError message quotes the file's contents.
    return { status: 'corrupt' };
  }
}

function readModuleFile(moduleId: string, o?: PathEnv): ReadResult {
  const raw = readJson(credentialPath(moduleId, o));
  if (raw.status !== 'ok') return raw;
  if (!isObject(raw.value)) return { status: 'corrupt' };
  const share = isObject(raw.value.share) ? raw.value.share : {};
  const credentials = isObject(raw.value.credentials) ? raw.value.credentials : {};
  const cleanShare: Partial<Record<CredentialKind, boolean>> = {};
  for (const k of CREDENTIAL_KINDS) if (typeof share[k] === 'boolean') cleanShare[k] = share[k] as boolean;
  return {
    status: 'ok',
    file: {
      schemaVersion: typeof raw.value.schemaVersion === 'number' ? raw.value.schemaVersion : MODULE_CREDENTIALS_SCHEMA_VERSION,
      share: cleanShare,
      credentials: { ...credentials },
    },
  };
}

/** Read for a write: absent starts empty, corrupt is refused (never overwritten). */
function readForWrite(moduleId: string, o?: PathEnv): ModuleCredentialFile {
  const read = readModuleFile(moduleId, o);
  if (read.status === 'corrupt') {
    throw new Error(
      `MODULE_CREDENTIALS_CORRUPT: the stored credential file for this module could not be parsed, ` +
        `so it was left as it is. Clear this module's credentials (all kinds) and set them again.`,
    );
  }
  if (read.status === 'absent') {
    return { schemaVersion: MODULE_CREDENTIALS_SCHEMA_VERSION, share: {}, credentials: {} };
  }
  return read.file;
}

const POSIX = process.platform !== 'win32';
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_MS = 50;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Owner-only directory; `mode` is ignored for an existing folder, so it is forced. */
function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (POSIX) chmodSync(dir, 0o700);
}

/**
 * Atomic owner-only write: unique temp name in the same folder, explicit chmod
 * (the `mode` option is ignored on an existing file), then rename, retried
 * briefly on Windows sharing violations. Errors name the code only.
 */
function writeModuleFile(moduleId: string, file: ModuleCredentialFile, o?: PathEnv): void {
  const dir = credentialsDir(o);
  ensureDir(dir);
  const path = credentialPath(moduleId, o);
  const tmp = `${path}.${process.pid}-${randomBytes(6).toString('hex')}.tmp`;
  const body: ModuleCredentialFile = {
    schemaVersion: MODULE_CREDENTIALS_SCHEMA_VERSION,
    share: file.share,
    credentials: file.credentials,
  };
  try {
    writeFileSync(tmp, JSON.stringify(body, null, 2), { encoding: 'utf-8', mode: 0o600 });
    if (POSIX) chmodSync(tmp, 0o600);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw new Error(`MODULE_CREDENTIALS_WRITE_FAILED: could not write ${path} (${errCode(err)}).`);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (err) {
      const code = errCode(err);
      const transient = code === 'EPERM' || code === 'EBUSY';
      if (!transient || attempt >= RENAME_ATTEMPTS) {
        try { unlinkSync(tmp); } catch { /* best-effort cleanup */ }
        throw new Error(
          transient
            ? `MODULE_CREDENTIALS_WRITE_BLOCKED: could not replace ${path} (${code}). Another program is ` +
              'holding the file; close your Canvas tools and retry.'
            : `MODULE_CREDENTIALS_WRITE_FAILED: could not write ${path} (${code}).`,
        );
      }
      sleepSync(RENAME_RETRY_MS);
    }
  }
}

function errCode(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' ? code : 'unknown error';
}

// ── shared (global) credentials ──────────────────────────────────────────────

const SHARED_FILES: Record<Exclude<CredentialKind, 'canvas'>, string> = {
  anthropic: 'anthropic-config.json',
  panopto: 'panopto-config.json',
};

function readShared<K extends CredentialKind>(kind: K, o?: PathEnv): CredentialValue<K> | null {
  if (kind === 'canvas') {
    // canvas-store owns canvas-config.json and resolves its own home from the
    // process environment; a PathEnv pointing elsewhere would silently read a
    // different professor's store, so it is refused.
    if (o !== undefined && resolve(ccSecretsHome(o)) !== resolve(canvasStoreHome())) {
      throw new Error(
        'MODULE_CREDENTIALS_HOME_MISMATCH: the shared Canvas store is read from the process ' +
          'environment, but the path options passed resolve a different home.',
      );
    }
    return readCanonicalCanvas() as CredentialValue<K> | null;
  }
  const raw = readJson(join(ccSecretsHome(o), SHARED_FILES[kind as Exclude<CredentialKind, 'canvas'>]));
  return raw.status === 'ok' ? complete(kind, raw.value) : null;
}

// ── public API ───────────────────────────────────────────────────────────────

/** Resolve kind K for module M (see the file header for the order). Reads disk fresh every call. */
export function resolveModuleCredential<K extends CredentialKind>(
  moduleId: string,
  kind: K,
  policy: SharePolicy,
  o?: PathEnv,
): ModuleCredentialResult<K> {
  assertModuleId(moduleId);
  assertKind(kind);

  const read = readModuleFile(moduleId, o);
  if (read.status === 'corrupt') return { missing: 'incomplete' };

  const share = read.status === 'ok' ? read.file.share[kind] : undefined;
  if (read.status === 'ok' && Object.prototype.hasOwnProperty.call(read.file.credentials, kind)) {
    const own = complete(kind, read.file.credentials[kind]);
    return own ? { value: own, source: 'module' } : { missing: 'incomplete' };
  }

  if (!(share ?? policy.shareDefault)) return { missing: 'share-denied' };
  const shared = readShared(kind, o);
  return shared ? { value: shared, source: 'shared' } : { missing: 'none' };
}

/** Store M's own credential for K (validated complete, Canvas host normalized). Keeps everything else. */
export function setModuleCredential<K extends CredentialKind>(
  moduleId: string,
  kind: K,
  value: CredentialInputMap[K],
  o?: PathEnv,
): void {
  assertModuleId(moduleId);
  assertKind(kind);
  const clean = complete(kind, value);
  if (!clean) {
    const needs = kind === 'canvas' ? 'a host and a token' : kind === 'anthropic' ? 'an apiKey' : 'a domain, clientId and clientSecret';
    throw new Error(`MODULE_CREDENTIAL_INCOMPLETE: a ${kind} credential needs ${needs}; nothing was saved.`);
  }
  const file = readForWrite(moduleId, o);
  file.credentials[kind] = clean;
  writeModuleFile(moduleId, file, o);
}

/**
 * Remove M's own credential for K (keeping its share flags and other kinds),
 * or with no kind delete M's whole file, even an unparseable one.
 */
export function clearModuleCredential(moduleId: string, kind?: CredentialKind, o?: PathEnv): { removed: boolean } {
  assertModuleId(moduleId);
  const path = credentialPath(moduleId, o);
  if (kind === undefined) {
    if (!existsSync(path)) return { removed: false };
    unlinkSync(path);
    return { removed: true };
  }
  assertKind(kind);
  if (!existsSync(path)) return { removed: false };
  const file = readForWrite(moduleId, o);
  if (!Object.prototype.hasOwnProperty.call(file.credentials, kind)) return { removed: false };
  delete file.credentials[kind];
  writeModuleFile(moduleId, file, o);
  return { removed: true };
}

/** Record the professor's consent (or refusal) for M to use the shared K credential. */
export function setModuleShare(moduleId: string, kind: CredentialKind, allow: boolean, o?: PathEnv): void {
  assertModuleId(moduleId);
  assertKind(kind);
  const file = readForWrite(moduleId, o);
  file.share[kind] = allow === true;
  writeModuleFile(moduleId, file, o);
}

/** Which kinds M has its own entry for. Never values. An unparseable file reports every kind incomplete. */
export function moduleCredentialPresence(
  moduleId: string,
  o?: PathEnv,
): Record<CredentialKind, ModuleCredentialPresence> {
  assertModuleId(moduleId);
  const read = readModuleFile(moduleId, o);
  const out = {} as Record<CredentialKind, ModuleCredentialPresence>;
  for (const kind of CREDENTIAL_KINDS) {
    if (read.status === 'corrupt') out[kind] = 'incomplete';
    else if (read.status === 'absent' || !Object.prototype.hasOwnProperty.call(read.file.credentials, kind)) out[kind] = 'none';
    else out[kind] = complete(kind, read.file.credentials[kind]) ? 'module' : 'incomplete';
  }
  return out;
}

/** True when M has a credential file at all (uninstall's confirm gate, spec section 4.4). */
export function moduleCredentialFileExists(moduleId: string, o?: PathEnv): boolean {
  assertModuleId(moduleId);
  return existsSync(credentialPath(moduleId, o));
}
