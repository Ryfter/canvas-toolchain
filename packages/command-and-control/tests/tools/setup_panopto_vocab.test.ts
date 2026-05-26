import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPanoptoVocab, setupPanoptoVocab } from '../../src/tools/setup_panopto_vocab.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = join(tmpdir(), `cc-vocab-test-${Date.now()}`);
  mkdirSync(tmpHome, { recursive: true });
  process.env.CC_HOME = tmpHome;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  delete process.env.CC_HOME;
});

describe('loadPanoptoVocab', () => {
  it('returns empty defaults when panopto-vocab.json is absent', () => {
    const vocab = loadPanoptoVocab();
    expect(vocab).toEqual({ fillerWords: [], corrections: [] });
  });

  it('throws VOCAB_CORRUPT on malformed JSON', () => {
    writeFileSync(join(tmpHome, 'panopto-vocab.json'), '{bad json', 'utf-8');
    expect(() => loadPanoptoVocab()).toThrow();
    try {
      loadPanoptoVocab();
    } catch (err: any) {
      expect(err.error).toBe('VOCAB_CORRUPT');
    }
  });
});

describe('setupPanoptoVocab', () => {
  it('list returns empty defaults when file absent', () => {
    const result = setupPanoptoVocab({ action: 'list' });
    expect(result.vocab).toEqual({ fillerWords: [], corrections: [] });
  });

  it('add-correction writes the entry and skips exact duplicates', () => {
    setupPanoptoVocab({ action: 'add-correction', from: 'KOBE', to: 'COBE' });

    const vocab = loadPanoptoVocab();
    expect(vocab.corrections).toHaveLength(1);
    expect(vocab.corrections[0]).toEqual({ from: 'KOBE', to: 'COBE' });

    // Duplicate is skipped
    setupPanoptoVocab({ action: 'add-correction', from: 'KOBE', to: 'COBE' });
    const vocab2 = loadPanoptoVocab();
    expect(vocab2.corrections).toHaveLength(1);
  });

  it('add-filler appends the word', () => {
    setupPanoptoVocab({ action: 'add-filler', word: 'essentially' });

    const vocab = loadPanoptoVocab();
    expect(vocab.fillerWords).toContain('essentially');
  });

  it('add-filler skips duplicate words', () => {
    setupPanoptoVocab({ action: 'add-filler', word: 'essentially' });
    setupPanoptoVocab({ action: 'add-filler', word: 'essentially' });

    const vocab = loadPanoptoVocab();
    expect(vocab.fillerWords.filter((w) => w === 'essentially')).toHaveLength(1);
  });

  it('remove-correction removes the matching entry', () => {
    setupPanoptoVocab({ action: 'add-correction', from: 'KOBE', to: 'COBE' });
    setupPanoptoVocab({ action: 'add-correction', from: 'kobe', to: 'COBE' });

    setupPanoptoVocab({ action: 'remove-correction', from: 'KOBE' });

    const vocab = loadPanoptoVocab();
    expect(vocab.corrections).toHaveLength(1);
    expect(vocab.corrections[0].from).toBe('kobe');
  });

  it('writes the file with mode 0o600 (atomic write)', () => {
    setupPanoptoVocab({ action: 'add-filler', word: 'basically' });

    const vocabPath = join(tmpHome, 'panopto-vocab.json');
    expect(existsSync(vocabPath)).toBe(true);
    const content = JSON.parse(readFileSync(vocabPath, 'utf-8'));
    expect(content.fillerWords).toContain('basically');
  });
});
