import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ColumnMapping } from '../types.js';

/** `<dir>/roster-vault/column-map.json`. Callers pass the host's secrets root (`ctx.paths.secrets`), beside the vault. */
export function columnMapPath(configDir: string): string {
  return join(configDir, 'roster-vault', 'column-map.json');
}

/** Load the remembered PeopleSoft column mapping from `configDir`, or null if none saved. */
export function loadColumnMap(configDir: string): ColumnMapping | null {
  const path = columnMapPath(configDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ColumnMapping;
  } catch {
    return null;
  }
}

/** Persist the column mapping under `configDir` for reuse next term. Returns the path. */
export function saveColumnMap(configDir: string, mapping: ColumnMapping): string {
  const path = columnMapPath(configDir);
  mkdirSync(join(configDir, 'roster-vault'), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(mapping, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}
