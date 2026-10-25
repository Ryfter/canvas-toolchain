/**
 * The host side of module contract v2 (spec 4.3, 6, Q2): builds the
 * `ModuleContext` a v2 module receives in `init`.
 *
 * - Bound to one module id; frozen, so a module cannot widen its declarations.
 * - Credentials come only from shared-types' `resolveModuleCredential`, read
 *   fresh on every call so a `ct_setup` change needs no restart.
 * - Only declared kinds resolve; anything else is `CREDENTIAL_NOT_DECLARED`.
 * - Errors carry the module name, id, kind and fix. Never a value, host or path.
 *
 * Scoping, not a security boundary: modules run in-process (spec section 6).
 */
import type {
  AnthropicCredential,
  CanvasCredential,
  CredentialDeclaration,
  CredentialKind,
  ModuleContext,
  PanoptoCredential,
} from '@canvas-toolchain/module-contract';
import { cdsDataHome, resolveModuleCredential, type MissingCredential } from '@canvas-toolchain/shared-types';
import { getCcDataPath, getCcHomePath, getCcSecretsPath } from '../kb/config.js';

/** Where a module came from: shipped inside the install, or downloaded from the channel. */
export type ModuleOrigin = 'bundled' | 'channel';

/** Spec Q2 (accepted): first-party bundled modules share by default; channel modules are denied until consent. */
export function shareDefaultFor(origin: ModuleOrigin): boolean {
  return origin === 'bundled';
}

export interface CreateModuleContextOptions {
  moduleId: string;
  /** Display name used in error messages. */
  moduleName: string;
  declarations: readonly CredentialDeclaration[];
  origin: ModuleOrigin;
}

const KIND_INFO: Record<CredentialKind, { code: string; label: string; article: string }> = {
  canvas: { code: 'CANVAS_NOT_CONFIGURED', label: 'Canvas connection', article: 'a' },
  anthropic: { code: 'ANTHROPIC_NOT_CONFIGURED', label: 'Anthropic API key', article: 'an' },
  panopto: { code: 'PANOPTO_NOT_CONFIGURED', label: 'Panopto connection', article: 'a' },
};

function codedError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  err.name = code;
  return err;
}

function notConfigured(name: string, id: string, kind: CredentialKind, missing: MissingCredential['missing']): Error {
  const { code, label, article } = KIND_INFO[kind];
  const who = `${name} (${id})`;
  const fix = `Run ct_setup action module_credentials with module "${id}"`;
  switch (missing) {
    case 'incomplete':
      return codedError(code,
        `${who} has its own ${label} saved, but it is incomplete. ${fix} to set it again, or clear it.`);
    case 'share-denied':
      return codedError(code,
        `${who} needs ${article} ${label} and has not been allowed to use your main one. ` +
        `${fix} to share your main ${label} or give it its own.`);
    default:
      return codedError(code,
        `${who} needs ${article} ${label}. ${fix} to share your main ${label} or give it its own.`);
  }
}

type ValueOf<K extends CredentialKind> =
  K extends 'canvas' ? CanvasCredential : K extends 'anthropic' ? AnthropicCredential : PanoptoCredential;

export function createModuleContext(opts: CreateModuleContextOptions): ModuleContext {
  const { moduleId, moduleName, origin } = opts;
  const declared: ReadonlySet<string> = new Set(opts.declarations.map((d) => d.kind));
  const policy = { shareDefault: shareDefaultFor(origin) };

  /** Throws only CREDENTIAL_NOT_DECLARED or a store error code (neither carries a value). */
  function resolve<K extends CredentialKind>(kind: K) {
    if (typeof kind !== 'string' || !declared.has(kind)) {
      // Echo `kind` only when it is a known kind; anything else could be arbitrary text.
      const what = typeof kind === 'string' && kind in KIND_INFO ? `a ${kind} credential` : 'that credential kind';
      throw codedError('CREDENTIAL_NOT_DECLARED',
        `${moduleName} (${moduleId}) did not declare ${what}, so the host will not provide it. ` +
        'A module may only ask for the credential kinds listed in its `credentials` declarations.');
    }
    return resolveModuleCredential(moduleId, kind, policy);
  }

  async function get<K extends CredentialKind>(kind: K): Promise<ValueOf<K>> {
    const result = resolve(kind);
    if ('missing' in result) throw notConfigured(moduleName, moduleId, kind, result.missing);
    return result.value as ValueOf<K>;
  }

  async function tryGet<K extends CredentialKind>(kind: K): Promise<ValueOf<K> | null> {
    const result = resolve(kind);
    return 'missing' in result ? null : (result.value as ValueOf<K>);
  }

  const credentials = Object.freeze({ get, tryGet }) as ModuleContext['credentials'];
  const paths = Object.freeze({
    config: getCcHomePath(),
    data: getCcDataPath(),
    designStudioData: cdsDataHome(),
    secrets: getCcSecretsPath(),
  });
  return Object.freeze({ moduleId, paths, credentials });
}
