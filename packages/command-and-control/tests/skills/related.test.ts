import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_RELATED, mergeRelated } from '../../../../scripts/skills/lib/graph.mjs';
import { curatedRelatedFrom, curatedRelatedPath, loadCuratedRelated } from '../../../../scripts/skills/lib/related.mjs';

const SKILLS = fileURLToPath(new URL('../../skills', import.meta.url));

describe('curatedRelatedFrom', () => {
  it('groups directed links by their from id, preserving order within a source', () => {
    const { byFrom } = curatedRelatedFrom({
      links: [
        { from: 'a', to: 'b', reason: 'reason' },
        { from: 'a', to: 'c', reason: 'reason' },
        { from: 'b', to: 'a', reason: 'reason' },
      ],
    });
    expect(byFrom.get('a')).toEqual(['b', 'c']);
    expect(byFrom.get('b')).toEqual(['a']);
  });

  it('rejects a data file with no links array', () => {
    expect(() => curatedRelatedFrom({})).toThrow(/"links" array/);
  });

  it('rejects a link missing from, to, or reason', () => {
    expect(() => curatedRelatedFrom({ links: [{ from: 'a', to: 'b' }] })).toThrow(/links\[0\]/);
    expect(() => curatedRelatedFrom({ links: [{ from: '', to: 'b', reason: 'r' }] })).toThrow(/links\[0\]/);
    expect(() => curatedRelatedFrom({ links: [{ from: 'a', to: 'b', reason: '' }] })).toThrow(/links\[0\]/);
  });
});

describe('mergeRelated', () => {
  const seed = new Map([['a', ['b', 'c']], ['b', ['a']]]);

  it('merges curated links into the seed, deduped and sorted by id', () => {
    const merged = mergeRelated(seed, new Map([['a', ['z']], ['b', ['a']]]));
    expect(merged.get('a')).toEqual(['b', 'c', 'z']);
    expect(merged.get('b')).toEqual(['a']);
  });

  it('never emits a self link', () => {
    const merged = mergeRelated(new Map([['a', ['b']]]), new Map([['a', ['a', 'z']]]));
    expect(merged.get('a')).toEqual(['b', 'z']);
  });

  it('caps the merged list, dropping seed links before any curated link', () => {
    const seeded = new Map([['a', Array.from({ length: 12 }, (_, i) => `s${String(i).padStart(2, '0')}`)]]);
    const curated = new Map([['a', ['z1', 'z2', 'z3', 'z4']]]);
    const merged = mergeRelated(seeded, curated);

    expect(merged.get('a')).toHaveLength(MAX_RELATED);
    expect(merged.get('a')).toEqual(expect.arrayContaining(['z1', 'z2', 'z3', 'z4']));
    expect(merged.get('a')).not.toContain('s11');
  });

  it('is independent of the order the data file lists links in', () => {
    const first = mergeRelated(seed, new Map([['a', ['z', 'y']]]));
    const second = mergeRelated(seed, new Map([['a', ['y', 'z']]]));
    expect(first.get('a')).toEqual(second.get('a'));
  });

  it('sorts the seed deterministically when there is no curated data', () => {
    expect(mergeRelated(new Map([['a', ['c', 'b']]])).get('a')).toEqual(['b', 'c']);
  });
});

describe('curatedRelatedPath', () => {
  it('resolves the data file under the supplied repo root, so a --repo-root override is honoured', () => {
    expect(curatedRelatedPath('/elsewhere/repo')).toBe(join('/elsewhere/repo', 'scripts/skills/data/related.json'));
  });
});

describe('committed curated data', () => {
  it('links only ids that exist as generated operation files', () => {
    const { links } = loadCuratedRelated();
    const ids = new Set(readdirSync(join(SKILLS, 'ops')).map((name) => name.replace(/\.md$/, '')));
    const dangling = links.filter((link) => !ids.has(link.from) || !ids.has(link.to));

    expect(links.length).toBeGreaterThan(0);
    expect(dangling).toEqual([]);
  });

  it('carries a reason on every link, so a reviewer can judge relevance', () => {
    for (const link of loadCuratedRelated().links) {
      expect(link.reason.trim().length, `${link.from}->${link.to}`).toBeGreaterThan(10);
    }
  });
});
