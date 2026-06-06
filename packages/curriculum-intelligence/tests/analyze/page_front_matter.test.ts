import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPageFrontMatter, writePageTiers, splitSections } from '../../src/analyze/page_front_matter.js';

let tmpDir: string;

beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'pagefm-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('readPageFrontMatter', () => {
  it('parses YAML front matter and returns the body separately', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '---\ntitle: Week 5\nweek: 5\n---\n\n## Due Date\n\nOct 17\n');
    const { fm, body } = readPageFrontMatter(filePath);
    expect(fm.title).toBe('Week 5');
    expect(fm.week).toBe(5);
    expect(body.startsWith('\n## Due Date')).toBe(true);
  });

  it('returns empty fm and full content as body when no front matter present', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '## Heading\n\nbody only\n');
    const { fm, body } = readPageFrontMatter(filePath);
    expect(fm).toEqual({});
    expect(body).toContain('## Heading');
  });

  it('preserves nested fm fields (e.g., existing tiers block) on read', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '---\ntitle: Week 5\ntiers:\n  locked: true\n  sections:\n    - heading: Due Date\n      tier: 1\n      summary: Oct 17\n---\n\nbody\n');
    const { fm } = readPageFrontMatter(filePath);
    expect((fm as any).tiers.locked).toBe(true);
    expect((fm as any).tiers.sections[0].heading).toBe('Due Date');
  });
});

describe('writePageTiers', () => {
  it('atomically writes a merged front matter preserving existing fields', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '---\ntitle: Week 5\nweek: 5\n---\n\n## Due Date\n\nOct 17\n');
    writePageTiers(filePath, {
      sections: [{ heading: 'Due Date', tier: 1, summary: 'Oct 17 by 11:59 PM' }],
    });
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).toContain('title: Week 5');
    expect(raw).toContain('week: 5');
    expect(raw).toContain('tiers:');
    expect(raw).toContain('Due Date');
    expect(raw).toContain('Oct 17 by 11:59 PM');
    expect(raw).toContain('## Due Date');
  });

  it('overwrites an existing tiers block on rewrite', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath,
      '---\ntitle: T\ntiers:\n  sections:\n    - heading: Old\n      tier: 2\n      summary: stale\n---\n\nbody\n');
    writePageTiers(filePath, {
      sections: [{ heading: 'Due Date', tier: 1, summary: 'fresh' }],
    });
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw).not.toContain('Old');
    expect(raw).not.toContain('stale');
    expect(raw).toContain('Due Date');
    expect(raw).toContain('fresh');
  });

  it('inserts a fresh front matter block when none exists', () => {
    const filePath = join(tmpDir, 'p.md');
    writeFileSync(filePath, '## Due Date\n\nOct 17\n');
    writePageTiers(filePath, {
      sections: [{ heading: 'Due Date', tier: 1, summary: 'Oct 17' }],
    });
    const raw = readFileSync(filePath, 'utf-8');
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).toContain('## Due Date');
  });
});

describe('splitSections', () => {
  it('splits markdown body into { heading, body } pairs at H2 boundaries', () => {
    const body = '## Due Date\n\nOct 17\n\n## Submission\n\nUpload PDF.\n';
    const sections = splitSections(body);
    expect(sections).toHaveLength(2);
    expect(sections[0].heading).toBe('Due Date');
    expect(sections[0].body.trim()).toBe('Oct 17');
    expect(sections[1].heading).toBe('Submission');
  });

  it('also splits at H3 boundaries within an H2 chunk', () => {
    const body = '## Header\n\nintro\n\n### Sub A\n\ncontent A\n\n### Sub B\n\ncontent B\n';
    const sections = splitSections(body);
    expect(sections.map((s) => s.heading)).toEqual(['Header', 'Sub A', 'Sub B']);
  });

  it('returns empty array when there are no H2/H3 headings', () => {
    const body = 'just some text with no headings\n';
    expect(splitSections(body)).toEqual([]);
  });
});
