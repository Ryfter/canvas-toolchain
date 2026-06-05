import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractCitedIndexes, buildUserPrompt } from '../../../src/tools/answers/retrieval/prompt.js';
import { generateAnswer } from '../../../src/tools/answers/retrieval/answer.js';
import type { LlmClient, LlmResponse } from '@canvas-toolchain/shared-llm';
import type { Chunk } from '../../../src/tools/answers/types.js';

function fakeLlm(text: string): LlmClient {
  return { async complete(): Promise<LlmResponse> { return { text, usage: { inputTokens: 100, outputTokens: 50 } }; } };
}

describe('extractCitedIndexes', () => {
  it('returns sorted unique 1-based indexes', () => {
    expect(extractCitedIndexes('Used [3] and [1] and again [3].')).toEqual([1, 3]);
  });
  it('ignores non-citation brackets', () => {
    expect(extractCitedIndexes('[foo] [99]')).toEqual([99]);
  });
});

describe('buildUserPrompt', () => {
  it('numbers chunks 1-based and includes source path', () => {
    const chunks: Chunk[] = [
      { content: 'AAA', source: 'transcript', sourcePath: 'p.md', sourceRef: '0:00', deepLink: null },
    ];
    const p = buildUserPrompt('q?', chunks);
    expect(p).toContain('[1] (transcript: p.md 0:00)');
  });
});

describe('generateAnswer', () => {
  it('returns parsed citations matching cited chunk indexes', async () => {
    const chunks: Chunk[] = [
      { content: 'A', source: 'transcript', sourcePath: 'a', sourceRef: '0', deepLink: 'https://x' },
      { content: 'B', source: 'cds', sourcePath: 'b', sourceRef: '#', deepLink: null },
    ];
    const r = await generateAnswer('q?', chunks, {
      llm: fakeLlm('Per the lecture [1], the answer is X.'),
    });
    expect(r.citations).toHaveLength(1);
    expect(r.citations[0]!.index).toBe(1);
    expect(r.citations[0]!.deepLink).toBe('https://x');
  });

  it('uses resolveActiveLlmClient when no LlmClient hook is supplied', async () => {
    const ccHome = mkdtempSync(join(tmpdir(), 'cc-home-answer-'));
    const originalHome = process.env.CC_HOME;
    process.env.CC_HOME = ccHome;
    try {
      writeFileSync(join(ccHome, 'anthropic-config.json'), JSON.stringify({ apiKey: 'sk-test', model: 'claude' }));
      writeFileSync(join(ccHome, 'llm-provider.json'), JSON.stringify({ provider: 'anthropic' }));

      const { resolveActiveLlmClient } = await import('../../../src/llm/resolve.js');
      const client = resolveActiveLlmClient();
      expect(client).toBeDefined();
    } finally {
      rmSync(ccHome, { recursive: true, force: true });
      if (originalHome === undefined) delete process.env.CC_HOME;
      else process.env.CC_HOME = originalHome;
    }
  });
});
