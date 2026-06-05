import { describe, it, expect } from 'vitest';
import { chunkCanonical } from '../../../src/tools/answers/chunking/canonical.js';

describe('chunkCanonical', () => {
  it('emits one chunk per ## section', () => {
    const src = `# Canonical FAQ

## How is the final project graded?

40% rubric, 60% peer eval.

## When does the lowest quiz drop?

Auto-drops at semester end.
`;
    const chunks = chunkCanonical(src);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.question).toBe('How is the final project graded?');
    expect(chunks[0]!.content).toContain('40% rubric');
    expect(chunks[1]!.question).toMatch(/lowest quiz/);
  });

  it('returns empty when no ## sections present', () => {
    expect(chunkCanonical('# only h1\n\ncontent')).toEqual([]);
  });
});
