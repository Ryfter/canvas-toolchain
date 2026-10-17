import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parseFrontMatter } from '../../../../scripts/skills/lib/frontmatter.mjs';

const SCRIPT = fileURLToPath(new URL('../../../../scripts/skills/moc.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

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

function runCli(script: string, ...args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args, '--json'], {
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

function buildBoth(root: string): void {
  runCli(fileURLToPath(new URL('../../../../scripts/skills/build-index.mjs', import.meta.url)), '--root', root);
  runCli(SCRIPT, '--root', root);
}

function readMocs(root: string): Array<{ id: string; data: Record<string, unknown>; body: string }> {
  return readdirSync(join(root, 'moc')).map((name) => {
    const { data, body } = parseFrontMatter(readFileSync(join(root, 'moc', name), 'utf8'));
    return { id: name.replace(/\.md$/, ''), data: data ?? {}, body };
  });
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('moc', () => {
  it('writes one MOC per section, per intent tool, and for ct_advanced', () => {
    const root = tempRoot();
    buildBoth(root);

    const ids = readdirSync(join(root, 'moc')).map((f) => f.replace(/\.md$/, ''));
    expect(ids.sort()).toEqual([...EXPECTED_MOC_IDS].sort());
    expect(ids.length).toBe(18);
  });

  it('places every operation in at least one MOC', () => {
    const root = tempRoot();
    buildBoth(root);

    const opIds = readdirSync(join(root, 'ops')).map((f) => f.replace(/\.md$/, ''));
    const linked = new Set(
      readMocs(root).flatMap((moc) => [...moc.body.matchAll(/\[\[([a-z0-9_.]+)\]\]/g)].map((m) => m[1])),
    );

    expect(opIds.filter((id) => !linked.has(id))).toEqual([]);
  });

  it('files each operation under its own section MOC', () => {
    const root = tempRoot();
    buildBoth(root);

    const mocs = new Map(readMocs(root).map((moc) => [moc.id, moc]));
    for (const name of readdirSync(join(root, 'ops'))) {
      const { data } = parseFrontMatter(readFileSync(join(root, 'ops', name), 'utf8'));
      const id = String(data?.id);
      const section = String(data?.section);
      expect(mocs.get(section)?.body, `${id} in ${section}`).toContain(`[[${id}]]`);
    }
  });

  it('files intent operations under their intent tool MOC and advanced ones under ct_advanced', () => {
    const root = tempRoot();
    buildBoth(root);

    const mocs = new Map(readMocs(root).map((moc) => [moc.id, moc]));
    for (const name of readdirSync(join(root, 'ops'))) {
      const { data } = parseFrontMatter(readFileSync(join(root, 'ops', name), 'utf8'));
      const id = String(data?.id);
      const expected = data?.exposure === 'intent'
        ? String(data?.intent_tool)
        : data?.exposure === 'advanced' ? 'ct_advanced' : String(data?.section);
      expect(mocs.get(expected)?.body, `${id} should be in ${expected}`).toContain(`[[${id}]]`);
    }
  });

  it('carries the map frontmatter schema and counts its own operations', () => {
    const root = tempRoot();
    buildBoth(root);

    for (const moc of readMocs(root)) {
      expect(Object.keys(moc.data), moc.id).toEqual(['id', 'kind', 'description', 'ops', 'related']);
      expect(typeof moc.data.ops, moc.id).toBe('number');
      const listed = [...moc.body.matchAll(/^- \[\[/gm)].length;
      expect(listed, moc.id).toBe(moc.data.ops);
    }
  });

  it('links sections to the tools that reach them and back', () => {
    const root = tempRoot();
    buildBoth(root);

    const mocs = new Map(readMocs(root).map((moc) => [moc.id, moc]));
    expect(mocs.get('ct_review')?.data.related).toEqual(['accessibility']);
    expect(String(mocs.get('design')?.data.related)).toContain('ct_build');
    expect(String(mocs.get('design')?.data.related)).toContain('ct_advanced');
  });

  it('is idempotent and never rewrites a hand-written MOC body', () => {
    const root = tempRoot();
    buildBoth(root);

    const file = join(root, 'moc', 'ct_build.md');
    const withNote = `${readFileSync(file, 'utf8')}\nHand-written map note.\n`;
    writeFileSync(file, withNote);

    const { stdout, status } = runCli(SCRIPT, '--root', root);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).files.changed).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(withNote);
  });

  it('reports changed files in check mode without writing', () => {
    const root = tempRoot();
    buildBoth(root);
    expect(readdirSync(join(root, 'moc')).length).toBe(18);
    const before = readdirSync(join(root, 'moc')).map((f) => readFileSync(join(root, 'moc', f), 'utf8'));

    const { status, stdout } = runCli(SCRIPT, '--root', root, '--check');
    expect(status).toBe(0);
    expect(JSON.parse(stdout).files).toMatchObject({ created: 0, updated: 0, changed: 0 });

    const fresh = tempRoot();
    const changed = runCli(SCRIPT, '--root', fresh, '--check');
    expect(changed.status).toBe(1);
    expect(JSON.parse(changed.stdout).files.created).toBe(18);
    expect(readdirSync(fresh)).toEqual([]);
    expect(readdirSync(join(root, 'moc')).map((f) => readFileSync(join(root, 'moc', f), 'utf8'))).toEqual(before);
  });
});
