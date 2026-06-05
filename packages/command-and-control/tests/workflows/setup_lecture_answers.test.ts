import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupLectureAnswers } from '../../src/tools/workflows/setup_lecture_answers.js';
import { loadLectureAnswersConfig } from '../../src/tools/answers/config.js';

let ccHome: string;

beforeEach(() => { ccHome = mkdtempSync(join(tmpdir(), 'cc-home-')); process.env.CC_HOME = ccHome; });
afterEach(() => { delete process.env.CC_HOME; rmSync(ccHome, { recursive: true, force: true }); vi.unstubAllGlobals(); });

describe('setupLectureAnswers', () => {
  it('auto-configures Ollama when available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const r = await setupLectureAnswers();
    expect(r.configured).toBe(true);
    expect(r.provider).toBe('ollama');
    expect(loadLectureAnswersConfig()?.provider).toBe('ollama');
  });

  it('returns fix instructions when Ollama is absent and no explicit provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    const r = await setupLectureAnswers();
    expect(r.configured).toBe(false);
    expect(r.fix).toBeDefined();
    expect(r.fix!.length).toBe(3);
  });

  it('refuses voyage without an API key', async () => {
    const r = await setupLectureAnswers({ provider: 'voyage' });
    expect(r.configured).toBe(false);
    expect(r.message).toMatch(/voyageApiKey/);
  });

  it('saves voyage config when api key is provided', async () => {
    const r = await setupLectureAnswers({ provider: 'voyage', voyageApiKey: 'vk-x' });
    expect(r.configured).toBe(true);
    expect(loadLectureAnswersConfig()?.voyageApiKey).toBe('vk-x');
  });
});
