import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../../scripts/skills/lint.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

/**
 * Every test here drives the real bin, because that is what it asserts: the
 * process boundary (exit codes, stderr, symlinked invocation) and the flag
 * plumbing through `parseArgs`, neither of which survives being replaced by a
 * direct `lintProject` call. Each run pays node boot plus the built-registry
 * import from `dist` (~0.4s idle, several times that when CI runs the test files
 * in parallel), so the budget is explicit rather than the 5s default. The
 * flag-rejection tests fail in `parseArgs`, before that import, and are far
 * cheaper.
 */
const SPAWN_TIMEOUT_MS = 30_000;

function runScript(script: string, args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', status: failure.status ?? 1 };
  }
}

function run(...args: string[]): { stdout: string; stderr: string; status: number } {
  return runScript(SCRIPT, args);
}

describe('lint CLI', () => {
  it('reports the committed tree as clean JSON', () => {
    const { stdout, status } = run('--json');
    const report = JSON.parse(stdout);

    expect(status).toBe(0);
    expect(report.summary.total).toBe(0);
    expect(report.summary.byRule['too-long']).toBe(0);
    expect(report.operations).toBeGreaterThanOrEqual(86);
    expect(report.summary.byRule).toHaveProperty('orphan');
  }, SPAWN_TIMEOUT_MS);

  it('exits non-zero when a violation is reported', () => {
    const { stdout, status } = run('--json', '--max-description', '1');
    const report = JSON.parse(stdout);
    expect(report.summary.byRule['too-long']).toBe(report.operations);
    expect(status).toBe(1);
  }, SPAWN_TIMEOUT_MS);

  it('rejects a non-numeric limit and an unknown flag instead of ignoring them', () => {
    expect(run('--max-description', 'wide').stderr).toContain('needs a positive number');
    expect(run('--similarity', '0').stderr).toContain('needs a positive number');
    expect(run('--nope').stderr).toContain('unknown argument');
  }, SPAWN_TIMEOUT_MS);

  it('rejects a flag the writers own but the lint does not implement', () => {
    expect(run('--check').stderr).toContain('unknown argument');
  }, SPAWN_TIMEOUT_MS);

  it('runs its main when invoked through a symlink, as a bin shim does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-lint-'));
    const shim = join(dir, 'lint.mjs');
    symlinkSync(SCRIPT, shim);
    try {
      const { stdout, status } = runScript(shim, ['--json']);
      expect(status).toBe(0);
      expect(JSON.parse(stdout).operations).toBeGreaterThanOrEqual(86);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, SPAWN_TIMEOUT_MS);
});
