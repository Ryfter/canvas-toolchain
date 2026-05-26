/**
 * Manages panopto-vocab.json: the professor's custom filler-word list and
 * vocabulary corrections used by enrich_panopto_transcripts.
 *
 * Config file: ~/.command-and-control/panopto-vocab.json (CC_HOME override for tests).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCcHomePath } from '../kb/config.js';

export interface PanoptoVocab {
  fillerWords: string[];
  corrections: { from: string; to: string }[];
}

export interface SetupPanoptoVocabInput {
  action: 'add-correction' | 'add-filler' | 'remove-correction' | 'list';
  from?: string;
  to?: string;
  word?: string;
}

export interface SetupPanoptoVocabResult {
  action: string;
  vocab: PanoptoVocab;
  message?: string;
  error?: string;
  fix?: string[];
}

function getVocabPath(): string {
  return join(getCcHomePath(), 'panopto-vocab.json');
}

/**
 * Load panopto-vocab.json, returning empty defaults when absent.
 *
 * Throws a PLAIN OBJECT `{ error, fix }` on corrupt JSON — not an Error instance.
 * Callers (enrich_panopto_transcripts) catch it as `err: any` and forward
 * `err.error` + `err.fix` directly into the structured MCP result shape.
 */
export function loadPanoptoVocab(): PanoptoVocab {
  const vocabPath = getVocabPath();
  if (!existsSync(vocabPath)) {
    return { fillerWords: [], corrections: [] };
  }
  try {
    return JSON.parse(readFileSync(vocabPath, 'utf-8')) as PanoptoVocab;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw { error: 'VOCAB_CORRUPT', fix: ['Delete panopto-vocab.json and re-run setup_panopto_vocab'] };
  }
}

function saveVocab(vocab: PanoptoVocab): void {
  const home = getCcHomePath();
  mkdirSync(home, { recursive: true });
  const vocabPath = getVocabPath();
  const tmpPath = `${vocabPath}.tmp`;
  // Atomic write: tmp + rename prevents partial-write corruption on crash.
  // mode 0o600: shares directory with panopto-config.json (OAuth credentials).
  writeFileSync(tmpPath, JSON.stringify(vocab, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, vocabPath);
}

export function setupPanoptoVocab(input: SetupPanoptoVocabInput): SetupPanoptoVocabResult {
  const { action, from, to, word } = input;

  let vocab: PanoptoVocab;
  try {
    vocab = loadPanoptoVocab();
  } catch (err: any) {
    return { action, vocab: { fillerWords: [], corrections: [] }, error: err.error, fix: err.fix };
  }

  switch (action) {
    case 'list':
      return { action, vocab };

    case 'add-correction': {
      if (!from || !to) {
        return { action, vocab, error: 'MISSING_FIELDS', fix: ['Provide both from and to for add-correction'] };
      }
      const alreadyExists = vocab.corrections.some((c) => c.from === from && c.to === to);
      if (!alreadyExists) {
        vocab.corrections.push({ from, to });
        saveVocab(vocab);
      }
      return {
        action,
        vocab,
        message: alreadyExists ? `Correction ${from}→${to} already exists.` : `Added correction ${from}→${to}.`,
      };
    }

    case 'add-filler': {
      if (!word) {
        return { action, vocab, error: 'MISSING_FIELDS', fix: ['Provide word for add-filler'] };
      }
      const alreadyInList = vocab.fillerWords.includes(word);
      if (!alreadyInList) {
        vocab.fillerWords.push(word);
        saveVocab(vocab);
      }
      return {
        action,
        vocab,
        message: alreadyInList ? `"${word}" already in filler list.` : `Added "${word}" to filler list.`,
      };
    }

    case 'remove-correction': {
      if (!from) {
        return { action, vocab, error: 'MISSING_FIELDS', fix: ['Provide from for remove-correction'] };
      }
      vocab.corrections = vocab.corrections.filter((c) => c.from !== from);
      saveVocab(vocab);
      return { action, vocab, message: `Removed correction for "${from}".` };
    }
  }
}
