import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** One MCP tool a module contributes. */
export interface ModuleTool {
  schema: Tool;
  handler(args: unknown): Promise<CallToolResult>;
}

export type CredentialKind = 'canvas' | 'anthropic' | 'panopto';

export interface CredentialDeclaration {
  kind: CredentialKind;
  required: boolean;
  /** One line shown to the professor: what the module does with it. */
  purpose: string;
}

/** Host already normalized the Canvas host. */
export interface CanvasCredential {
  host: string;
  token: string;
}

export interface AnthropicCredential {
  apiKey: string;
  model?: string;
}

/** Same fields as the saved Panopto setup config. */
export interface PanoptoCredential {
  domain: string;
  clientId: string;
  clientSecret: string;
  iframeWhitelisted: boolean | null;
  configuredAt: string;
  lastValidatedAt: string;
}

/** Host-injected paths and credentials. v2 modules keep this in module scope. */
export interface ModuleContext {
  moduleId: string;
  paths: { config: string; data: string; designStudioData: string };
  credentials: {
    get(kind: 'canvas'): Promise<CanvasCredential>;
    get(kind: 'anthropic'): Promise<AnthropicCredential>;
    get(kind: 'panopto'): Promise<PanoptoCredential>;
    tryGet(kind: 'canvas'): Promise<CanvasCredential | null>;
    tryGet(kind: 'anthropic'): Promise<AnthropicCredential | null>;
    tryGet(kind: 'panopto'): Promise<PanoptoCredential | null>;
  };
}

/** The single object every module package default-exports. */
export interface CanvasToolchainModule {
  id: string;
  name: string;
  description: string;
  version: string;
  /** Provider/tool types this module can integrate, for #76 discovery matching. */
  handles?: string[];
  tools: ModuleTool[];
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
  /** Absent on v1 modules. v2 is the only accepted version. */
  contractVersion?: 2;
  credentials?: CredentialDeclaration[];
  /** Called once by the host before any tool is exposed. */
  init?(ctx: ModuleContext): void | Promise<void>;
}

export interface ModuleManifestEntry {
  enabled: boolean;
  /** Optional active provider id for modules with a provider layer. */
  activeProvider?: string;
}

export interface ModuleManifest {
  modules: Record<string, ModuleManifestEntry>;
}

const CREDENTIAL_KINDS: ReadonlySet<string> = new Set(['canvas', 'anthropic', 'panopto']);

function isCredentialDeclarationList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return false;
    const d = entry as Record<string, unknown>;
    if (typeof d.kind !== 'string' || !CREDENTIAL_KINDS.has(d.kind)) return false;
    if (seen.has(d.kind)) return false;
    seen.add(d.kind);
    if (typeof d.required !== 'boolean') return false;
    if (typeof d.purpose !== 'string' || d.purpose.trim() === '') return false;
  }
  return true;
}

/** Runtime guard used by the registry before trusting a loaded module. */
export function isCanvasToolchainModule(value: unknown): value is CanvasToolchainModule {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  if (
    typeof m.id !== 'string' ||
    typeof m.name !== 'string' ||
    typeof m.description !== 'string' ||
    typeof m.version !== 'string' ||
    !Array.isArray(m.tools)
  ) {
    return false;
  }
  // No contractVersion: v1, loaded exactly as before.
  if (!('contractVersion' in m) || m.contractVersion === undefined) return true;
  if (m.contractVersion !== 2) return false;
  if (m.credentials === undefined) return true;
  return isCredentialDeclarationList(m.credentials);
}

/**
 * Returns the module-scoped context from init.
 * Throws MODULE_NOT_INITIALIZED when a tool runs before the host calls init.
 */
export function requireCtx(ctx: ModuleContext | undefined): ModuleContext {
  if (ctx === undefined) {
    const err = new Error('MODULE_NOT_INITIALIZED: the host has not called init');
    err.name = 'MODULE_NOT_INITIALIZED';
    throw err;
  }
  return ctx;
}
