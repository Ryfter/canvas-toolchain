/**
 * CT200-03: Windows app-home migration engine.
 *
 * Every case injects `platform: 'win32'` and a temp dir as the fake home, so
 * the suite runs on any OS and never touches the real home directory.
 * `env: {}` is always passed so the real APPDATA / CC_HOME are never read.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import {
  legacyEntryRoot,
  migrateLegacyAppHome,
  MIGRATION_JOURNAL_FILE,
  type MigrationOptions,
  type MigrationRoot,
} from '../src/app-home-migration.js';
import { appPaths } from '../src/app-paths.js';

const TOKEN = 'tok-SECRET-7f3a9c-do-not-leak';
const API_KEY = 'sk-ant-SECRET-key-41b2';
const FIXED = new Date(2026, 9, 20, 14, 22, 33); // local 2026-10-20 14:22:33
const STAMP = '20261020-142233';

let base: string;
let home: string;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'ct-migrate-')));
  home = join(base, 'home');
  mkdirSync(home, { recursive: true });
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

const win = (extra: Partial<MigrationOptions> = {}): MigrationOptions => ({
  platform: 'win32', env: {}, homedir: home, now: () => FIXED, ...extra,
});

/** Host-flavoured absolute paths for the three new roots (APPDATA fallback under the fake home). */
function roots(sub = 'CommandAndControl') {
  const config = join(home, 'AppData', 'Roaming', 'CanvasToolchain', sub);
  const data = join(home, 'AppData', 'Local', 'CanvasToolchain', sub);
  return { config, data, secrets: join(data, 'secrets') };
}
const legacyCc = () => join(home, '.command-and-control');
const norm = (p: string) => p.replaceAll('\\', '/');
/** The effective C&C config home per the resolver's upgrade-window rule. The
 *  existence probes are fed from the host filesystem, because the resolver's own
 *  probe cannot see win32-flavoured paths when the suite runs on POSIX. */
const resolvedConfig = () => appPaths('cc', {
  platform: 'win32', env: {}, homedir: home,
  legacyExists: existsSync(legacyCc()), newExists: existsSync(roots().config),
}).config;

function put(file: string, content: string | Buffer): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

/** A representative legacy C&C tree: config, secrets, data and an unknown name. */
function seedLegacyCc(): Record<string, string> {
  const L = legacyCc();
  const files: Record<string, string> = {
    'canvas-config.json': JSON.stringify({ host: 'school.instructure.com', token: TOKEN }),
    'anthropic-config.json': JSON.stringify({ apiKey: API_KEY }),
    'lecture-answers-config.json': JSON.stringify({ provider: 'voyage', voyageApiKey: 'pa-secret' }),
    'roster-vault/vault.json': JSON.stringify({ students: [{ pseudonym: 'SU26-001' }] }),
    'modules.json': JSON.stringify({ enabled: ['video'] }),
    'groups/c1/pairing-history.json': '{"pairs":[]}',
    'institution-profile.md': '# profile\n',
    'unknown-thing.txt': 'who knows\n',
    'modules/announcements/1.1.0/announcements-1.1.0.mjs': 'export default {};\n',
    'cache/blob.bin': '\u0000\u0001\u0002binaryÿ',
    'module-catalog-cache.json': '{"modules":[]}',
  };
  for (const [rel, content] of Object.entries(files)) put(join(L, rel), content);
  return files;
}

/** Expected new location of each seeded file. */
function expectedTarget(rel: string): string {
  const r = roots();
  const top = rel.split('/')[0];
  const root = legacyEntryRoot('cc', top);
  return join(r[root], ...rel.split('/'));
}

/** Every path under base, relative, sorted — a cheap whole-tree snapshot. */
function tree(dir = base): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      out.push(relative(base, p) + (e.isDirectory() ? sep : ''));
      if (e.isDirectory() && !e.isSymbolicLink()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}
const leftovers = () => tree().filter((p) => /\.staging-|\.tmp-/.test(p));

describe('legacyEntryRoot (classification)', () => {
  it('routes C&C names to config / data / secrets, unknown to config', () => {
    expect(legacyEntryRoot('cc', 'canvas-config.json')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'anthropic-config.json')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'panopto-config.json')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'config.json')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'roster-vault')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'lecture-answers-config.json')).toBe('secrets'); // voyageApiKey (CT200-04d)
    expect(legacyEntryRoot('cc', 'module-credentials')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'modules')).toBe('data');
    expect(legacyEntryRoot('cc', 'registry')).toBe('data');
    expect(legacyEntryRoot('cc', 'publish-snapshots')).toBe('data');
    expect(legacyEntryRoot('cc', 'cache')).toBe('data');
    expect(legacyEntryRoot('cc', 'modules.json')).toBe('config');
    expect(legacyEntryRoot('cc', 'groups')).toBe('config');
    expect(legacyEntryRoot('cc', 'something-new')).toBe('config');
  });
  it('keeps stray temp/backup copies of secret files with the secrets', () => {
    expect(legacyEntryRoot('cc', 'canvas-config.json.tmp')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'CANVAS-CONFIG.JSON')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'lecture-answers-config.json.tmp')).toBe('secrets');
    expect(legacyEntryRoot('cc', 'lecture-answers-config.json.bak')).toBe('secrets');
  });
  it('routes CDS and CI names', () => {
    expect(legacyEntryRoot('cds', 'institution.json')).toBe('secrets');
    expect(legacyEntryRoot('cds', 'kb')).toBe('data');
    expect(legacyEntryRoot('cds', 'transcripts')).toBe('data');
    expect(legacyEntryRoot('cds', 'student-personas.md')).toBe('config');
    expect(legacyEntryRoot('ci', 'courses')).toBe('data');
    expect(legacyEntryRoot('ci', 'panopto')).toBe('data');
    expect(legacyEntryRoot('ci', 'config.json')).toBe('config');
  });
});

describe('migrateLegacyAppHome: no-op cases', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    it(`${platform} is a no-op returning nothing-to-do`, async () => {
      seedLegacyCc();
      const before = tree();
      const r = await migrateLegacyAppHome('cc', win({ platform }));
      expect(r.outcome).toBe('nothing-to-do');
      expect(tree()).toEqual(before);
    });
  }

  it('an env override means nothing-to-do on win32', async () => {
    seedLegacyCc();
    const before = tree();
    const r = await migrateLegacyAppHome('cc', win({ env: { CC_HOME: join(base, 'override') } }));
    expect(r.outcome).toBe('nothing-to-do');
    expect(tree()).toEqual(before);
  });

  it('no legacy folder means nothing-to-do and creates nothing', async () => {
    const before = tree();
    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('nothing-to-do');
    expect(tree()).toEqual(before);
  });
});

describe('migrateLegacyAppHome: copy once', () => {
  it('copies every file to its root, verifies, renames legacy, journals', async () => {
    const files = seedLegacyCc();
    const r = await migrateLegacyAppHome('cc', win());

    expect(r.outcome).toBe('migrated');
    expect(r.copied).toBe(Object.keys(files).length);
    expect(r.identical).toBe(0);
    expect(r.conflicts).toEqual([]);
    for (const [rel, content] of Object.entries(files)) {
      expect(readFileSync(expectedTarget(rel), 'utf8')).toBe(content);
    }
    // Secrets land in the local (non-roaming) secrets root, not in config.
    expect(existsSync(join(roots().secrets, 'canvas-config.json'))).toBe(true);
    expect(existsSync(join(roots().config, 'canvas-config.json'))).toBe(false);
    expect(existsSync(join(roots().secrets, 'lecture-answers-config.json'))).toBe(true);
    expect(existsSync(join(roots().config, 'lecture-answers-config.json'))).toBe(false);
    expect(existsSync(join(roots().data, 'modules', 'announcements', '1.1.0', 'announcements-1.1.0.mjs'))).toBe(true);

    // Legacy renamed, never deleted, contents intact.
    const renamed = `${legacyCc()}.migrated-${STAMP}`;
    expect(r.legacyRenamedTo).toBe(renamed);
    expect(existsSync(legacyCc())).toBe(false);
    expect(readFileSync(join(renamed, 'canvas-config.json'), 'utf8')).toBe(files['canvas-config.json']);

    // Journal in the config home.
    const journal = JSON.parse(readFileSync(join(roots().config, MIGRATION_JOURNAL_FILE), 'utf8'));
    expect(journal).toMatchObject({ app: 'cc', outcome: 'migrated', copied: r.copied, conflicts: [] });

    // The resolver (real filesystem probe) now points at the new homes.
    expect(norm(resolvedConfig())).toBe(norm(roots().config));

    expect(leftovers()).toEqual([]);
  });

  it('honours APPDATA / LOCALAPPDATA when set', async () => {
    put(join(legacyCc(), 'modules.json'), '{}');
    put(join(legacyCc(), 'canvas-config.json'), '{"token":"x"}');
    const env = { APPDATA: join(base, 'Roam'), LOCALAPPDATA: join(base, 'Loc') };
    const r = await migrateLegacyAppHome('cc', win({ env }));
    expect(r.outcome).toBe('migrated');
    expect(existsSync(join(base, 'Roam', 'CanvasToolchain', 'CommandAndControl', 'modules.json'))).toBe(true);
    expect(existsSync(join(base, 'Loc', 'CanvasToolchain', 'CommandAndControl', 'secrets', 'canvas-config.json'))).toBe(true);
  });

  it('migrates CDS and CI homes with their own classification', async () => {
    put(join(home, '.canvas-design-mcp', 'institution.json'), '{"token":"t"}');
    put(join(home, '.canvas-design-mcp', 'kb', 'a.md'), 'kb');
    put(join(home, '.canvas-design-mcp', 'student-personas.md'), 'p');
    put(join(home, '.curriculum-intelligence', 'config.json'), '{"version":1}');
    put(join(home, '.curriculum-intelligence', 'courses', 'c1', 'x.json'), '{}');

    expect((await migrateLegacyAppHome('cds', win())).outcome).toBe('migrated');
    expect((await migrateLegacyAppHome('ci', win())).outcome).toBe('migrated');

    const cds = roots('CanvasDesignStudio');
    expect(existsSync(join(cds.secrets, 'institution.json'))).toBe(true);
    expect(existsSync(join(cds.data, 'kb', 'a.md'))).toBe(true);
    expect(existsSync(join(cds.config, 'student-personas.md'))).toBe(true);
    const ci = roots('CurriculumIntelligence');
    expect(existsSync(join(ci.config, 'config.json'))).toBe(true);
    expect(existsSync(join(ci.data, 'courses', 'c1', 'x.json'))).toBe(true);
  });
});

describe('migrateLegacyAppHome: re-run', () => {
  it('a second run is a no-op', async () => {
    seedLegacyCc();
    await migrateLegacyAppHome('cc', win());
    const before = tree();
    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('nothing-to-do');
    expect(tree()).toEqual(before);
  });

  it('legacy restored next to an identical new home: identical skips, collision-safe rename', async () => {
    const files = seedLegacyCc();
    await migrateLegacyAppHome('cc', win());
    // Professor restores the legacy folder by copying it back (same second → name collision).
    for (const [rel, content] of Object.entries(files)) put(join(legacyCc(), rel), content);

    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('migrated');
    expect(r.copied).toBe(0);
    expect(r.identical).toBe(Object.keys(files).length);
    expect(r.legacyRenamedTo).toBe(`${legacyCc()}.migrated-${STAMP}-2`);
    // The first renamed folder is untouched.
    expect(existsSync(join(`${legacyCc()}.migrated-${STAMP}`, 'canvas-config.json'))).toBe(true);
  });
});

describe('migrateLegacyAppHome: conflicts', () => {
  it('existing target that differs: both untouched, reported, legacy not renamed', async () => {
    seedLegacyCc();
    const r0 = roots();
    put(join(r0.config, 'modules.json'), '{"enabled":["roster"]}'); // new home exists, differs
    put(join(r0.secrets, 'canvas-config.json'), '{"token":"NEWER"}');

    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('partial');
    expect([...r.conflicts].sort()).toEqual(['canvas-config.json', 'modules.json']);
    expect(r.legacyRenamedTo).toBeUndefined();
    expect(readFileSync(join(r0.config, 'modules.json'), 'utf8')).toBe('{"enabled":["roster"]}');
    expect(readFileSync(join(r0.secrets, 'canvas-config.json'), 'utf8')).toBe('{"token":"NEWER"}');
    expect(readFileSync(join(legacyCc(), 'modules.json'), 'utf8')).toBe('{"enabled":["video"]}');
    expect(readFileSync(join(legacyCc(), 'canvas-config.json'), 'utf8')).toContain(TOKEN);
    // Non-conflicting files still made progress.
    expect(existsSync(join(r0.secrets, 'anthropic-config.json'))).toBe(true);

    // Re-run: only the unresolved conflicts remain; nothing new copied.
    const again = await migrateLegacyAppHome('cc', win());
    expect(again.outcome).toBe('partial');
    expect(again.copied).toBe(0);
    expect([...again.conflicts].sort()).toEqual(['canvas-config.json', 'modules.json']);
    expect(existsSync(legacyCc())).toBe(true);
  });

  it('fresh config home but a differing leftover in the secrets root: config is NOT committed', async () => {
    seedLegacyCc();
    put(join(roots().secrets, 'canvas-config.json'), '{"token":"STALE"}');

    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('partial');
    expect(r.conflicts).toEqual(['canvas-config.json']);
    // The commit point never flipped: legacy stays authoritative.
    expect(existsSync(roots().config)).toBe(false);
    expect(existsSync(legacyCc())).toBe(true);
    expect(norm(resolvedConfig())).toBe(norm(legacyCc()));
    expect(leftovers()).toEqual([]);
  });
});

describe('migrateLegacyAppHome: links', () => {
  it('symlinks are skipped, never followed', async (ctx) => {
    seedLegacyCc();
    const outside = join(base, 'outside');
    put(join(outside, 'private.txt'), 'outside the tree');
    try {
      symlinkSync(join(outside, 'private.txt'), join(legacyCc(), 'link-file.txt'), 'file');
      symlinkSync(outside, join(legacyCc(), 'link-dir'), 'junction');
    } catch {
      ctx.skip(); // no symlink privilege (Windows without developer mode)
    }
    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('migrated');
    expect(r.skipped).toEqual(expect.arrayContaining([
      { path: 'link-file.txt', reason: 'link' },
      { path: 'link-dir', reason: 'link' },
    ]));
    expect(existsSync(join(roots().config, 'link-file.txt'))).toBe(false);
    expect(existsSync(join(roots().config, 'link-dir'))).toBe(false);
    expect(tree().some((p) => p.endsWith('private.txt') && !p.startsWith('outside'))).toBe(false);
  });

  it('a legacy folder that is itself a link is not migrated', async (ctx) => {
    const real = join(base, 'real-home');
    put(join(real, 'canvas-config.json'), '{"token":"x"}');
    try {
      symlinkSync(real, legacyCc(), 'junction');
    } catch {
      ctx.skip();
    }
    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('partial');
    expect(r.skipped).toEqual([{ path: '.', reason: 'link' }]);
    expect(existsSync(roots().config)).toBe(false);
  });
});

describe('migrateLegacyAppHome: interrupted runs', () => {
  it('orphan .staging-* folders are removed and the migration completes', async () => {
    const files = seedLegacyCc();
    const r0 = roots();
    // Left behind by a crashed run (dead/unparseable pid).
    put(join(`${r0.config}.staging-deadbeef`, 'modules.json'), 'half-written');
    put(join(`${r0.data}.staging-99999999-abcd`, 'cache', 'x'), 'junk');
    put(join(`${r0.data}.staging-99999999-abcd.secrets`, 'canvas-config.json'), 'junk');

    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('migrated');
    for (const [rel, content] of Object.entries(files)) {
      expect(readFileSync(expectedTarget(rel), 'utf8')).toBe(content);
    }
    expect(leftovers()).toEqual([]);
  });

  it('orphan .tmp-* files in an existing home are removed and the migration completes', async () => {
    const files = seedLegacyCc();
    const r0 = roots();
    put(join(r0.config, 'modules.json.tmp-deadbeef'), 'partial copy');
    put(join(r0.secrets, 'canvas-config.json.tmp-99999999-ab'), 'partial copy');

    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('migrated');
    expect(readFileSync(join(r0.config, 'modules.json'), 'utf8')).toBe(files['modules.json']);
    expect(readFileSync(join(r0.secrets, 'canvas-config.json'), 'utf8')).toBe(files['canvas-config.json']);
    expect(leftovers()).toEqual([]);
  });

  it('a crash just before the config commit leaves legacy authoritative; the next run completes', async () => {
    const files = seedLegacyCc();
    const crashed = await migrateLegacyAppHome('cc', win({
      onBeforeCommit: (root) => { if (root === 'config') throw new Error('simulated crash'); },
    }));
    expect(crashed.outcome).toBe('failed');
    expect(existsSync(roots().config)).toBe(false);
    expect(existsSync(legacyCc())).toBe(true);
    expect(norm(resolvedConfig())).toBe(norm(legacyCc()));

    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('migrated');
    for (const [rel, content] of Object.entries(files)) {
      expect(readFileSync(expectedTarget(rel), 'utf8')).toBe(content);
    }
    expect(leftovers()).toEqual([]);
  });
});

describe('migrateLegacyAppHome: staged switch', () => {
  it('commits data, then secrets, then the config home LAST', async () => {
    seedLegacyCc();
    const order: MigrationRoot[] = [];
    const seenAtConfigCommit: Record<string, boolean> = {};
    const r = await migrateLegacyAppHome('cc', win({
      onBeforeCommit: (root) => {
        order.push(root);
        if (root === 'config') {
          const r0 = roots();
          seenAtConfigCommit.data = existsSync(join(r0.data, 'cache', 'blob.bin'));
          seenAtConfigCommit.secrets = existsSync(join(r0.secrets, 'canvas-config.json'));
          seenAtConfigCommit.config = existsSync(r0.config);
        }
      },
    }));
    expect(r.outcome).toBe('migrated');
    expect(order).toEqual(['data', 'secrets', 'config']);
    expect(seenAtConfigCommit).toEqual({ data: true, secrets: true, config: false });
  });
});

describe('migrateLegacyAppHome: concurrency', () => {
  it('concurrent runs are safe: one rename, every file intact, no leftovers', async () => {
    const files = seedLegacyCc();
    const results = await Promise.all([
      migrateLegacyAppHome('cc', win()),
      migrateLegacyAppHome('cc', win()),
      migrateLegacyAppHome('cc', win()),
    ]);
    expect(results.filter((r) => r.outcome === 'failed')).toEqual([]);
    expect(
      results.filter((r) => r.legacyRenamedTo),
      `renamed-to per run: ${JSON.stringify(results.map((r) => r.legacyRenamedTo))}`,
    ).toHaveLength(1);
    expect(results.every((r) => r.conflicts.length === 0)).toBe(true);
    for (const [rel, content] of Object.entries(files)) {
      expect(readFileSync(expectedTarget(rel), 'utf8')).toBe(content);
    }
    const migrated = readdirSync(home).filter((n) => n.startsWith('.command-and-control.migrated-'));
    expect(migrated).toHaveLength(1);
    // A losing racer must not overwrite the winner's journal.
    const journal = JSON.parse(readFileSync(join(roots().config, MIGRATION_JOURNAL_FILE), 'utf8'));
    expect(journal.outcome).toBe('migrated');
    expect(existsSync(legacyCc())).toBe(false);
    expect(leftovers()).toEqual([]);
  });

  it('concurrent runs into an existing home are safe too', async () => {
    const files = seedLegacyCc();
    mkdirSync(roots().config, { recursive: true });
    const results = await Promise.all([
      migrateLegacyAppHome('cc', win()),
      migrateLegacyAppHome('cc', win()),
    ]);
    expect(results.filter((r) => r.outcome === 'failed')).toEqual([]);
    expect(results.filter((r) => r.legacyRenamedTo)).toHaveLength(1);
    for (const [rel, content] of Object.entries(files)) {
      expect(readFileSync(expectedTarget(rel), 'utf8')).toBe(content);
    }
    expect(JSON.parse(readFileSync(join(roots().config, MIGRATION_JOURNAL_FILE), 'utf8')).outcome).toBe('migrated');
    expect(leftovers()).toEqual([]);
  });
});

describe('migrateLegacyAppHome: journal and failures', () => {
  it('the journal and the result never contain secret values', async () => {
    seedLegacyCc();
    put(join(roots().secrets, 'canvas-config.json'), JSON.stringify({ token: 'NEWER-SECRET-zz9' }));
    mkdirSync(roots().config, { recursive: true });
    const r = await migrateLegacyAppHome('cc', win());
    expect(r.outcome).toBe('partial');
    const journalText = readFileSync(join(roots().config, MIGRATION_JOURNAL_FILE), 'utf8');
    for (const text of [journalText, JSON.stringify(r)]) {
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain('NEWER-SECRET-zz9');
      expect(text).not.toContain('school.instructure.com');
      expect(text).not.toMatch(/[0-9a-f]{40,}/); // no content hashes either
    }
    expect(JSON.parse(journalText).conflicts).toEqual(['canvas-config.json']);
  });

  it('an unwritable home returns failed and never throws; legacy untouched; nothing created', async () => {
    seedLegacyCc();
    put(join(base, 'a-file'), 'not a directory');
    const env = { APPDATA: join(base, 'a-file', 'Roaming'), LOCALAPPDATA: join(base, 'a-file', 'Local') };
    const before = tree();
    const r = await migrateLegacyAppHome('cc', win({ env }));
    expect(r.outcome).toBe('failed');
    expect(typeof r.error).toBe('string');
    expect(existsSync(legacyCc())).toBe(true);
    expect(tree()).toEqual(before);
  });

  it('never throws, even on nonsense input', async () => {
    const r = await migrateLegacyAppHome('nope' as never, win());
    expect(['failed', 'nothing-to-do']).toContain(r.outcome);
  });
});
