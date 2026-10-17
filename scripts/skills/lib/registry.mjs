import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
export const SKILLS_ROOT = join(REPO_ROOT, 'packages/command-and-control/skills');

const CC_DIST = (repoRoot) => join(repoRoot, 'packages/command-and-control/dist');

/**
 * Only these fields ever reach a generated file. `inputSchema` and `handler`
 * are intentionally absent: a skill file must never carry a parameter schema
 * (which can name credential fields) or a function reference.
 */
const OPERATION_KEYS = [
  'id', 'section', 'description', 'taskCategory', 'exposure', 'intentTool', 'intentAction',
];

export function plainOperation(op) {
  const out = {};
  for (const key of OPERATION_KEYS) {
    if (op[key] !== undefined) out[key] = op[key];
  }
  return out;
}

async function importDist(repoRoot, relativePath) {
  const path = join(CC_DIST(repoRoot), relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${path}. The skill graph is generated from the built registry — run "npm run build" first.`,
    );
  }
  return import(pathToFileURL(path).href);
}

/**
 * Map loaded modules onto operations, keyed as the host namespaces them.
 * Exported so the mapping is testable with a fabricated module map, without
 * enabling a real module.
 */
export async function moduleOperationsFrom(repoRoot, byId) {
  const { adaptModuleTools } = await importDist(repoRoot, 'surface/module_adapter.js');
  const operations = [];
  for (const [moduleId, mod] of byId) {
    for (const op of adaptModuleTools(moduleId, mod.tools)) operations.push(plainOperation(op));
  }
  return operations;
}

/**
 * The generator's single input: the operation list plus the two closed sets it
 * is grouped by. Everything comes from the built `dist`, so the generator and
 * the running server can never disagree about the surface.
 */
export async function loadRegistrySource({ repoRoot = REPO_ROOT, includeModules = false, warn = console.error } = {}) {
  const registry = await importDist(repoRoot, 'surface/registry.js');
  const { SECTIONS, SECTION_IDS } = await importDist(repoRoot, 'surface/sections.js');
  const { INTENT_TOOLS } = await importDist(repoRoot, 'surface/intents/index.js');

  const operations = registry.CORE_OPERATIONS.map(plainOperation);

  if (includeModules) {
    try {
      const { loadModules } = await importDist(repoRoot, 'modules/registry.js');
      const { byId } = await loadModules();
      operations.push(...(await moduleOperationsFrom(repoRoot, byId)));
    } catch (err) {
      warn(`skills: --include-modules failed, generating core operations only. ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    operations,
    sections: SECTION_IDS.map((id) => ({ id, description: SECTIONS[id].description })),
    intentTools: Object.entries(INTENT_TOOLS).map(([id, meta]) => ({
      id,
      summary: meta.summary,
      extendedBy: meta.extendedBy,
    })),
  };
}
