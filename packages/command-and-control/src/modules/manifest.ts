import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModuleManifest } from '@canvas-toolchain/module-contract';
import { getCcHomePath } from '../kb/config.js';

/** Read ~/.command-and-control/modules.json; tolerate missing/corrupt by returning empty. */
export function loadModuleManifest(): ModuleManifest {
  const path = join(getCcHomePath(), 'modules.json');
  if (!existsSync(path)) return { modules: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as ModuleManifest;
    return parsed.modules ? parsed : { modules: {} };
  } catch {
    return { modules: {} };
  }
}
