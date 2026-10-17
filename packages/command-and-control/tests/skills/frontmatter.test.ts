import { describe, expect, it } from 'vitest';
import { parseFrontMatter, stringifyFrontMatter } from '../../../../scripts/skills/lib/frontmatter.mjs';

describe('stringifyFrontMatter', () => {
  it('writes keys in insertion order, quoted, between fences', () => {
    const text = stringifyFrontMatter({ id: 'x', related: ['a', 'b'] });
    expect(text).toBe('---\nid: "x"\nrelated: [a, b]\n---\n');
  });

  it('writes an empty value as an empty quoted string, not a bare key', () => {
    expect(stringifyFrontMatter({ intent_tool: '' })).toBe('---\nintent_tool: ""\n---\n');
  });

  it('writes numbers bare so map counts stay numeric', () => {
    expect(stringifyFrontMatter({ ops: 6 })).toBe('---\nops: 6\n---\n');
  });

  it('escapes quotes and backslashes so a description cannot break the block', () => {
    const text = stringifyFrontMatter({ description: 'a "quoted" \\ thing' });
    expect(parseFrontMatter(`${text}\nbody`).data.description).toBe('a "quoted" \\ thing');
  });

  it('collapses newlines: frontmatter descriptions are always one line', () => {
    expect(stringifyFrontMatter({ description: 'one\ntwo' })).toBe('---\ndescription: "one two"\n---\n');
  });
});

describe('parseFrontMatter', () => {
  it('returns null data and the whole text as body when there is no block', () => {
    const { data, body } = parseFrontMatter('# Just a heading\n');
    expect(data).toBeNull();
    expect(body).toBe('# Just a heading\n');
  });

  it('parses quoted strings, plain numerics, flow sequences, and empty values', () => {
    const { data, body } = parseFrontMatter(
      '---\nid: "x"\nops: 6\nrelated: [a, b]\nintent_tool: ""\n---\nbody\n',
    );
    expect(data).toEqual({ id: 'x', ops: 6, related: ['a', 'b'], intent_tool: '' });
    expect(body).toBe('body\n');
  });

  it('round-trips every key of the operation schema', () => {
    const op = {
      id: 'validate_quiz',
      description: 'Check a quiz: "quotes", commas, and — dashes.',
      section: 'design',
      intent_tool: 'ct_review',
      intent_action: 'quiz',
      exposure: 'intent',
      related: ['generate_quiz', 'check_shell_readiness'],
    };
    const { data } = parseFrontMatter(`${stringifyFrontMatter(op)}body\n`);
    expect(data).toEqual(op);
  });

  it('treats an empty flow sequence as an empty list', () => {
    expect(parseFrontMatter('---\nrelated: []\n---\n').data.related).toEqual([]);
  });

  it('treats an unterminated block as body text rather than guessing', () => {
    const { data } = parseFrontMatter('---\nid: "x"\n');
    expect(data).toBeNull();
  });
});
