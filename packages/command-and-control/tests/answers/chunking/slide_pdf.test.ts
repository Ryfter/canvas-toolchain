import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chunkSlidePdf } from '../../../src/tools/answers/chunking/slide_pdf.js';

const FIXTURE = join(__dirname, '..', '..', 'fixtures', 'answers', 'sample-slides.pdf');

describe('chunkSlidePdf', () => {
  it('emits one SlideChunk per non-empty page', async () => {
    if (!existsSync(FIXTURE)) {
      console.warn('Skipping — fixture PDF missing at ' + FIXTURE);
      return;
    }
    const chunks = await chunkSlidePdf(FIXTURE);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.page).toBe(1);
    expect(typeof chunks[0]!.content).toBe('string');
    expect(chunks[0]!.content.length).toBeGreaterThan(0);
  });
});
