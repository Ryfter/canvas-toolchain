import { describe, it, expect } from 'vitest';
import { chunkMarkdown } from '../../../src/tools/answers/chunking/markdown.js';

describe('chunkMarkdown', () => {
  it('splits on heading boundaries; preserves heading path', () => {
    const src = `---
week: 3
---
# Week 3

## Learning Goals

Students will learn VLOOKUP.

## Activities

Submit via Canvas.
`;
    const chunks = chunkMarkdown(src);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.headingPath).toBe('Week 3 > Learning Goals');
    expect(chunks[0]!.content).toContain('VLOOKUP');
    expect(chunks[1]!.headingPath).toBe('Week 3 > Activities');
  });

  it('splits a very long single section on paragraph boundaries', () => {
    const longParas = Array.from({ length: 20 }, (_, i) =>
      'word '.repeat(60) + `(paragraph ${i})`).join('\n\n');
    const chunks = chunkMarkdown(`# H\n\n${longParas}`);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(c => c.headingPath === 'H')).toBe(true);
  });
});
