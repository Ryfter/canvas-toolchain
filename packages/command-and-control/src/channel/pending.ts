import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

/** Written by the GUI installer picker; consumed here. The file is a REQUEST,
 *  never an authorization — installs still require the chat confirm gate. */
export interface PendingRequests {
  requestedAt?: string;
  modules: string[];
}

export function getPendingPath(): string {
  return join(getCcHomePath(), 'pending-module-installs.json');
}

export function loadPendingRequests(): PendingRequests {
  const path = getPendingPath();
  if (!existsSync(path)) return { modules: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as PendingRequests;
    return Array.isArray(parsed.modules) ? parsed : { modules: [] };
  } catch {
    return { modules: [] };
  }
}

export function savePendingRequests(p: PendingRequests): string {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const path = getPendingPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(p, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}

export function removePendingModule(id: string): void {
  const current = loadPendingRequests();
  if (!current.modules.includes(id)) return;
  const modules = current.modules.filter((m) => m !== id);
  if (modules.length === 0) {
    clearPendingRequests();
    return;
  }
  savePendingRequests({ ...current, modules });
}

export function clearPendingRequests(): void {
  rmSync(getPendingPath(), { force: true });
}
