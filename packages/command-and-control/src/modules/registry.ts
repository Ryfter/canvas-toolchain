import { existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  isCanvasToolchainModule,
  type CanvasToolchainModule,
  type ModuleManifest,
} from '@canvas-toolchain/module-contract';
import { loadModuleManifest } from './manifest.js';
import { createModuleContext, type ModuleOrigin } from './context.js';
import { sha256File } from '../channel/hash.js';
import {
  artifactPath, isSafeArtifactRef, VERSION_SEGMENT,
  loadInstalledModules, saveInstalledModules,
} from '../channel/installed.js';
import { compareVersions } from '../update/check.js';

/** Static registry of known modules. Future runtime-loading swaps this map for dynamic import. */
export const KNOWN_MODULES: Record<string, () => Promise<CanvasToolchainModule>> = {
  video: async () => (await import('@canvas-toolchain/module-video')).default,
  'oral-assessment': async () => (await import('@canvas-toolchain/module-oral-assessment')).default,
  'group-builder': async () => (await import('@canvas-toolchain/module-group-builder')).default,
  roster: async () => (await import('@canvas-toolchain/module-roster')).default,
  peerassessment: async () => (await import('@canvas-toolchain/module-peerassessment')).default,
};

/** Ids of all known modules (whether enabled or not). */
export function knownModuleIds(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
): string[] {
  return Object.keys(known);
}

export interface LoadedModules {
  tools: Tool[];
  handlers: Map<string, (args: unknown) => Promise<CallToolResult>>;
  /** The active modules keyed by module id. The operation registry namespaces
   *  module operations as `<moduleId>.<toolName>`, which needs the id that the
   *  flattened `tools`/`handlers` views throw away. */
  byId: Map<string, CanvasToolchainModule>;
}

/** Load installed channel artifacts: enabled + re-hash verified + contract checked.
 *  Every failure mode is fail-soft (warn + skip); the host always starts. */
export async function loadInstalledArtifacts(
  manifest: ModuleManifest,
): Promise<Map<string, CanvasToolchainModule>> {
  const out = new Map<string, CanvasToolchainModule>();
  const installed = loadInstalledModules();
  for (const [id, rec] of Object.entries(installed.modules)) {
    if (!manifest.modules[id]?.enabled) continue;
    if (!isSafeArtifactRef(id, rec?.version)) {
      console.error(`[modules] installed-modules.json entry '${id}' has an invalid id/version shape; skipping (never imported).`);
      continue;
    }
    const path = artifactPath(id, rec.version);
    try {
      if (!existsSync(path)) {
        console.error(`[modules] installed artifact missing for '${id}' v${rec.version}; skipping.`);
        continue;
      }
      const actual = await sha256File(path);
      if (actual !== rec.sha256) {
        console.error(
          `[modules] '${id}' v${rec.version} failed integrity re-check (expected ${rec.sha256}, got ${actual}); ` +
          `NOT loaded. Reinstall with install_module, or roll back to a retained previous version.`,
        );
        continue;
      }
      // Cache-bust: Node caches ESM by URL for the process lifetime, so append the
      // verified hash as a query string — same bytes → same URL → cache hit is correct;
      // changed bytes → new record hash → new URL → a re-loadModules() picks up fresh code.
      const mod = (await import(`${pathToFileURL(path).href}?sha256=${rec.sha256}`)).default as unknown;
      if (!isCanvasToolchainModule(mod)) {
        console.error(`[modules] installed '${id}' did not satisfy the module contract; skipping.`);
        continue;
      }
      out.set(id, mod);
    } catch (err) {
      console.error(`[modules] failed to load installed '${id}'; skipping. ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    // Successful load of the current version → prune the retained previous version (spec §9).
    // This runs in its own try/catch: a prune failure must NOT be reported as a load
    // failure — the module above already loaded and is active in `out`.
    if (rec.previous) {
      try {
        // #126: previous.version becomes an rmSync target — a tampered value
        // like '../..' would resolve to CC_HOME itself. Clear the garbage
        // record without touching the filesystem.
        if (typeof rec.previous.version === 'string' && VERSION_SEGMENT.test(rec.previous.version)) {
          rmSync(dirname(artifactPath(id, rec.previous.version)), { recursive: true, force: true });
        } else {
          console.error(`[modules] '${id}' loaded, but its retained previous version has an invalid shape; clearing the record without deleting anything.`);
        }
        const file = loadInstalledModules();
        if (file.modules[id]) {
          delete file.modules[id].previous;
          saveInstalledModules(file);
        }
      } catch (err) {
        console.error(
          `[modules] '${id}' loaded, but pruning the retained previous version failed ` +
          `(${err instanceof Error ? err.message : String(err)}); it will be retried on next startup.`,
        );
      }
    }
  }
  return out;
}

export interface LoadModulesOptions {
  /** Test seam for the Windows-only legacy hint (spec 5.3). Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
}

const LEGACY_NOT_CONFIGURED = /^[A-Z][A-Z0-9_]*_NOT_CONFIGURED\b/;

/** Leading `CODE:` of an error message, else the error's name. Module error text can carry anything. */
function errorCode(err: unknown): string {
  if (err instanceof Error) {
    const m = /^([A-Z][A-Z0-9_]+):/.exec(err.message);
    return m ? m[1] : err.name;
  }
  return 'non-Error thrown';
}

/**
 * Spec 5.3: a legacy (pre-v2) channel artifact reads the old `~\.command-and-control`
 * itself, which is gone after the Windows migration. On win32 only, its
 * `*_NOT_CONFIGURED` rejections get an update hint; everything else passes through.
 */
function withLegacyHint(
  id: string,
  handler: (args: unknown) => Promise<CallToolResult>,
): (args: unknown) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      if (!(err instanceof Error) || !LEGACY_NOT_CONFIGURED.test(err.message)) throw err;
      const hinted = new Error(
        `${err.message} This module version predates Canvas Toolchain's Windows folders. ` +
        `Run \`install_module ${id}\` to update it.`,
        { cause: err },
      );
      hinted.name = err.name;
      throw hinted;
    }
  };
}

/**
 * Make a precedence winner usable. v2: build its ctx and await `init` BEFORE its
 * tools are exposed (null = skip). v1: unchanged, no ctx; a legacy channel module
 * is stored as a shallow copy with hint-wrapped handlers on win32, so `byId` (the
 * production dispatch path) and `handlers` both carry the wrapper.
 */
async function activate(
  id: string,
  mod: CanvasToolchainModule,
  origin: ModuleOrigin,
  platform: NodeJS.Platform,
): Promise<CanvasToolchainModule | null> {
  if (mod.contractVersion !== 2) {
    if (origin !== 'channel' || platform !== 'win32') return mod;
    return { ...mod, tools: mod.tools.map((t) => ({ ...t, handler: withLegacyHint(id, t.handler) })) };
  }
  // isCanvasToolchainModule already rejected malformed declarations.
  const ctx = createModuleContext({ moduleId: id, moduleName: mod.name, declarations: mod.credentials ?? [], origin });
  try {
    await mod.init?.(ctx);
  } catch (err) {
    console.error(`[modules] '${id}' init failed (${errorCode(err)}); skipping, its tools are not exposed.`);
    return null;
  }
  return mod;
}

/** Load all enabled modules; return their merged tool schemas + a name->handler map.
 *  An optional `known` map can be injected for testing (defaults to KNOWN_MODULES).
 *  If any module's loader throws, fails the contract check, or (v2) its `init`
 *  throws, it is skipped with a warning — a broken/optional module must NOT crash
 *  the host server (fail-soft). */
export async function loadModules(
  known: Record<string, () => Promise<CanvasToolchainModule>> = KNOWN_MODULES,
  opts: LoadModulesOptions = {},
): Promise<LoadedModules> {
  const platform = opts.platform ?? process.platform;
  const manifest = loadModuleManifest();
  const winners = new Map<string, { mod: CanvasToolchainModule; origin: ModuleOrigin }>();

  // Phase 1: bundled modules (unchanged semantics).
  for (const [id, entry] of Object.entries(manifest.modules)) {
    if (!entry?.enabled) continue;
    const loader = known[id];
    if (!loader) continue;
    try {
      const mod = await loader();
      if (!isCanvasToolchainModule(mod)) {
        console.error(`[modules] '${id}' did not satisfy the module contract; skipping.`);
        continue;
      }
      winners.set(id, { mod, origin: 'bundled' });
    } catch (err) {
      console.error(`[modules] failed to load '${id}'; skipping. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Phase 2: installed channel artifacts. Semver-newer wins on id collision (spec §8).
  const dynamic = await loadInstalledArtifacts(manifest);
  for (const [id, mod] of dynamic) {
    try {
      const bundled = winners.get(id)?.mod;
      if (bundled && compareVersions(mod.version, bundled.version) <= 0) {
        console.error(`[modules] '${id}': bundled v${bundled.version} >= installed v${mod.version}; using bundled.`);
        continue;
      }
      if (bundled) {
        console.error(`[modules] '${id}': installed v${mod.version} > bundled v${bundled.version}; using installed.`);
      }
      winners.set(id, { mod, origin: 'channel' });
    } catch (err) {
      console.error(`[modules] precedence check failed for '${id}' (${err instanceof Error ? err.message : String(err)}); using bundled.`);
    }
  }

  // Phase 3: initialize only the precedence winners, so a losing bundled module never gets a ctx.
  const active = new Map<string, CanvasToolchainModule>();
  for (const [id, { mod, origin }] of winners) {
    const ready = await activate(id, mod, origin, platform);
    if (ready) active.set(id, ready);
  }

  const tools: Tool[] = [];
  const handlers = new Map<string, (args: unknown) => Promise<CallToolResult>>();
  for (const mod of active.values()) {
    for (const t of mod.tools) {
      tools.push(t.schema);
      handlers.set(t.schema.name, t.handler);
    }
  }
  return { tools, handlers, byId: active };
}
