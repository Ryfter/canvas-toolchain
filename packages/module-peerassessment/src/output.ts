import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PeerAssessmentRow } from './types.js';

const HEADER = 'Team,Login ID,Email,First Name,Last Name,Student ID #';

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Render rows as the PeerAssessment.com import CSV (header + one row per student). */
export function renderImportCsv(rows: PeerAssessmentRow[]): string {
  const lines = [HEADER];
  for (const r of rows) {
    lines.push(
      [r.team, r.loginId, r.email, r.firstName, r.lastName, r.studentId].map(csvCell).join(','),
    );
  }
  return lines.join('\n') + '\n';
}

/** Write the import CSV to a path, creating parent dirs. Returns the path. */
export function writeImportCsv(path: string, rows: PeerAssessmentRow[]): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderImportCsv(rows), 'utf-8');
  return path;
}
