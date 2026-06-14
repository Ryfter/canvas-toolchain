import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { majorAliasesPath, rosterVaultDir } from '../paths.js';

/** Load remembered raw->canonical major overrides, or {} if none saved. */
export function loadMajorAliases(): Record<string, string> {
  const path = majorAliasesPath();
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>; }
  catch { return {}; }
}

/** Persist raw->canonical major overrides. Returns the path. */
export function saveMajorAliases(aliases: Record<string, string>): string {
  mkdirSync(rosterVaultDir(), { recursive: true });
  const path = majorAliasesPath();
  writeFileSync(path, JSON.stringify(aliases, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return path;
}
