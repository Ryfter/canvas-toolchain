import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parseFrontMatter } from '../../../../scripts/skills/lib/frontmatter.mjs';
import { plainOperation } from '../../../../scripts/skills/lib/registry.mjs';

const SCRIPT = fileURLToPath(new URL('../../../../scripts/skills/build-index.mjs', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const OP_FRONTMATTER_KEYS = [
  'id', 'description', 'section', 'intent_tool', 'intent_action', 'exposure', 'related',
];

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skills-index-'));
  roots.push(dir);
  return dir;
}

function runBuild(root: string, ...flags: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--root', root, '--json', ...flags], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err) {
    const failure = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', status: failure.status ?? 1 };
  }
}

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const dir of ['', 'ops']) {
    for (const name of readdirSync(join(root, dir || '.'), { withFileTypes: true })) {
      if (name.isFile()) files[join(dir, name.name)] = readFileSync(join(root, dir, name.name), 'utf8');
    }
  }
  return files;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('build-index', () => {
  it('writes index.md and one op file per operation the registry reports', () => {
    const root = tempRoot();
    const { stdout, status } = runBuild(root);
    const report = JSON.parse(stdout);

    expect(status).toBe(0);
    expect(report.operations).toBeGreaterThanOrEqual(86);

    const opFiles = readdirSync(join(root, 'ops')).filter((f) => f.endsWith('.md'));
    expect(opFiles.length).toBe(report.operations);
    expect(existsSync(join(root, 'index.md'))).toBe(true);
  });

  it('lists exactly the ops it wrote, one line each, in index.md', () => {
    const root = tempRoot();
    runBuild(root);

    const index = readFileSync(join(root, 'index.md'), 'utf8');
    const linked = [...index.matchAll(/^- \[\[([a-z0-9_.]+)\]\] — /gm)].map((m) => m[1]);
    const opFiles = readdirSync(join(root, 'ops')).map((f) => f.replace(/\.md$/, ''));

    expect(new Set(linked)).toEqual(new Set(opFiles));
    expect(linked.length).toBe(opFiles.length);
  });

  it('is idempotent: a second run changes nothing', () => {
    const root = tempRoot();
    runBuild(root);
    const before = snapshot(root);

    const { stdout } = runBuild(root);
    const report = JSON.parse(stdout);

    expect(report.files.changed).toBe(0);
    expect(report.files.unchanged).toBe(report.operations + 1);
    expect(snapshot(root)).toEqual(before);
  });

  it('repairs a stale generated region in place and keeps the hand-written body', () => {
    const root = tempRoot();
    runBuild(root);
    const before = snapshot(root);

    writeFileSync(join(root, 'ops', 'setup_cc.md'), '---\nid: "stale"\n---\n<!-- generated:end -->\n\nMine.\n');
    const { stdout, status } = runBuild(root, '--check');
    expect(status).toBe(1);
    expect(JSON.parse(stdout).files).toMatchObject({ created: 0, updated: 1, changed: 1 });

    expect(runBuild(root).status).toBe(0);
    const after = snapshot(root);

    const untouched = { ...before };
    delete untouched['ops/setup_cc.md'];
    const others = { ...after };
    delete others['ops/setup_cc.md'];
    expect(others).toEqual(untouched);

    const repaired = parseFrontMatter(after['ops/setup_cc.md']);
    const original = parseFrontMatter(before['ops/setup_cc.md']);
    expect(repaired.data).toEqual(original.data);
    expect(repaired.body).toContain('Mine.');
  });

  it('never rewrites the hand-written body of an op file', () => {
    const root = tempRoot();
    runBuild(root);

    const file = join(root, 'ops', 'setup_cc.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nHand-written pitfall.\n`);
    runBuild(root);

    expect(readFileSync(file, 'utf8')).toContain('Hand-written pitfall.');
  });

  it('gives every op file the full frontmatter schema and nothing else', () => {
    const root = tempRoot();
    runBuild(root);

    for (const name of readdirSync(join(root, 'ops'))) {
      const { data } = parseFrontMatter(readFileSync(join(root, 'ops', name), 'utf8'));
      expect(data, name).not.toBeNull();
      expect(Object.keys(data ?? {}), name).toEqual(OP_FRONTMATTER_KEYS);
      expect(data?.id, name).toBe(name.replace(/\.md$/, ''));
      expect(String(data?.description ?? '').length, name).toBeGreaterThan(0);
      expect(Array.isArray(data?.related), name).toBe(true);
      expect(data?.related, name).not.toContain(data?.id);
    }
  });

  it('seeds related from the shared intent tool', () => {
    const root = tempRoot();
    runBuild(root);

    const { data } = parseFrontMatter(readFileSync(join(root, 'ops', 'validate_quiz.md'), 'utf8'));
    expect(data?.intent_tool).toBe('ct_review');
    expect(data?.related).toContain('review_canvas_rubric');
    expect((data?.related as string[]).length).toBeLessThanOrEqual(8);
  });

  it('fails loudly when the built registry is missing', () => {
    const root = tempRoot();
    const { status, stderr } = runBuild(root, '--repo-root', join(root, 'not-a-repo'));
    expect(status).toBe(1);
    expect(stderr).toContain('run "npm run build" first');
  });
});

describe('plainOperation', () => {
  it('keeps only the allow-listed fields, so no schema text can reach a generated file', () => {
    const plain = plainOperation({
      id: 'x',
      section: 'admin',
      description: 'Does a thing.',
      taskCategory: 'none',
      exposure: 'advanced',
      inputSchema: { type: 'object', properties: { canvasToken: { type: 'string' } } },
      handler: () => 'side effect',
    });

    expect(Object.keys(plain)).toEqual([
      'id', 'section', 'description', 'taskCategory', 'exposure',
    ]);
    expect(JSON.stringify(plain)).not.toContain('canvasToken');
  });

  it('keeps the intent tool pair when present', () => {
    const plain = plainOperation({
      id: 'x', section: 'design', description: 'd', exposure: 'intent',
      intentTool: 'ct_build', intentAction: 'quiz',
    });
    expect(plain).toMatchObject({ intentTool: 'ct_build', intentAction: 'quiz' });
  });
});
