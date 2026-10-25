import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** `<dir>/roster-vault/major-aliases.json`. Callers pass the host's secrets root (`ctx.paths.secrets`), beside the vault. */
export function majorAliasesPath(configDir: string): string {
  return join(configDir, 'roster-vault', 'major-aliases.json');
}

/** Load remembered raw->canonical major overrides from `configDir`, or {} if none saved. */
export function loadMajorAliases(configDir: string): Record<string, string> {
  const path = majorAliasesPath(configDir);
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, string>; }
  catch { return {}; }
}

/** Persist raw->canonical major overrides under `configDir`. Returns the path. */
export function saveMajorAliases(configDir: string, aliases: Record<string, string>): string {
  const path = majorAliasesPath(configDir);
  mkdirSync(join(configDir, 'roster-vault'), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(aliases, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, path);
  return path;
}
