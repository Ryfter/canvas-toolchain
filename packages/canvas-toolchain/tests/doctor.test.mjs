// The `npx canvas-toolchain doctor` CLI, tested at its only seam: spawn the real
// bin and read stdout/stderr/exit code. Hermetic — every run gets a throwaway
// CC_HOME / CANVAS_DESIGN_HOME and (where network is in scope) a fetch stub.
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/canvas-toolchain.mjs', import.meta.url));
const FETCH_STUB_URL = new URL('./fetch-stub.mjs', import.meta.url).href;

const SEEDED_CANVAS_TOKEN = 'SEEDED-CANVAS-TOKEN-do-not-print';
const SEEDED_ANTHROPIC_KEY = 'SEEDED-ANTHROPIC-KEY-do-not-print';
const SEEDED_WAVE_KEY = 'SEEDED-WAVE-KEY-do-not-print';

let home;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ct-doctor-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/**
 * Spawn the bin and collect its output. A watchdog turns the failure mode into a
 * fast, readable assertion: an unimplemented subcommand falls through to the MCP
 * server, which waits for a client that never connects.
 */
function spawnCli(binPath, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [binPath, ...args], { env, cwd: home });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += '\n[test watchdog] the process did not exit';
    }, 15000);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Spawn the package's own bin against the throwaway home. */
function runCli(args, extraEnv = {}) {
  const env = { ...process.env, CC_HOME: join(home, 'cc'), CANVAS_DESIGN_HOME: join(home, 'cds'), ...extraEnv };
  // A real environment may hold a key that would change the report; drop it.
  delete env.ANTHROPIC_API_KEY;
  delete env.CANVAS_BACKUP_COMMAND;
  return spawnCli(BIN, args, env);
}

function writeJson(dir, name, value) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2));
}

describe('doctor --json', () => {
  it('prints exactly one JSON report and exits 0 when the setup only warns', async () => {
    const { code, stdout } = await runCli(['doctor', '--json']);

    assert.equal(code, 0);
    assert.equal(stdout.trim().split('\n').length, 1, 'stdout must be one document and nothing else');

    const report = JSON.parse(stdout);
    assert.ok(Array.isArray(report.checks), 'report.checks is an array');
    assert.equal(typeof report.readyJourneys.canvasConnected, 'boolean');
    assert.equal(report.journey, 'full');
    assert.equal(report.probed, false);
    assert.equal(report.overallStatus, 'warn');
  });

  it('exits 1 when the requested journey fails (Canvas not connected)', async () => {
    const { code, stdout } = await runCli(['doctor', '--json', '--journey=canvas-connected']);

    assert.equal(code, 1);
    const report = JSON.parse(stdout);
    assert.equal(report.journey, 'canvas-connected');
    assert.equal(report.overallStatus, 'fail');
    assert.equal(report.readyJourneys.canvasConnected, false);
  });

  it('exits 1 when the requested journey fails (no LLM provider)', async () => {
    const { code, stdout } = await runCli(['doctor', '--json', '--journey', 'ai-assisted']);

    assert.equal(code, 1);
    const report = JSON.parse(stdout);
    assert.equal(report.journey, 'ai-assisted');
    assert.equal(report.overallStatus, 'fail');
  });

  it('never prints a secret it found on disk', async () => {
    const ccHome = join(home, 'cc');
    writeJson(ccHome, 'canvas-config.json', {
      host: 'example.instructure.com',
      token: SEEDED_CANVAS_TOKEN,
      configuredAt: '2026-01-01T00:00:00.000Z',
    });
    writeJson(ccHome, 'anthropic-config.json', { apiKey: SEEDED_ANTHROPIC_KEY });
    writeJson(join(home, 'cds'), 'institution.json', {
      canvasUrl: 'https://example.instructure.com',
      apiToken: SEEDED_CANVAS_TOKEN,
      waveApiKey: SEEDED_WAVE_KEY,
    });

    const { stdout, stderr } = await runCli(['doctor', '--json']);
    const seen = stdout + stderr;

    for (const secret of [SEEDED_CANVAS_TOKEN, SEEDED_ANTHROPIC_KEY, SEEDED_WAVE_KEY]) {
      assert.ok(!seen.includes(secret), `secret leaked to output: ${secret}`);
    }
  });
});

describe('doctor network probes', () => {
  it('makes no network call by default', async () => {
    const marker = join(home, 'fetch-called');
    writeJson(join(home, 'cc'), 'canvas-config.json', {
      host: 'example.instructure.com',
      token: SEEDED_CANVAS_TOKEN,
    });

    const { code, stdout } = await runCli(['doctor', '--json'], {
      NODE_OPTIONS: `--import=${FETCH_STUB_URL}`,
      NET_STUB_MARKER: marker,
    });

    assert.equal(code, 0);
    assert.equal(JSON.parse(stdout).probed, false);
    assert.ok(!existsSync(marker), 'fetch must not be called without --probe');
  });

  it('probes only when --probe is passed', async () => {
    const marker = join(home, 'fetch-called');
    writeJson(join(home, 'cc'), 'canvas-config.json', {
      host: 'example.instructure.com',
      token: SEEDED_CANVAS_TOKEN,
    });

    const { stdout } = await runCli(['doctor', '--json', '--probe'], {
      NODE_OPTIONS: `--import=${FETCH_STUB_URL}`,
      NET_STUB_MARKER: marker,
    });

    assert.equal(JSON.parse(stdout).probed, true);
    assert.ok(existsSync(marker), 'fetch should have been called with --probe');
  });
});

describe('doctor human output', () => {
  it('prints one line per check with status, id and fix', async () => {
    const json = await runCli(['doctor', '--json']);
    const report = JSON.parse(json.stdout);

    const { code, stdout } = await runCli(['doctor']);
    const checkLines = stdout.split('\n').filter((line) => /^\[(ok|warn|fail)\]/.test(line));

    assert.equal(code, 0);
    assert.equal(checkLines.length, report.checks.length, 'one line per check');
    for (const check of report.checks) {
      assert.ok(stdout.includes(check.id), `human output names check ${check.id}`);
    }
    const withFix = report.checks.find((check) => check.fix);
    assert.ok(withFix, 'the empty home has at least one check with a fix');
    assert.ok(stdout.includes(withFix.fix.tool), 'human output shows the fixing tool');
  });
});

describe('usage', () => {
  it('rejects an unknown flag with exit 2', async () => {
    const { code, stderr } = await runCli(['doctor', '--nope']);
    assert.equal(code, 2);
    assert.match(stderr, /unknown option/);
  });

  it('rejects an unknown journey with exit 2', async () => {
    const { code, stderr } = await runCli(['doctor', '--journey', 'wat']);
    assert.equal(code, 2);
    assert.match(stderr, /unknown journey/);
  });

  it('rejects a missing --journey value with exit 2', async () => {
    const { code, stderr } = await runCli(['doctor', '--journey']);
    assert.equal(code, 2);
    assert.match(stderr, /--journey/);
  });

  it('--help lists the doctor command and exits 0', async () => {
    const { code, stdout } = await runCli(['--help']);
    assert.equal(code, 0);
    assert.match(stdout, /doctor/);
    assert.match(stdout, /--json/);
  });
});

describe('missing build', () => {
  it('exits 2 with an actionable message when the Command & Control build is absent', async () => {
    // A copy of the bin outside the repo has no @canvas-toolchain/* to resolve.
    const bareDir = mkdtempSync(join(tmpdir(), 'ct-doctor-nobuild-'));
    try {
      const bareBin = join(bareDir, 'canvas-toolchain.mjs');
      copyFileSync(BIN, bareBin);

      const result = await spawnCli(bareBin, ['doctor', '--json'], {
        ...process.env,
        CC_HOME: join(home, 'cc'),
        CANVAS_DESIGN_HOME: join(home, 'cds'),
      });

      assert.equal(result.code, 2);
      assert.match(result.stderr, /build (is missing|not found)/i);
      assert.match(result.stderr, /npm install|installer/);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });
});
