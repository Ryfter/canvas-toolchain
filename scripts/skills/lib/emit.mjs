import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The one marker that separates machine-written text from human-written text.
 *
 * Everything above it is regenerated on every run; the marker line and
 * everything below it is never touched once the file exists. This is the only
 * place in the repo that knows the marker, so the "never clobber a hand-written
 * body" rule has one implementation.
 */
export const GENERATED_END = '<!-- generated:end -->';

/**
 * Split a file into the generated region and the tail (marker line onward).
 * A file with no marker is treated as entirely hand-written, so a file that
 * predates the generator is adopted without losing its content.
 */
export function splitGenerated(text) {
  const idx = text.indexOf(GENERATED_END);
  if (idx === -1) return { generated: '', tail: `\n${text}` };
  return { generated: text.slice(0, idx), tail: text.slice(idx + GENERATED_END.length) };
}

export function composeFile(generatedRegion, tail) {
  return `${generatedRegion}${GENERATED_END}${tail}`;
}

/**
 * Write `generatedRegion` above the marker, preserving whatever was below it.
 *
 * @returns 'created' | 'updated' | 'unchanged' | 'would-create' | 'would-update'
 */
export function writeGeneratedFile(filePath, generatedRegion, { stub = '\n', check = false } = {}) {
  const exists = existsSync(filePath);
  const current = exists ? readFileSync(filePath, 'utf8') : null;
  const tail = exists ? splitGenerated(current).tail : stub;
  const next = composeFile(generatedRegion, tail);

  if (current === next) return 'unchanged';
  if (check) return exists ? 'would-update' : 'would-create';

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, next);
  return exists ? 'updated' : 'created';
}

/**
 * Summarize a batch of writeGeneratedFile results for a CLI's stdout.
 *
 * `created`/`updated` count files that were written, or — in check mode — that
 * would be written. `changed` is their sum, so a caller can decide its exit
 * code without knowing which mode it ran in.
 */
export function summarize(results) {
  const counts = { created: 0, updated: 0, unchanged: 0, changed: 0 };
  for (const status of results) {
    if (status === 'created' || status === 'would-create') counts.created += 1;
    else if (status === 'updated' || status === 'would-update') counts.updated += 1;
    else counts.unchanged += 1;
  }
  counts.changed = counts.created + counts.updated;
  return counts;
}
