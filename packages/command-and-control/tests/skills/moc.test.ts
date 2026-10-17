import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildIndex } from '../../../../scripts/skills/build-index.mjs';
import { buildMocs } from '../../../../scripts/skills/moc.mjs';
import { parseFrontMatter } from '../../../../scripts/skills/lib/frontmatter.mjs';

const SCRIPT = fileURLToPath(new URL('../../../../scripts/skills/moc.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SKILLS_ROOT = fileURLToPath(new URL('../../skills', import.meta.url));

/**
 * A spawned writer boots node and imports the built registry from `dist`, which
 * costs ~0.4s on an idle machine and several times that when CI runs the test
 * files in parallel. Tests that genuinely need a child process (exit codes,
 * stderr) carry an explicit budget instead of the 5s default, which a
 * multi-spawn test can exceed under that contention.
 */
const SPAWN_TIMEOUT_MS = 30_000;

/** The two closed sets the registry declares, plus the sidecar tool. */
const SECTION_IDS = [
  'modules', 'registry', 'transcripts', 'research', 'accessibility', 'snapshots', 'design', 'admin',
];
const INTENT_TOOL_IDS = [
  'ct_setup', 'ct_import', 'ct_inspect', 'ct_analyze', 'ct_plan',
  'ct_build', 'ct_review', 'ct_publish', 'ct_ask',
];
const EXPECTED_MOC_IDS = [...INTENT_TOOL_IDS, 'ct_advanced', ...SECTION_IDS];

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skills-moc-'));
  roots.push(dir);
  return dir;
}

function runMocCli(...args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return { stdout, status: 0 };
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string; status?: number };
    if (failure.stderr) process.stderr.write(failure.stderr);
    return { stdout: failure.stdout ?? '', status: failure.status ?? 1 };
  }
}

/**
 * build-index then moc, called in-process. The writers are exported and their
 * `isMain` guard keeps the CLI out of the way, so the built registry is imported
 * once per test file instead of once per spawned process.
 *
 * The hand-written concept notes are committed, not generated, so they are copied
 * into each temp root: a skills tree is only complete with its concepts, and the
 * MOC generator reads them from the root it is given.
 */
async function buildBoth(root: string): Promise<void> {
  seedConcepts(root);
  await buildIndex({ root });
  await buildMocs({ root });
}

function seedConcepts(root: string): void {
  const source = join(SKILLS_ROOT, 'concepts');
  if (existsSync(source)) cpSync(source, join(root, 'concepts'), { recursive: true });
}

/** The committed concepts, as the generator reads them out of frontmatter. */
function readConcepts(): Array<{ id: string; description: string; related: string[] }> {
  return readdirSync(join(SKILLS_ROOT, 'concepts')).map((name) => {
    const { data } = parseFrontMatter(readFileSync(join(SKILLS_ROOT, 'concepts', name), 'utf8'));
    return {
      id: name.replace(/\.md$/, ''),
      description: String(data?.description ?? ''),
      related: (data?.related as string[] | undefined) ?? [],
    };
  });
}

/** The concept ids a MOC body links, in the order the generator wrote them. */
function conceptIdsIn(body: string): string[] {
  const [, section = ''] = body.split('## Concepts (');
  return [...section.matchAll(/^- \[\[([^\]]+)\]\] — /gm)].map((match) => match[1] as string);
}

function readMocs(root: string): Array<{ id: string; data: Record<string, unknown>; body: string }> {
  return readdirSync(join(root, 'moc')).map((name) => {
    const { data, body } = parseFrontMatter(readFileSync(join(root, 'moc', name), 'utf8'));
    return { id: name.replace(/\.md$/, ''), data: data ?? {}, body };
  });
}

function snapshotMocs(root: string): string[] {
  return readdirSync(join(root, 'moc')).sort().map((name) => readFileSync(join(root, 'moc', name), 'utf8'));
}

/**
 * The generated tree is identical for every test that only inspects it, so it is
 * built once and shared. Tests that write into the tree build their own.
 */
let sharedRoot: string;

beforeAll(async () => {
  sharedRoot = mkdtempSync(join(tmpdir(), 'skills-moc-shared-'));
  await buildBoth(sharedRoot);
});

afterAll(() => {
  rmSync(sharedRoot, { recursive: true, force: true });
});

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('moc', () => {
  it('writes one MOC per section, per intent tool, and for ct_advanced', () => {
    const ids = readdirSync(join(sharedRoot, 'moc')).map((f) => f.replace(/\.md$/, ''));
    expect(ids.sort()).toEqual([...EXPECTED_MOC_IDS].sort());
    expect(ids.length).toBe(18);
  });

  it('places every operation in at least one MOC', () => {
    const opIds = readdirSync(join(sharedRoot, 'ops')).map((f) => f.replace(/\.md$/, ''));
    const linked = new Set(
      readMocs(sharedRoot).flatMap((moc) => [...moc.body.matchAll(/\[\[([a-z0-9_.]+)\]\]/g)].map((m) => m[1])),
    );

    expect(opIds.filter((id) => !linked.has(id))).toEqual([]);
  });

  it('files each operation under its own section MOC', () => {
    const mocs = new Map(readMocs(sharedRoot).map((moc) => [moc.id, moc]));
    for (const name of readdirSync(join(sharedRoot, 'ops'))) {
      const { data } = parseFrontMatter(readFileSync(join(sharedRoot, 'ops', name), 'utf8'));
      const id = String(data?.id);
      const section = String(data?.section);
      expect(mocs.get(section)?.body, `${id} in ${section}`).toContain(`[[${id}]]`);
    }
  });

  it('files intent operations under their intent tool MOC and advanced ones under ct_advanced', () => {
    const mocs = new Map(readMocs(sharedRoot).map((moc) => [moc.id, moc]));
    for (const name of readdirSync(join(sharedRoot, 'ops'))) {
      const { data } = parseFrontMatter(readFileSync(join(sharedRoot, 'ops', name), 'utf8'));
      const id = String(data?.id);
      const expected = data?.exposure === 'intent'
        ? String(data?.intent_tool)
        : data?.exposure === 'advanced' ? 'ct_advanced' : String(data?.section);
      expect(mocs.get(expected)?.body, `${id} should be in ${expected}`).toContain(`[[${id}]]`);
    }
  });

  it('carries the map frontmatter schema and counts its own operations', () => {
    for (const moc of readMocs(sharedRoot)) {
      expect(Object.keys(moc.data), moc.id).toEqual(['id', 'kind', 'description', 'ops', 'related']);
      expect(typeof moc.data.ops, moc.id).toBe('number');
      const [operationsSection] = moc.body.split('\n## Concepts (');
      const listed = [...(operationsSection ?? '').matchAll(/^- \[\[/gm)].length;
      expect(listed, moc.id).toBe(moc.data.ops);
    }
  });

  it('links sections to the tools that reach them and back', () => {
    const mocs = new Map(readMocs(sharedRoot).map((moc) => [moc.id, moc]));
    expect(mocs.get('ct_review')?.data.related).toEqual(['accessibility']);
    expect(String(mocs.get('design')?.data.related)).toContain('ct_build');
    expect(String(mocs.get('design')?.data.related)).toContain('ct_advanced');
  });

  it('lists each concept under exactly the MOCs that own one of its related operations', () => {
    const mocs = readMocs(sharedRoot);

    for (const concept of readConcepts()) {
      const expected = mocs
        .filter((moc) => concept.related.some((id) => moc.body.includes(`[[${id}]]`)))
        .map((moc) => moc.id)
        .sort();
      const actual = mocs
        .filter((moc) => conceptIdsIn(moc.body).includes(concept.id))
        .map((moc) => moc.id)
        .sort();

      expect(actual, `${concept.id} should be listed by exactly these MOCs`).toEqual(expected);
      expect(expected.length, `${concept.id} is listed by no MOC`).toBeGreaterThan(0);
    }
  });

  it('renders a MOC concept line from the concept frontmatter, sorted by id', () => {
    const snapshots = readMocs(sharedRoot).find((moc) => moc.id === 'snapshots');
    const ids = conceptIdsIn(snapshots?.body ?? '');

    expect(ids).toEqual([...ids].sort());
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const concept = readConcepts().find((c) => c.id === id);
      expect(concept, id).toBeDefined();
      expect(snapshots?.body).toContain(`- [[${id}]] — ${concept?.description}`);
    }
  });

  it('omits the concept section from a MOC no concept names', () => {
    const mocs = readMocs(sharedRoot);
    const concepts = readConcepts();
    const unclaimed = mocs.filter((moc) => !concepts.some((concept) =>
      concept.related.some((id) => moc.body.includes(`[[${id}]]`))));

    expect(unclaimed.length).toBeGreaterThan(0);
    for (const moc of unclaimed) expect(moc.body, moc.id).not.toContain('## Concepts');
  });

  it('is idempotent and never rewrites a hand-written MOC body', async () => {
    const root = tempRoot();
    await buildBoth(root);

    const file = join(root, 'moc', 'ct_build.md');
    const withNote = `${readFileSync(file, 'utf8')}\nHand-written map note.\n`;
    writeFileSync(file, withNote);

    const summary = await buildMocs({ root });
    expect(summary.files.changed).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(withNote);
  });

  it('reports changed files in check mode without writing', async () => {
    const root = tempRoot();
    await buildBoth(root);
    expect(readdirSync(join(root, 'moc')).length).toBe(18);
    const before = snapshotMocs(root);

    const current = await buildMocs({ root, check: true });
    expect(current.files).toMatchObject({ created: 0, updated: 0, changed: 0 });
    expect(snapshotMocs(root)).toEqual(before);

    const fresh = tempRoot();
    const wouldWrite = await buildMocs({ root: fresh, check: true });
    expect(wouldWrite.files.created).toBe(18);
    expect(readdirSync(fresh)).toEqual([]);
    expect(snapshotMocs(root)).toEqual(before);
  });
});

describe('moc CLI', () => {
  it('exits 1 in check mode when it would write, and 0 when the tree is current', async () => {
    const fresh = tempRoot();
    const wouldWrite = runMocCli('--root', fresh, '--check');
    expect(wouldWrite.status).toBe(1);
    expect(JSON.parse(wouldWrite.stdout).files.created).toBe(18);
    expect(readdirSync(fresh)).toEqual([]);

    const root = tempRoot();
    await buildBoth(root);
    const current = runMocCli('--root', root, '--check');
    expect(current.status).toBe(0);
    expect(JSON.parse(current.stdout).files).toMatchObject({ created: 0, updated: 0, changed: 0 });
  }, SPAWN_TIMEOUT_MS);
});
