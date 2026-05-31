import { describe, it, expect } from 'vitest';
import { buildDiffSummary, computeUnifiedDiff } from '../../../src/tools/publish/build_diff_summary.js';

describe('buildDiffSummary', () => {
  it('returns priorWords:null when prior HTML is null (new page)', () => {
    const summary = buildDiffSummary(null, '<h2>Hello</h2><p>World</p>');
    expect(summary.priorWords).toBeNull();
    expect(summary.newWords).toBe(2);
    expect(summary.delta).toBe(2);
    expect(summary.hasFullDiff).toBe(true);
  });

  it('counts word delta correctly', () => {
    const prior = '<p>one two three</p>';
    const next = '<p>one two three four five</p>';
    const summary = buildDiffSummary(prior, next);
    expect(summary.priorWords).toBe(3);
    expect(summary.newWords).toBe(5);
    expect(summary.delta).toBe(2);
  });

  it('counts sections (h2/h3/h4) changed by raw count delta', () => {
    const prior = '<h2>A</h2><h2>B</h2>';
    const next = '<h2>A</h2><h2>B</h2><h2>C</h2><h3>sub</h3>';
    const summary = buildDiffSummary(prior, next);
    expect(summary.sectionsChanged).toBe(2);
  });

  it('counts callouts added and removed via class detection', () => {
    const prior = '<div class="callout">old</div>';
    const next = '<div class="callout">old</div><div class="callout">new1</div><div class="callout">new2</div>';
    const summary = buildDiffSummary(prior, next);
    expect(summary.calloutsAdded).toBe(2);
    expect(summary.calloutsRemoved).toBe(0);
  });

  it('counts images changed when alt text or src differs', () => {
    const prior = '<img src="a.jpg" alt="A">';
    const next = '<img src="a.jpg" alt="B"><img src="c.jpg" alt="C">';
    const summary = buildDiffSummary(prior, next);
    expect(summary.imagesChanged).toBeGreaterThanOrEqual(1);
  });

  it('strips numeric and hex HTML entities (&#160;, &#x2019;) so they do not count as words', () => {
    // entities act as separators, so this counts as 6 tokens after stripping: Mike s hello world non breaking
    const html = '<p>Mike&#x2019;s hello&#160;world non&#x2013;breaking</p>';
    const summary = buildDiffSummary(null, html);
    expect(summary.newWords).toBe(6);
  });
});

describe('computeUnifiedDiff', () => {
  it('produces a unified diff string for two HTML inputs', () => {
    const diff = computeUnifiedDiff('<p>one</p>\n', '<p>two</p>\n');
    expect(diff).toContain('-');
    expect(diff).toContain('+');
    expect(diff).toContain('one');
    expect(diff).toContain('two');
  });

  it('returns "(new page)" marker when prior is null', () => {
    const diff = computeUnifiedDiff(null, '<p>hello</p>');
    expect(diff).toMatch(/new page/i);
    expect(diff).toContain('hello');
  });
});
