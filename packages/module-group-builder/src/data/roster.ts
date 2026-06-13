import { readFileSync } from 'node:fs';

export interface RosterRow {
  canvasId: string;
  pseudonym: string;
  major?: string;
  metrics: Record<string, number>;
}

const RESERVED = new Set(['canvas_id', 'pseudonym', 'major']);

/** Parse a simple comma-separated roster. Required headers: canvas_id, pseudonym.
 *  Optional: major. Any other numeric column becomes a metric. */
export function parseRosterFile(path: string): RosterRow[] {
  const text = readFileSync(path, 'utf-8').replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  if (!headers.includes('canvas_id') || !headers.includes('pseudonym')) {
    throw new Error('Roster file must have canvas_id and pseudonym columns.');
  }
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: RosterRow = { canvasId: '', pseudonym: '', metrics: {} };
    headers.forEach((h, i) => {
      const v = cells[i] ?? '';
      if (h === 'canvas_id') row.canvasId = v;
      else if (h === 'pseudonym') row.pseudonym = v;
      else if (h === 'major') { if (v) row.major = v; }
      else if (!RESERVED.has(h)) {
        const n = Number(v);
        if (v !== '' && Number.isFinite(n)) row.metrics[h] = n;
      }
    });
    return row;
  });
}
