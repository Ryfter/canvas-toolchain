import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MigrationJournal } from '@canvas-toolchain/shared-types';
import {
  ALL_APP_HOMES,
  bootAppHomes,
  resetAppHomeBootForTests,
} from '../../src/setup/app_home_boot.js';

// CT200-07: the Windows app-home migration runs at startup. It must never
// throw, never block boot indefinitely, run once per process, and log one
// stderr line with outcomes only (no paths, no secrets, no file contents).

const TOKEN = 'tok-SECRET-boot-7f3a9c-do-not-leak';

const journal = (app: MigrationJournal['app'], extra: Partial<MigrationJournal> = {}): MigrationJournal => ({
  app, at: '2026-10-25T00:00:00.000Z', outcome: 'nothing-to-do',
  copied: 0, identical: 0, conflicts: [], skipped: [], ...extra,
});

let base: string;
let errors: string[];

beforeEach(() => {
  resetAppHomeBootForTests();
  base = realpathSync(mkdtempSync(join(tmpdir(), 'ct-boot-')));
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetAppHomeBootForTests();
  try { chmodSync(join(base, 'home'), 0o700); } catch { /* not created */ }
  rmSync(base, { recursive: true, force: true });
});

describe('bootAppHomes', () => {
  it('runs the migration for each requested app, in order, and returns outcome counts only', async () => {
    const calls: string[] = [];
    const migrate = vi.fn(async (app: MigrationJournal['app']) => {
      calls.push(app);
      return journal(app, app === 'ci'
        ? { outcome: 'migrated', copied: 3, legacyRenamedTo: 'C:\\Users\\Prof\\.curriculum-intelligence.migrated-x' }
        : {});
    });

    const result = await bootAppHomes(ALL_APP_HOMES, { migrate });

    expect(calls).toEqual(['cc', 'cds', 'ci']);
    expect(result.ci).toEqual({ app: 'ci', outcome: 'migrated', copied: 3, identical: 0, conflicts: 0, skipped: 0 });
    expect(result.cc?.outcome).toBe('nothing-to-do');
    // One line, outcomes and counts only; never the renamed path.
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('[app-home] cc=nothing-to-do cds=nothing-to-do ci=migrated(copied=3,identical=0,conflicts=0,skipped=0)');
    expect(errors[0]).not.toContain('Users');
  });

  it('runs once per process: a second call (another server, or the doctor) does not migrate again', async () => {
    const migrate = vi.fn(async (app: MigrationJournal['app']) => journal(app));

    await bootAppHomes(['cc', 'cds', 'ci'], { migrate });
    await bootAppHomes(['cc', 'cds', 'ci'], { migrate });
    await bootAppHomes(['cds'], { migrate });

    expect(migrate).toHaveBeenCalledTimes(3);
    expect(errors).toHaveLength(1);
  });

  it('shares the once-per-process memo with concurrent callers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const migrate = vi.fn(async (app: MigrationJournal['app']) => { await gate; return journal(app); });

    const a = bootAppHomes(['cc'], { migrate });
    const b = bootAppHomes(['cc'], { migrate });
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(ra.cc?.outcome).toBe('nothing-to-do');
    expect(rb.cc?.outcome).toBe('nothing-to-do');
  });

  it('never throws when the migration throws synchronously or rejects', async () => {
    const migrate = vi.fn((app: MigrationJournal['app']) => {
      if (app === 'cc') throw Object.assign(new Error(`boom ${TOKEN}`), { code: 'EACCES' });
      return Promise.reject(new Error(`nope ${TOKEN}`));
    });

    const result = await bootAppHomes(['cc', 'cds'], { migrate: migrate as never });

    expect(result.cc).toMatchObject({ outcome: 'failed', error: 'EACCES' });
    expect(result.cds).toMatchObject({ outcome: 'failed', error: 'UNKNOWN' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain(TOKEN);
    expect(errors[0]).not.toContain('boom');
  });

  it('never blocks boot: a migration that hangs is reported as timed-out and boot continues', async () => {
    const migrate = vi.fn(() => new Promise<MigrationJournal>(() => { /* never settles */ }));

    const result = await bootAppHomes(['cc'], { migrate, timeoutMs: 20 });

    expect(result.cc?.outcome).toBe('timed-out');
    expect(errors[0]).toBe('[app-home] cc=timed-out');
  });

  it('never throws even if logging itself throws', async () => {
    const migrate = vi.fn(async (app: MigrationJournal['app']) => journal(app));
    await expect(bootAppHomes(['cc'], {
      migrate, log: () => { throw new Error('stderr closed'); },
    })).resolves.toBeDefined();
  });

  it('never throws with an unwritable home (real engine, win32 injected)', async () => {
    if (process.getuid?.() === 0) return; // root ignores permission bits
    if (process.platform === 'win32') return; // chmod does not block writes on Windows
    const home = join(base, 'home');
    mkdirSync(join(home, '.command-and-control'), { recursive: true });
    writeFileSync(join(home, '.command-and-control', 'canvas-config.json'), JSON.stringify({ token: TOKEN }));
    chmodSync(home, 0o500); // the new AppData roots cannot be created

    const result = await bootAppHomes(['cc'], { pathEnv: { platform: 'win32', env: {}, homedir: home } });

    expect(['failed', 'partial']).toContain(result.cc?.outcome);
    // Nothing lost: the legacy file is still there, untouched.
    expect(JSON.parse(readFileSync(join(home, '.command-and-control', 'canvas-config.json'), 'utf-8')).token).toBe(TOKEN);
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain(TOKEN);
    expect(errors[0]).not.toContain(base);
  });

  it('migrates a real legacy tree (win32 injected) and logs no secret or path', async () => {
    const home = join(base, 'home');
    mkdirSync(join(home, '.command-and-control'), { recursive: true });
    writeFileSync(join(home, '.command-and-control', 'canvas-config.json'), JSON.stringify({ token: TOKEN }));
    writeFileSync(join(home, '.command-and-control', 'modules.json'), '{"enabled":[]}');

    const result = await bootAppHomes(['cc'], { pathEnv: { platform: 'win32', env: {}, homedir: home } });

    expect(result.cc).toMatchObject({ outcome: 'migrated', copied: 2, conflicts: 0 });
    expect(existsSync(join(home, '.command-and-control'))).toBe(false);
    expect(readdirSync(home).some((n) => n.startsWith('.command-and-control.migrated-'))).toBe(true);
    expect(errors).toEqual(['[app-home] cc=migrated(copied=2,identical=0,conflicts=0,skipped=0)']);
  });

  it('is nothing-to-do on POSIX and under an env override', async () => {
    const result = await bootAppHomes(['cc'], {
      pathEnv: { platform: 'darwin', env: {}, homedir: join(base, 'nohome') },
    });
    expect(result.cc?.outcome).toBe('nothing-to-do');

    resetAppHomeBootForTests();
    const overridden = await bootAppHomes(['cc'], {
      pathEnv: { platform: 'win32', env: { CC_HOME: join(base, 'override') }, homedir: join(base, 'nohome') },
    });
    expect(overridden.cc?.outcome).toBe('nothing-to-do');
  });
});

// "Migration runs before the first config read in each server." The servers'
// entrypoints are not importable without booting, so pin the order in source.
describe('each server boots its app homes before its first config read', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  const src = (p: string) => readFileSync(join(repo, p), 'utf-8');
  const before = (text: string, first: string, second: string) => {
    const a = text.indexOf(first);
    const b = text.indexOf(second);
    expect(a, `${first} present`).toBeGreaterThan(-1);
    expect(b, `${second} present`).toBeGreaterThan(-1);
    expect(a, `${first} before ${second}`).toBeLessThan(b);
  };

  it('Command & Control: awaits bootAppHomes for all three apps before the Canvas store bridge and module load', () => {
    const text = src('packages/command-and-control/src/index.ts');
    before(text, 'await bootAppHomes(ALL_APP_HOMES)', 'bridgeCanvasStoresAtStartup();');
    before(text, 'await bootAppHomes(ALL_APP_HOMES)', 'await loadModules()');
  });

  it('Canvas Design Studio: migrates its home first in main(), before needsBrandSetup', () => {
    const text = src('packages/canvas-design-studio/src/index.ts');
    const main = text.slice(text.indexOf('async function main()'));
    before(main, 'await bootAppHome()', 'needsBrandSetup()');
  });

  it('Curriculum Intelligence: migrates its home before connecting the transport', () => {
    const text = src('packages/curriculum-intelligence/src/index.ts');
    const boot = text.slice(text.indexOf('if (isMainModule())'));
    before(boot, 'await bootAppHome()', 'server.connect(');
  });
});
