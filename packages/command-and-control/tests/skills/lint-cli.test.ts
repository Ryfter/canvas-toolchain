import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../../scripts/skills/lint.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

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
  it('exits non-zero and reports violations as JSON for the committed tree', () => {
    const { stdout, status } = run('--json');
    const report = JSON.parse(stdout);

    expect(status).toBe(1);
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.summary.byRule['too-long']).toBeGreaterThan(0);
    expect(report.operations).toBeGreaterThanOrEqual(86);
    expect(report.summary.byRule).toHaveProperty('orphan');
  });

  it('exits zero when nothing violates', () => {
    const { stdout, status } = run('--json', '--max-description', '1000000');
    expect(status).toBe(0);
    expect(JSON.parse(stdout).summary.total).toBe(0);
  });

  it('honours a lowered length limit', () => {
    const report = JSON.parse(run('--json', '--max-description', '1').stdout);
    expect(report.summary.byRule['too-long']).toBe(report.operations);
  });

  it('rejects a non-numeric limit and an unknown flag instead of ignoring them', () => {
    expect(run('--max-description', 'wide').stderr).toContain('needs a positive number');
    expect(run('--similarity', '0').stderr).toContain('needs a positive number');
    expect(run('--nope').stderr).toContain('unknown argument');
  });

  it('rejects a flag the writers own but the lint does not implement', () => {
    expect(run('--check').stderr).toContain('unknown argument');
  });

  it('runs its main when invoked through a symlink, as a bin shim does', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-lint-'));
    const shim = join(dir, 'lint.mjs');
    symlinkSync(SCRIPT, shim);
    try {
      const { stdout, status } = runScript(shim, ['--json']);
      expect(status).toBe(1);
      expect(JSON.parse(stdout).summary.byRule['too-long']).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
