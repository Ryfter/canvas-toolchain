import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleManifest } from '@canvas-toolchain/module-contract';
import { getCcHomePath } from '../kb/config.js';

/** Absolute path to ~/.command-and-control/modules.json. */
export function getModulesManifestPath(): string {
  return join(getCcHomePath(), 'modules.json');
}

/** Read ~/.command-and-control/modules.json; tolerate missing/corrupt by returning empty. */
export function loadModuleManifest(): ModuleManifest {
  const path = getModulesManifestPath();
  if (!existsSync(path)) return { modules: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ModuleManifest;
    return parsed.modules ? parsed : { modules: {} };
  } catch {
    return { modules: {} };
  }
}

/** Atomically write modules.json (tmp + rename, 0o600). Returns the path written. */
export function saveModuleManifest(manifest: ModuleManifest): string {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const path = getModulesManifestPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}
