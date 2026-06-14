import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { rosterVaultDir, vaultPath } from '../paths.js';
import type { VaultRecord, VaultCollision } from '../types.js';

/** Load the vault, or [] if it does not exist yet. Throws only on corruption. */
export function loadVault(): VaultRecord[] {
  const path = vaultPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { records?: VaultRecord[] };
    return parsed.records ?? [];
  } catch {
    throw new Error('VAULT_CORRUPT: roster-vault/vault.json could not be parsed.');
  }
}

/** Persist the vault, creating the dir and writing the file with 0600 perms. Returns the path. */
export function saveVault(records: VaultRecord[]): string {
  mkdirSync(rosterVaultDir(), { recursive: true });
  const path = vaultPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ records }, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}

export function indexByStudentNumber(records: VaultRecord[]): Map<string, VaultRecord> {
  const idx = new Map<string, VaultRecord>();
  for (const r of records) idx.set(r.studentNumber, r);
  return idx;
}

/** Returns a collision if studentNumber is known but maps to a different canvasId; else null. */
export function detectCollision(
  idx: Map<string, VaultRecord>, studentNumber: string, incomingCanvasId: string,
): VaultCollision | null {
  const existing = idx.get(studentNumber);
  if (!existing) return null;
  if (existing.canvasId === incomingCanvasId) return null;
  return { studentNumber, vaultCanvasId: existing.canvasId, incomingCanvasId };
}
