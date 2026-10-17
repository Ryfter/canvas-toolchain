import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { capIndexDescriptions } from '../../../../scripts/skills/eval-baseline.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./selection.fixtures.json', import.meta.url));
const HARNESS = join(REPO_ROOT, 'scripts/skills/eval-baseline.mjs');
const SKILLS = join(REPO_ROOT, 'packages/command-and-control/skills');
const HAS_DIST = existsSync(join(REPO_ROOT, 'packages/command-and-control/dist/surface/registry.js'));

const selection = JSON.parse(readFileSync(FIXTURES, 'utf8')) as {
  fixtures: Array<{ ask: string; expectedOp: string; alsoAcceptable?: string[]; why: string }>;
};

const opIds = new Set(readdirSync(join(SKILLS, 'ops')).map((f) => f.replace(/\.md$/, '')));

const roots: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skills-eval-'));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('capIndexDescriptions', () => {
  const line = (description: string) => `- [[some_op]] — ${description}`;

  it('caps a long line at the limit and keeps the wikilink intact', () => {
    const capped = capIndexDescriptions(line('x'.repeat(300)), 140);
    expect(capped.startsWith('- [[some_op]] — ')).toBe(true);
    expect(capped.length).toBeLessThanOrEqual(140 + '- [[some_op]] — '.length);
    expect(capped.endsWith('...')).toBe(true);
  });

  it('leaves a short line, a heading, and a body line untouched', () => {
    const text = ['## admin — Section', '', line('short'), 'prose that is not an index line'].join('\n');
    expect(capIndexDescriptions(text, 140)).toBe(text);
  });

  it('only rewrites index lines', () => {
    const text = [`- [[a]] — ${'y'.repeat(300)}`, `- not a wikilink — ${'y'.repeat(300)}`].join('\n');
    const [first, second] = capIndexDescriptions(text, 140).split('\n');
    expect(first.endsWith('...')).toBe(true);
    expect(second).toBe(`- not a wikilink — ${'y'.repeat(300)}`);
  });
});

describe('selection fixtures', () => {
  it('holds the 18 asks from the plan', () => {
    expect(selection.fixtures).toHaveLength(18);
  });

  it('names an expected op that actually exists', () => {
    for (const fixture of selection.fixtures) {
      expect(opIds, fixture.ask).toContain(fixture.expectedOp);
    }
  });

  it('names only real alternatives', () => {
    for (const fixture of selection.fixtures) {
      for (const alternative of fixture.alsoAcceptable ?? []) {
        expect(opIds, `${fixture.ask} -> ${alternative}`).toContain(alternative);
      }
    }
  });

  it('keeps the expected op out of its own alternatives and the asks distinct', () => {
    const asks = new Set<string>();
    for (const fixture of selection.fixtures) {
      expect(fixture.alsoAcceptable ?? []).not.toContain(fixture.expectedOp);
      expect(asks.has(fixture.ask), fixture.ask).toBe(false);
      asks.add(fixture.ask);
      expect(fixture.why.length).toBeGreaterThan(20);
    }
  });
});

describe.skipIf(!HAS_DIST)('eval-baseline harness', () => {
  it('prints the expected op and the files the new path reads, per ask', () => {
    const { stdout } = (() => {
      const out = execFileSync(process.execPath, [HARNESS, '--json'], { cwd: REPO_ROOT, encoding: 'utf8' });
      return { stdout: out };
    })();
    const report = JSON.parse(stdout);

    expect(report.fixtures).toHaveLength(18);
    for (const entry of report.fixtures) {
      expect(entry.expectedOp).toMatch(/^[a-z0-9_.]+$/);
      expect(entry.newPathFiles).toEqual(['index.md', `ops/${entry.expectedOp}.md`]);
      expect(entry.newPathTokens).toBeGreaterThan(0);
    }
    expect(report.tokens.newPath.average).toBeGreaterThan(0);
    expect(report.tokens.oldSurface.toolsList).toBeGreaterThan(0);
  });

  it('writes the baseline document where asked', () => {
    const out = join(tempRoot(), 'baseline.md');
    execFileSync(process.execPath, [HARNESS, '--out', out], { cwd: REPO_ROOT, encoding: 'utf8' });
    const doc = readFileSync(out, 'utf8');

    expect(doc).toContain('# Token baseline');
    expect(doc).toContain('chars/4');
    for (const fixture of selection.fixtures) expect(doc).toContain(fixture.expectedOp);
  });
});
