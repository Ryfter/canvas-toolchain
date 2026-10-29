import type {
  AnthropicCredential, CanvasCredential, CredentialKind, ModuleContext,
} from '@canvas-toolchain/module-contract';

export interface FakeCtxOptions {
  config: string;
  secrets: string;
  data?: string;
  canvas?: CanvasCredential | null;
  anthropic?: AnthropicCredential | null;
}

export interface FakeCtx extends ModuleContext {
  /** Every credential request the module made, in order. */
  requests: Array<{ op: 'get' | 'tryGet'; kind: CredentialKind }>;
}

/**
 * A stand-in for the host's ModuleContext. It mirrors the host contract that matters to the
 * module: get() throws <KIND>_NOT_CONFIGURED when missing, tryGet() returns null, and a kind
 * roster did not declare throws CREDENTIAL_NOT_DECLARED.
 */
export function makeFakeCtx(opts: FakeCtxOptions): FakeCtx {
  const requests: FakeCtx['requests'] = [];
  const declared = new Set<CredentialKind>(['canvas', 'anthropic']);
  const lookup = (kind: CredentialKind): CanvasCredential | AnthropicCredential | null => {
    if (!declared.has(kind)) throw new Error(`CREDENTIAL_NOT_DECLARED: roster did not declare ${kind}`);
    if (kind === 'canvas') return opts.canvas ?? null;
    if (kind === 'anthropic') return opts.anthropic ?? null;
    return null;
  };
  const credentials = {
    async get(kind: CredentialKind) {
      requests.push({ op: 'get', kind });
      const v = lookup(kind);
      if (v === null) throw new Error(`${kind.toUpperCase()}_NOT_CONFIGURED: Roster & Identity Manager (roster) needs a ${kind} connection.`);
      return v;
    },
    async tryGet(kind: CredentialKind) {
      requests.push({ op: 'tryGet', kind });
      return lookup(kind);
    },
  } as unknown as ModuleContext['credentials'];
  return {
    moduleId: 'roster',
    paths: {
      config: opts.config,
      data: opts.data ?? opts.config,
      designStudioData: opts.data ?? opts.config,
      secrets: opts.secrets,
    },
    credentials,
    requests,
  };
}
