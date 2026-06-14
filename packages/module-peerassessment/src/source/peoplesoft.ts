import { loadColumnMap, parseRosterFile, type PeopleSoftRow } from '@canvas-toolchain/module-roster';

/**
 * Load + index the PeopleSoft export by studentNumber, reusing the column mapping the roster
 * module remembered. Returns null when no file is supplied or no mapping is remembered — the
 * caller then relies on Canvas alone and surfaces a warning.
 */
export function loadPeopleSoftIndex(peopleSoftFile?: string): Map<string, PeopleSoftRow> | null {
  if (!peopleSoftFile) return null;
  const mapping = loadColumnMap();
  if (!mapping) return null;
  const rows = parseRosterFile(peopleSoftFile, mapping);
  const idx = new Map<string, PeopleSoftRow>();
  for (const r of rows) idx.set(r.studentNumber, r);
  return idx;
}
