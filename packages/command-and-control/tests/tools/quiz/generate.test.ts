import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateQuizDraft } from '../../../src/tools/quiz/generate.js';
import { realizeTargetCounts } from '../../../src/tools/quiz/mix.js';
import type { LlmClient } from '@canvas-toolchain/shared-llm';

describe('realizeTargetCounts', () => {
  it('sums to questionCount with remainder on medium', () => {
    const c = realizeTargetCounts(10, { easy: 0.4, medium: 0.4, hard: 0.2 });
    expect(c.easy + c.medium + c.hard).toBe(10);
  });
});

describe('generateQuizDraft', () => {
  it('refuses empty sources', async () => {
    const llm: LlmClient = { complete: vi.fn() };
    const r = await generateQuizDraft(
      { courseDir: '/tmp', week: 1, sources: [] },
      { llm },
    );
    expect('error' in r && r.error).toBe('QUIZ_SOURCES_REQUIRED');
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('writes draft markdown and runs structural pre-check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'quiz-gen-'));
    try {
      const llm: LlmClient = {
        complete: vi.fn(async () => ({
          text: JSON.stringify({
            items: [
              {
                id: '1',
                type: 'multiple_choice',
                difficulty: 'easy',
                stem: 'From the reading, what is X?',
                choices: ['a', 'b', 'c', 'd'],
                key: 'B',
                points: 1,
              },
            ],
          }),
        })),
      };
      const out = join(dir, 'week-01', 'quizzes', 'draft.md');
      const r = await generateQuizDraft(
        {
          courseDir: dir,
          week: 1,
          sources: ['materials/ch.md'],
          outputPath: out,
          sourceTexts: { 'materials/ch.md': 'Chapter about X and Y for EXAMPLE101.' },
        },
        { llm },
      );
      expect('path' in r && r.path).toBe(out);
      if ('path' in r) {
        expect(r.questionCount).toBe(1);
        const body = readFileSync(out, 'utf-8');
        expect(body).toContain('canvas-toolchain.quiz/v1');
        expect(body).toMatch(/what is X\?/i);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses overwrite when file exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'quiz-gen-'));
    try {
      const out = join(dir, 'exists.md');
      const { writeFileSync } = await import('node:fs');
      writeFileSync(out, 'prior');
      const llm: LlmClient = { complete: vi.fn() };
      const r = await generateQuizDraft(
        {
          courseDir: dir,
          week: 1,
          sources: ['a.md'],
          outputPath: out,
          sourceTexts: { 'a.md': 'text' },
        },
        { llm },
      );
      expect('error' in r && r.error).toBe('QUIZ_OUTPUT_EXISTS');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses paths that escape courseDir', async () => {
    const llm: LlmClient = { complete: vi.fn() };
    const dir = mkdtempSync(join(tmpdir(), 'quiz-gen-'));
    try {
      const r = await generateQuizDraft(
        {
          courseDir: dir,
          week: 1,
          sources: ['ok.md'],
          outputPath: '../evil.md',
          sourceTexts: { 'ok.md': 'enough source text for a quiz draft' },
        },
        { llm },
      );
      expect('error' in r && r.error).toBe('QUIZ_PATH_ESCAPE');
      expect(llm.complete).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
