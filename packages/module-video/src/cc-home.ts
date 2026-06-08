import { homedir } from 'node:os';
import { join } from 'node:path';

/** Resolve the shared canvas-toolchain config home (matches C&C's kb/config.ts). */
export function getCcHomePath(): string {
  return process.env.CC_HOME ?? join(homedir(), '.command-and-control');
}
