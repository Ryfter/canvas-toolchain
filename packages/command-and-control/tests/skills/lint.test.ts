import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LINT_OPTIONS, lintSkills, normalizeDescription, trigramSimilarity } from '../../../../scripts/skills/lib/lint-rules.mjs';
import { curatedRelatedFrom } from '../../../../scripts/skills/lib/related.mjs';
import { readSkillsTree } from '../../../../scripts/skills/lib/tree.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/lint', import.meta.url));
const RELATED_FIXTURES = fileURLToPath(new URL('./fixtures/related', import.meta.url));

function fixture(name: string): { tree: ReturnType<typeof readSkillsTree>; operations: unknown[] } {
  const root = join(FIXTURES, name);
  return {
    tree: readSkillsTree(root),
    operations: JSON.parse(readFileSync(join(root, 'registry.json'), 'utf8')),
  };
}

function rulesFor(name: string, options = {}): string[] {
  const { tree, operations } = fixture(name);
  return [...new Set(lintSkills(tree, operations, options).map((v: { rule: string }) => v.rule))].sort();
}

describe('lintSkills against one fixture per rule', () => {
  it('reports nothing for a clean tree', () => {
    expect(rulesFor('clean')).toEqual([]);
  });

  it('reports missing-description', () => {
    expect(rulesFor('missing-description')).toEqual(['missing-description']);
  });

  it('reports too-long only above the configured limit', () => {
    expect(rulesFor('too-long', { maxDescription: 100 })).toEqual(['too-long']);
    expect(rulesFor('too-long')).toEqual([]);
  });

  it('reports duplicate', () => {
    expect(rulesFor('duplicate')).toEqual(['duplicate']);
  });

  it('reports near-duplicate, and not duplicate, when the text differs', () => {
    expect(rulesFor('near-duplicate')).toEqual(['near-duplicate']);
  });

  it('reports a broken body link, a broken MOC link, and a broken related entry on every file kind', () => {
    const { tree, operations } = fixture('broken-wikilink');
    const violations = lintSkills(tree, operations).filter((v: { rule: string }) => v.rule === 'broken-wikilink');

    expect(violations).toHaveLength(5);
    expect(violations.map((v: { target: string }) => v.target).sort()).toEqual([
      'ghost_body', 'ghost_concept_related', 'ghost_moc', 'ghost_moc_related', 'ghost_related',
    ]);
  });

  it('reports orphan, and index.md does not count as a MOC', () => {
    expect(rulesFor('orphan')).toEqual(['orphan']);
  });

  it('reports drift between the frontmatter description and the registry', () => {
    expect(rulesFor('drift')).toEqual(['drift']);
  });

  it('reports drift for an op file the registry no longer declares', () => {
    const { tree, operations } = fixture('stale-op-file');
    const violations = lintSkills(tree, operations);
    expect(violations.map((v: { rule: string }) => v.rule)).toEqual(['drift']);
    expect(violations[0].message).toContain('no operation with this id');
  });

  it('reports a frontmatter id that does not match the file name as drift', () => {
    const { tree, operations } = fixture('clean');
    const renamed = {
      ...tree,
      ops: tree.ops.map((op) => (op.id === 'alpha' ? { ...op, frontMatter: { ...op.frontMatter, id: 'not_alpha' } } : op)),
    };
    const violations = lintSkills(renamed, operations);
    expect(violations.map((v: { rule: string; message: string }) => `${v.rule}:${v.message}`)).toEqual([
      expect.stringContaining('does not match the file name'),
    ]);
  });

  it('still reports drift and broken related links when the description is empty', () => {
    const { tree, operations } = fixture('missing-description-drift');
    const violations = lintSkills(tree, operations);

    expect([...new Set(violations.map((v: { rule: string }) => v.rule))].sort())
      .toEqual(['broken-wikilink', 'drift', 'missing-description']);
    expect(violations.filter((v: { rule: string }) => v.rule === 'drift').map((v: { message: string }) => v.message))
      .toEqual([
        expect.stringContaining('does not match the file name'),
        expect.stringContaining('no operation with this id'),
      ]);
  });

  it('reports drift for a registry operation with no op file on disk', () => {
    const { tree, operations } = fixture('missing-op-file');
    const violations = lintSkills(tree, operations);

    expect(violations.map((v: { rule: string; file: string }) => `${v.rule}:${v.file}`)).toEqual(['drift:ops/gamma.md']);
    expect(violations[0].message).toContain('no file');
  });

  it('reports a concept id that collides with an operation id as drift', () => {
    const { tree, operations } = fixture('concept-id-collision');
    const violations = lintSkills(tree, operations);

    expect(violations.map((v: { rule: string; id: string }) => `${v.rule}:${v.id}`)).toEqual(['drift:review']);
    expect(violations[0].message).toContain('collides');
  });

  it('reports a concept whose frontmatter block never closes as drift', () => {
    const { tree, operations } = fixture('concept-frontmatter');
    const violations = lintSkills(tree, operations);

    expect(violations.map((v: { rule: string; file: string }) => `${v.rule}:${v.file}`))
      .toEqual(['drift:concepts/broken.md']);
    expect(violations[0].message).toContain('frontmatter');
  });
});

describe('curated-link rule', () => {
  // The curated data file is hand-authored input, so the rule validates it
  // against the registry rather than the generated tree. The fixture pairs the
  // clean tree/registry with a deliberately broken links file.
  const clean = fixture('clean');
  const brokenFixture = JSON.parse(readFileSync(join(RELATED_FIXTURES, 'broken.json'), 'utf8'));

  it('reports a broken id in the curated data file', () => {
    const curated = curatedRelatedFrom(brokenFixture);
    const violations = lintSkills(clean.tree, clean.operations, { curated })
      .filter((v: { rule: string }) => v.rule === 'curated-link');

    expect(violations).toHaveLength(4);
    expect(violations.map((v: { message: string }) => v.message)).toEqual([
      expect.stringContaining('"ghost_op" is not a registered operation'),
      expect.stringContaining('"ghost_op" is not a registered operation'),
      expect.stringContaining('points at its own operation'),
      expect.stringContaining('duplicate curated link beta->alpha'),
    ]);
    for (const violation of violations) {
      expect(violation.file).toBe('scripts/skills/data/related.json');
    }
  });

  it('reports nothing when every curated id resolves', () => {
    const curated = curatedRelatedFrom({ links: [{ from: 'alpha', to: 'beta', reason: 'a real link' }] });
    expect(lintSkills(clean.tree, clean.operations, { curated })).toEqual([]);
  });

  it('is inert when no curated data is supplied', () => {
    expect(rulesFor('clean')).toEqual([]);
  });
});

describe('rule details', () => {
  it('names both files and the similarity for a near-duplicate pair', () => {
    const { tree, operations } = fixture('near-duplicate');
    const [violation] = lintSkills(tree, operations);
    expect(violation.rule).toBe('near-duplicate');
    expect(violation.file).toBe('ops/alpha.md');
    expect(violation.other).toBe('ops/beta.md');
    expect(violation.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('honours a raised similarity threshold', () => {
    expect(rulesFor('near-duplicate', { similarity: 0.99 })).toEqual([]);
  });

  it('honours a lowered length limit by reporting each offending op', () => {
    const { tree, operations } = fixture('too-long');
    const [violation] = lintSkills(tree, operations, { maxDescription: 100 });
    expect(violation.message).toContain('max 100');
  });

  it('exposes its defaults', () => {
    expect(DEFAULT_LINT_OPTIONS).toEqual({ maxDescription: 200, similarity: 0.8 });
  });
});

describe('normalizeDescription', () => {
  it('lowercases, strips the co-package prefix, and drops punctuation and one-char tokens', () => {
    expect(normalizeDescription('[@canvas-toolchain/canvas-design-studio] Import a Canvas Backup archive, into a course folder.'))
      .toBe('import canvas backup archive into course folder');
  });

  it('makes two differently-cased descriptions compare equal', () => {
    expect(normalizeDescription('Fetch The Feed.')).toBe(normalizeDescription('fetch the feed'));
  });
});

describe('trigramSimilarity', () => {
  it('is 1 for identical text and 0 for text with no shared trigrams', () => {
    expect(trigramSimilarity('fetch the feed', 'fetch the feed')).toBe(1);
    expect(trigramSimilarity('aaa', 'zzz')).toBe(0);
  });

  it('is symmetric and bounded by 1', () => {
    const a = normalizeDescription('Fetch the weekly widget feed.');
    const b = normalizeDescription('Fetch the weekly widget feeds.');
    expect(trigramSimilarity(a, b)).toBe(trigramSimilarity(b, a));
    expect(trigramSimilarity(a, b)).toBeLessThanOrEqual(1);
  });

  it('returns 0 rather than NaN when a side has no trigrams', () => {
    expect(trigramSimilarity('', 'fetch the feed')).toBe(0);
  });
});
