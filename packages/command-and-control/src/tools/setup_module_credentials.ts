/**
 * `ct_setup` action `module_credentials` (CT201-10; spec
 * docs/specs/2026-10-18-paths-and-module-credentials.md sections 4.2, 4.4, 6, Q2).
 *
 * Gives one contract-v2 module its own credential, or consent to use the
 * professor's shared one:
 *   - set:     validate against the live service, then save (nothing saved on failure)
 *   - test:    validate the credential the module would RESOLVE now; report its source
 *   - share / unshare: set the module's share flag for that kind
 *   - clear:   two calls; the preview says plainly whether the module will then
 *              switch to the shared identity or stop working
 *
 * Secret hygiene: results carry presence, source and outcome codes only. No
 * token, key, client secret, host or domain is ever returned, thrown or logged,
 * and service/network error text is never echoed (it can quote request data).
 * A module id is echoed only once it is a known module, since a pasted token
 * could arrive in that field.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isCanvasToolchainModule,
  type CanvasToolchainModule,
  type CredentialKind,
} from '@canvas-toolchain/module-contract';
import {
  CREDENTIAL_KINDS,
  MODULE_CREDENTIALS_DIRNAME,
  ccSecretsHome,
  clearModuleCredential,
  moduleCredentialPresence,
  normalizeCanvasHost,
  resolveModuleCredential,
  setModuleCredential,
  setModuleShare,
  type AnthropicCredential,
  type CanvasCredential,
  type CredentialInputMap,
  type MissingCredential,
  type PanoptoCredential,
} from '@canvas-toolchain/shared-types';
import { KNOWN_MODULES, knownModuleIds } from '../modules/registry.js';
import { shareDefaultFor, type ModuleOrigin } from '../modules/context.js';
import {
  MODULE_ID_SEGMENT, artifactPath, isSafeArtifactRef, loadInstalledModules,
} from '../channel/installed.js';
import { sha256File } from '../channel/hash.js';
import { compareVersions } from '../update/check.js';

export const MODULE_CREDENTIAL_OPS = ['set', 'test', 'share', 'unshare', 'clear'] as const;
export type ModuleCredentialOp = (typeof MODULE_CREDENTIAL_OPS)[number];

/** Same default `setup_anthropic` validates with. */
const DEFAULT_ANTHROPIC_VALIDATION_MODEL = 'claude-haiku-4-5-20251001';
const MODULE_ID_MAX = 64;

export interface SetupModuleCredentialsInput {
  module: string;
  kind: CredentialKind;
  op: ModuleCredentialOp;
  host?: string;
  token?: string;
  apiKey?: string;
  model?: string;
  domain?: string;
  clientId?: string;
  clientSecret?: string;
  iframeWhitelisted?: boolean | null;
  confirm?: boolean;
}

export type ModuleLookup =
  | { status: 'found'; module: CanvasToolchainModule; origin: ModuleOrigin }
  | { status: 'unknown' }
  | { status: 'load-failed' };

export interface ModuleCredentialsDeps {
  /** Find a loaded-or-installed module by id. Defaults to bundled + installed channel artifacts. */
  resolveModule?: (id: string) => Promise<ModuleLookup>;
  /** Ids offered in an UNKNOWN_MODULE fix. */
  listModuleIds?: () => string[];
  /** Live-validation transport (tests inject it; no network). */
  fetchImpl?: typeof fetch;
}

type Result = Record<string, unknown>;

const KIND_INFO: Record<CredentialKind, { code: string; label: string }> = {
  canvas: { code: 'CANVAS_NOT_CONFIGURED', label: 'Canvas connection' },
  anthropic: { code: 'ANTHROPIC_NOT_CONFIGURED', label: 'Anthropic API key' },
  panopto: { code: 'PANOPTO_NOT_CONFIGURED', label: 'Panopto connection' },
};

function refuse(error: string, message: string, fix: string[] = [], extra: Result = {}): Result {
  return { ok: false, error, message, ...extra, ...(fix.length ? { fix } : {}) };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// ── module lookup ────────────────────────────────────────────────────────────

async function loadChannelModule(id: string): Promise<CanvasToolchainModule | 'failed' | null> {
  const rec = loadInstalledModules().modules[id];
  if (!rec) return null;
  if (!isSafeArtifactRef(id, rec.version)) return 'failed';
  const path = artifactPath(id, rec.version);
  try {
    if (!existsSync(path) || (await sha256File(path)) !== rec.sha256) return 'failed';
    // Same verified-hash URL the loader uses, so this is a cache hit when the module is loaded.
    const mod = (await import(`${pathToFileURL(path).href}?sha256=${rec.sha256}`)).default as unknown;
    return isCanvasToolchainModule(mod) ? mod : 'failed';
  } catch {
    return 'failed';
  }
}

async function loadBundledModule(id: string): Promise<CanvasToolchainModule | 'failed' | null> {
  if (!Object.hasOwn(KNOWN_MODULES, id)) return null;
  try {
    const mod = await KNOWN_MODULES[id]();
    return isCanvasToolchainModule(mod) ? mod : 'failed';
  } catch {
    return 'failed';
  }
}

/** Bundled and installed channel modules; on a collision the semver-newer wins, as in the loader. */
export async function defaultResolveModule(id: string): Promise<ModuleLookup> {
  const bundled = await loadBundledModule(id);
  const channel = await loadChannelModule(id);
  if (typeof channel === 'object' && channel !== null) {
    if (typeof bundled !== 'object' || bundled === null || compareVersions(channel.version, bundled.version) > 0) {
      return { status: 'found', module: channel, origin: 'channel' };
    }
  }
  if (typeof bundled === 'object' && bundled !== null) return { status: 'found', module: bundled, origin: 'bundled' };
  return bundled === 'failed' || channel === 'failed' ? { status: 'load-failed' } : { status: 'unknown' };
}

function defaultListModuleIds(): string[] {
  const installed = Object.keys(loadInstalledModules().modules).filter((id) => MODULE_ID_SEGMENT.test(id));
  return [...new Set([...knownModuleIds(), ...installed])].sort();
}

// ── live validation ──────────────────────────────────────────────────────────

type Validation = { ok: true } | { ok: false; reason: string };

async function check(fetchImpl: typeof fetch, service: string, url: string, init: RequestInit): Promise<Validation> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch {
    // The error text is dropped: it can quote the request.
    return { ok: false, reason: `${service} could not be reached (network error).` };
  }
  return res.ok ? { ok: true } : { ok: false, reason: `${service} returned HTTP ${res.status}.` };
}

/** The same requests setup_canvas, setup_anthropic and setup_panopto validate with. */
function validate(kind: CredentialKind, value: unknown, fetchImpl: typeof fetch): Promise<Validation> {
  if (kind === 'canvas') {
    const { host, token } = value as CanvasCredential;
    return check(fetchImpl, 'Canvas', `https://${host}/api/v1/users/self`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
  }
  if (kind === 'anthropic') {
    const { apiKey, model } = value as AnthropicCredential;
    return check(fetchImpl, 'Anthropic', 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model || DEFAULT_ANTHROPIC_VALIDATION_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: '.' }],
      }),
    });
  }
  const { domain, clientId, clientSecret } = value as PanoptoCredential;
  return check(fetchImpl, 'Panopto', `https://${domain}/Panopto/oauth2/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'api',
    }).toString(),
  });
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/;

/** Build the credential to save from the input, or a refusal. Never echoes a value. */
function credentialFromInput(
  kind: CredentialKind,
  input: SetupModuleCredentialsInput,
): { value: CredentialInputMap[CredentialKind] } | { refusal: Result } {
  if (kind === 'canvas') {
    const host = normalizeCanvasHost(str(input.host));
    const token = str(input.token);
    if (!host || !token) {
      return { refusal: refuse('CREDENTIAL_INCOMPLETE', 'A Canvas credential needs both host and token; nothing was saved.',
        ['Pass host (e.g. "school.instructure.com") and token (Canvas → Account → Settings → New Access Token).']) };
    }
    return { value: { host, token } };
  }
  if (kind === 'anthropic') {
    const apiKey = str(input.apiKey);
    if (!apiKey) {
      return { refusal: refuse('CREDENTIAL_INCOMPLETE', 'An Anthropic credential needs apiKey; nothing was saved.',
        ['Pass apiKey (from platform.anthropic.com/account/api-keys); model is optional.']) };
    }
    const model = str(input.model);
    return { value: model ? { apiKey, model } : { apiKey } };
  }
  const domain = str(input.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const clientId = str(input.clientId);
  const clientSecret = str(input.clientSecret);
  if (!domain || !clientId || !clientSecret) {
    return { refusal: refuse('CREDENTIAL_INCOMPLETE', 'A Panopto credential needs domain, clientId and clientSecret; nothing was saved.',
      ['Pass domain (e.g. "school.hosted.panopto.com"), clientId and clientSecret from the Panopto admin panel.']) };
  }
  if (!HOSTNAME.test(domain)) {
    return { refusal: refuse('PANOPTO_DOMAIN_INVALID', 'The Panopto domain must be a bare hostname; nothing was saved.',
      ['Pass only the host, e.g. "school.hosted.panopto.com" (no path or query).']) };
  }
  const now = new Date().toISOString();
  return {
    value: {
      domain, clientId, clientSecret,
      iframeWhitelisted: typeof input.iframeWhitelisted === 'boolean' ? input.iframeWhitelisted : null,
      configuredAt: now,
      lastValidatedAt: now,
    },
  };
}

// ── share flag (for the clear preview) ───────────────────────────────────────

/**
 * The module file's explicit `share[kind]`, if any. Reads ONLY the share map;
 * credential values are never touched. shared-types exposes no reader for the
 * flag, and the clear preview must say which identity the module falls back to.
 */
function readShareFlag(moduleId: string, kind: CredentialKind): boolean | undefined | 'unreadable' {
  const path = join(ccSecretsHome(), MODULE_CREDENTIALS_DIRNAME, `${moduleId}.json`);
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return 'unreadable'; // The SyntaxError quotes file contents; dropped.
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'unreadable';
  const share = (parsed as { share?: unknown }).share;
  if (typeof share !== 'object' || share === null) return undefined;
  const flag = (share as Record<string, unknown>)[kind];
  return typeof flag === 'boolean' ? flag : undefined;
}

// ── the tool ─────────────────────────────────────────────────────────────────

function missingRefusal(name: string, id: string, kind: CredentialKind, missing: MissingCredential['missing'], extra: Result = {}): Result {
  const { code, label } = KIND_INFO[kind];
  const fix = `ct_setup action module_credentials with module "${id}"`;
  const message =
    missing === 'incomplete'
      ? `${name} (${id}) has its own ${label} saved, but it is incomplete. Set it again (op "set") or clear it (op "clear").`
      : missing === 'share-denied'
        ? `${name} (${id}) has no ${label} of its own and is not allowed to use your main one.`
        : `${name} (${id}) has no ${label}: none of its own, and no main one is configured.`;
  return refuse(code, message, [
    `Give it its own: ${fix}, op "set".`,
    `Or let it use your main ${label}: ${fix}, op "share".`,
  ], { missing, ...extra });
}

/** Where the module's credential would come from right now: 'module', 'shared' or null + why. */
function effective(id: string, kind: CredentialKind, origin: ModuleOrigin): Result {
  const r = resolveModuleCredential(id, kind, { shareDefault: shareDefaultFor(origin) });
  return 'missing' in r ? { source: null, missing: r.missing } : { source: r.source };
}

export async function setupModuleCredentials(
  input: SetupModuleCredentialsInput,
  deps: ModuleCredentialsDeps = {},
): Promise<Result> {
  const args = (input ?? {}) as Partial<Record<keyof SetupModuleCredentialsInput, unknown>>;
  const resolveModule = deps.resolveModule ?? defaultResolveModule;
  const listIds = deps.listModuleIds ?? defaultListModuleIds;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  const op = args.op as ModuleCredentialOp;
  if (!MODULE_CREDENTIAL_OPS.includes(op)) {
    return refuse('OP_INVALID', `op must be one of ${MODULE_CREDENTIAL_OPS.join(', ')}.`);
  }
  const kind = args.kind as CredentialKind;
  if (!(CREDENTIAL_KINDS as readonly string[]).includes(kind as string)) {
    return refuse('CREDENTIAL_KIND_INVALID', `kind must be one of ${CREDENTIAL_KINDS.join(', ')}.`);
  }

  const unknown = (): Result => refuse('UNKNOWN_MODULE', 'That is not an installed or built-in module.',
    [`Valid modules: ${listIds().join(', ') || '(none)'}`, 'Run ct_advanced list_modules to see each module.']);
  const rawId = args.module;
  if (typeof rawId !== 'string' || rawId.length > MODULE_ID_MAX || !MODULE_ID_SEGMENT.test(rawId)) return unknown();
  const lookup = await resolveModule(rawId);
  if (lookup.status === 'unknown') return unknown();
  if (lookup.status === 'load-failed') {
    return refuse('MODULE_LOAD_FAILED', `Module "${rawId}" is installed but could not be loaded, so its credential declarations are unknown.`,
      ['Run ct_setup action doctor, or reinstall the module with install_module.']);
  }

  const id = rawId;
  const { module: mod, origin } = lookup;
  const name = typeof mod.name === 'string' && mod.name ? mod.name : id;
  const base = { module: id, kind, op };

  if (mod.contractVersion !== 2) {
    return refuse('LEGACY_MODULE',
      `${name} (${id}) is a legacy module: it reads your shared credentials directly, so the host cannot give it ` +
      'its own credential or limit what it uses. Nothing was changed.',
      [`Update it (install_module ${id}) to a version that declares its credentials, then retry.`], base);
  }
  const declared = (mod.credentials ?? []).some((d) => d.kind === kind);
  if (!declared) {
    const kinds = (mod.credentials ?? []).map((d) => d.kind);
    return refuse('CREDENTIAL_NOT_DECLARED',
      `${name} (${id}) does not declare a ${kind} credential, so none can be set for it. Nothing was changed.`,
      [kinds.length ? `It declares: ${kinds.join(', ')}.` : 'It declares no credentials.'], base);
  }
  const label = KIND_INFO[kind].label;

  switch (op) {
    case 'set': {
      const built = credentialFromInput(kind, args as SetupModuleCredentialsInput);
      if ('refusal' in built) return { ...base, ...built.refusal, saved: false };
      const outcome = await validate(kind, built.value, fetchImpl);
      if (!outcome.ok) {
        return refuse('CREDENTIAL_VALIDATION_FAILED', `${outcome.reason} Nothing was saved.`,
          ['Check the credential and the host or domain, then retry.', 'Check network connectivity.'],
          { ...base, saved: false, validated: false });
      }
      setModuleCredential(id, kind, built.value);
      return {
        ok: true, ...base, saved: true, validated: true, source: 'module',
        message: `${name} (${id}) now uses its own ${label}, validated just now.`,
      };
    }

    case 'test': {
      const r = resolveModuleCredential(id, kind, { shareDefault: shareDefaultFor(origin) });
      if ('missing' in r) return { ...base, ...missingRefusal(name, id, kind, r.missing) };
      const outcome = await validate(kind, r.value, fetchImpl);
      const whose = r.source === 'module' ? 'its own' : 'your shared';
      if (!outcome.ok) {
        return refuse('CREDENTIAL_VALIDATION_FAILED', `${name} (${id}) uses ${whose} ${label}, and it failed: ${outcome.reason}`,
          [`Set a working one: ct_setup action module_credentials with module "${id}", op "set".`],
          { ...base, source: r.source, validated: false });
      }
      return {
        ok: true, ...base, source: r.source, validated: true,
        message: `${name} (${id}) uses ${whose} ${label}, and it works.`,
      };
    }

    case 'share':
    case 'unshare': {
      const allow = op === 'share';
      setModuleShare(id, kind, allow);
      const now = effective(id, kind, origin);
      const message = now.source === 'module'
        ? `Saved. ${name} (${id}) has its own ${label}, which it keeps using; this setting applies if that is cleared.`
        : allow
          ? now.source === 'shared'
            ? `${name} (${id}) may now use your main ${label}.`
            : `${name} (${id}) may now use your main ${label}, but none is configured yet.`
          : `${name} (${id}) may no longer use your main ${label}; it needs its own (op "set") to work.`;
      return { ok: true, ...base, share: allow, ...now, message };
    }

    case 'clear': {
      const flag = readShareFlag(id, kind);
      const unreadable = flag === 'unreadable';
      const presence = unreadable ? 'incomplete' : moduleCredentialPresence(id)[kind];
      if (presence === 'none') {
        return { ok: true, ...base, removed: false, ...effective(id, kind, origin),
          message: `${name} (${id}) has no ${label} of its own; nothing to clear.` };
      }
      const sharingAllowed = !unreadable && (flag ?? shareDefaultFor(origin));
      if (args.confirm !== true) {
        const what = unreadable
          ? `${name} (${id})'s stored credential file cannot be read. Clearing deletes the whole file: every credential and share choice saved for this module.`
          : `This deletes ${name} (${id})'s own ${label}.`;
        const next = sharingAllowed
          ? `After that, this module will use your shared ${label} instead: it will act as your main account.`
          : `After that, this module will stop working until you set or share a ${label}.`;
        return refuse('CONFIRMATION_REQUIRED', `${what} ${next} Nothing has been deleted yet.`,
          [`To go ahead, call again with confirm: true.`],
          { ...base, confirmRequired: true, afterClear: sharingAllowed ? 'shared' : 'stops-working', ...(unreadable ? { unreadable: true } : {}) });
      }
      const { removed } = unreadable ? clearModuleCredential(id) : clearModuleCredential(id, kind);
      const now = effective(id, kind, origin);
      const message = now.source === 'shared'
        ? `Cleared. ${name} (${id}) now uses your shared ${label}.`
        : `Cleared. ${name} (${id}) has no ${label} until you set or share one.`;
      return { ok: true, ...base, removed, ...now, message };
    }
  }
}
