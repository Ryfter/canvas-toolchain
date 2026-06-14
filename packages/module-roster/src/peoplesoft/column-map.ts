import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { columnMapPath, rosterVaultDir } from '../paths.js';
import type { ColumnMapping } from '../types.js';

/** Load the remembered PeopleSoft column mapping, or null if none saved. */
export function loadColumnMap(): ColumnMapping | null {
  const path = columnMapPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ColumnMapping;
  } catch {
    return null;
  }
}

/** Persist the column mapping for reuse next term. Returns the path. */
export function saveColumnMap(mapping: ColumnMapping): string {
  mkdirSync(rosterVaultDir(), { recursive: true });
  const path = columnMapPath();
  writeFileSync(path, JSON.stringify(mapping, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return path;
}
