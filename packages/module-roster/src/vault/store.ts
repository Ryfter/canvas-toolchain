import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VaultRecord, VaultCollision } from '../types.js';

/**
 * The identity vault lives at `<secretsDir>/roster-vault/vault.json`. Callers pass the host's
 * secrets root (`ctx.paths.secrets`); the vault never resolves a location on its own.
 */
export function rosterVaultDir(secretsDir: string): string {
  return join(secretsDir, 'roster-vault');
}

export function vaultPath(secretsDir: string): string {
  return join(rosterVaultDir(secretsDir), 'vault.json');
}

/** Load the vault from `secretsDir`, or [] if it does not exist yet. Throws only on corruption. */
export function loadVault(secretsDir: string): VaultRecord[] {
  const path = vaultPath(secretsDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { records?: VaultRecord[] };
    return parsed.records ?? [];
  } catch {
    throw new Error('VAULT_CORRUPT: roster-vault/vault.json could not be parsed.');
  }
}

/**
 * Persist the vault under `secretsDir`: creates the dir, writes a 0600 tmp file, then renames it
 * over the vault so a crash never leaves a half-written vault. Returns the path.
 */
export function saveVault(secretsDir: string, records: VaultRecord[]): string {
  mkdirSync(rosterVaultDir(secretsDir), { recursive: true });
  const path = vaultPath(secretsDir);
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
