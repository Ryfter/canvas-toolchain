import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const WORKSHEET_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/setup-worksheet.md'
);

const AI_HOST_PREFIX = [
  '> **For AI hosts:** Save this file as `setup-worksheet.md` in the professor\'s working directory.',
  '> Ask the professor to fill it out, then call `setup_institution` with `worksheetContent` set to the file\'s contents.',
  '',
].join('\n');

export function getSetupWorksheet(): string {
  const template = readFileSync(WORKSHEET_PATH, 'utf8');
  return AI_HOST_PREFIX + template;
}
