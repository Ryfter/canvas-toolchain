import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateQuiz } from '../../../src/tools/workflows/generate_quiz.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

describe('generateQuiz workflow', () => {
  it('requires courseDir and week', async () => {
    const r = await generateQuiz({ courseDir: '', week: 1, sources: ['a'] } as never);
    expect('error' in r).toBe(true);
  });

  it('writes via injected llm + sourceTexts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'quiz-wf-'));
    try {
      const llm: LlmClient = {
        complete: vi.fn(async () => ({
          text: JSON.stringify({
            items: [
              {
                id: '1',
                type: 'multiple_choice',
                difficulty: 'medium',
                stem: 'EXAMPLE101 concept?',
                choices: ['w', 'x', 'y', 'z'],
                key: 'A',
                points: 1,
              },
            ],
          }),
        })),
      };
      const r = await generateQuiz(
        {
          courseDir: dir,
          week: 2,
          sources: ['slides.md'],
          title: 'Week 2 Quiz',
          overwrite: true,
        },
        {
          llm,
          sourceTexts: { 'slides.md': 'Slides about EXAMPLE101 concepts.' },
        },
      );
      expect('path' in r).toBe(true);
      if ('path' in r) {
        const body = readFileSync(r.path, 'utf-8');
        expect(body).toContain('Week 2 Quiz');
        expect(body).not.toMatch(/sk-|api[_-]?key/i);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
