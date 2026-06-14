import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ProposalRow } from '../types.js';

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Render the PII-free de-identified roster: canvas_id,pseudonym,major. */
export function renderRosterCsv(rows: ProposalRow[]): string {
  const lines = ['canvas_id,pseudonym,major'];
  for (const r of rows) {
    lines.push(`${csvCell(r.canvasId)},${csvCell(r.pseudonym)},${csvCell(r.canonicalMajor)}`);
  }
  return lines.join('\n') + '\n';
}

/** Write the roster CSV to a path, creating parent dirs. Returns the path. */
export function writeRosterCsv(path: string, rows: ProposalRow[]): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderRosterCsv(rows), 'utf-8');
  return path;
}
