import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GitState } from './manifest_types.js';

function tryGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return null;
  }
}

export function detectGitState(courseDir: string): GitState {
  if (!existsSync(join(courseDir, '.git'))) {
    return { isRepo: false, nudge: 'init-suggested' };
  }
  const status = tryGit(['status', '--porcelain'], courseDir);
  const remote = tryGit(['remote', 'get-url', 'origin'], courseDir) ?? undefined;
  const clean = status === '';
  return {
    isRepo: true,
    clean,
    remote: remote || undefined,
    nudge: clean ? undefined : 'dirty-tree-warning',
  };
}

export function gitCommitPrePublish(courseDir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: courseDir });
  execFileSync('git', ['commit', '--allow-empty', '-m', message], { cwd: courseDir });
}

export function gitTagSuccess(courseDir: string, tag: string): void {
  execFileSync('git', ['tag', tag], { cwd: courseDir });
}

export function gitPushTag(courseDir: string, tag: string): { ok: true } | { ok: false; reason: string } {
  try {
    execFileSync('git', ['push', 'origin', tag], { cwd: courseDir, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
