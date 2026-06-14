import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve the C&C home dir, honoring CC_HOME (tests point this at a temp dir). */
export function ccHome(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}

/** Directory holding all roster-manager state (vault + remembered mappings). */
export function rosterVaultDir(): string {
  return join(ccHome(), 'roster-vault');
}

export function vaultPath(): string {
  return join(rosterVaultDir(), 'vault.json');
}

export function columnMapPath(): string {
  return join(rosterVaultDir(), 'column-map.json');
}

export function majorAliasesPath(): string {
  return join(rosterVaultDir(), 'major-aliases.json');
}
