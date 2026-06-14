import { readFileSync } from 'node:fs';
import type { ColumnMapping, PeopleSoftRow } from '../types.js';

export interface ParsedCsv {
  headers: string[];
  records: Array<Record<string, string>>;
}

/** Split one CSV line, honoring double-quoted fields that contain commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Parse CSV text into headers + an array of header->value records. */
export function parseCsv(text: string): ParsedCsv {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], records: [] };
  const headers = splitCsvLine(lines[0]);
  const records = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = cells[i] ?? ''; });
    return rec;
  });
  return { headers, records };
}

/** Read + map a PeopleSoft CSV file path into PeopleSoftRow[]. */
export function parseRosterFile(path: string, mapping: ColumnMapping): PeopleSoftRow[] {
  return rowsFromCsv(readFileSync(path, 'utf-8'), mapping);
}

/** Map parsed CSV records to PeopleSoftRow using the column mapping. */
export function rowsFromCsv(text: string, mapping: ColumnMapping): PeopleSoftRow[] {
  const { headers, records } = parseCsv(text);
  const need = [mapping.studentNumber, mapping.email, mapping.userId, mapping.name, mapping.major];
  for (const col of need) {
    if (!headers.includes(col)) throw new Error(`Column not found in CSV: "${col}".`);
  }
  const hasSecond = mapping.secondMajor !== undefined && headers.includes(mapping.secondMajor);
  return records.map((r) => {
    const second = hasSecond ? r[mapping.secondMajor as string]?.trim() : '';
    return {
      studentNumber: r[mapping.studentNumber].trim(),
      email: r[mapping.email].trim(),
      userId: r[mapping.userId].trim(),
      name: r[mapping.name].trim(),
      rawMajor: r[mapping.major].trim(),
      secondMajor: second ? second : undefined,
    };
  });
}
