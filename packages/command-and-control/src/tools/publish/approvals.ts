import type { PreviewManifest } from './manifest_types.js';

export type ApprovalAction = 'approve' | 'skip';
export type ApprovalMap = Record<string, ApprovalAction>;

export interface ApprovalValidation {
  ok: boolean;
  missing: string[];
  unknown: string[];
}

interface KeyedEntry { filename: string; relPath?: string; }

/** Canonical key: the output-relative path (#111); bare filename for pre-#111 snapshots. */
export function canonicalKey(entry: KeyedEntry): string {
  return entry.relPath ?? entry.filename;
}

/** Maps each bare filename to its canonical key (#111 relPath, or the filename itself
 *  for pre-#111 entries), but ONLY when that filename appears in exactly one entry in
 *  `entries`. An ambiguous filename (carried by two or more entries — e.g. two weeks'
 *  overview.html) is omitted from the map entirely, so no consumer can ever resolve it
 *  to the wrong entry. Callers pass non-skipped manifest entries. */
export function buildAliasMap(entries: KeyedEntry[]): Map<string, string> {
  const filenameCounts = new Map<string, number>();
  for (const e of entries) filenameCounts.set(e.filename, (filenameCounts.get(e.filename) ?? 0) + 1);
  const aliasToCanonical = new Map<string, string>();
  for (const e of entries) {
    if (filenameCounts.get(e.filename) === 1) aliasToCanonical.set(e.filename, canonicalKey(e));
  }
  return aliasToCanonical;
}

/** Builds a lookup function for a professor-supplied per-file map (approvals,
 *  a11yAcknowledgments, …), keyed once against `entries` (non-skipped manifest entries).
 *
 *  The returned lookup tries the canonical key first. It consults the bare-filename
 *  alias ONLY when the shared alias map (built once via buildAliasMap) maps that
 *  filename to THIS entry's canonical key — i.e., only when the filename is this
 *  entry's unambiguous alias. For an ambiguous filename (shared by two or more
 *  entries) the fallback never fires, for ANY map passed to the returned function.
 *
 *  This makes the bare-filename fallback safe by construction: it no longer depends
 *  on the caller having validated the specific map in hand. Prior to Phase 3 Task 8's
 *  review fix, `entryKeyLookup` applied the fallback unconditionally and relied on
 *  `validateApprovals` having rejected ambiguous aliases upfront — true for the
 *  `approvals` map (which is always validated) but false for `a11yAcknowledgments`
 *  (which publish_course.ts never validates), letting one ambiguous acknowledgment
 *  silently satisfy the gate for every same-named entry. */
export function makeEntryKeyLookup(entries: KeyedEntry[]): <T>(map: Record<string, T> | undefined, entry: KeyedEntry) => T | undefined {
  const aliasMap = buildAliasMap(entries);
  return function lookup<T>(map: Record<string, T> | undefined, entry: KeyedEntry): T | undefined {
    if (!map) return undefined;
    const canon = canonicalKey(entry);
    if (aliasMap.get(entry.filename) === canon) {
      return map[canon] ?? map[entry.filename];
    }
    return map[canon];
  };
}

export function validateApprovals(manifest: PreviewManifest, approvals: ApprovalMap): ApprovalValidation {
  const entries = manifest.entries.filter(e => e.type !== 'skipped');
  const canonical = new Set(entries.map(canonicalKey));
  const aliasToCanonical = buildAliasMap(entries);
  // Every canonical key resolves to itself too, independent of filename ambiguity.
  for (const c of canonical) aliasToCanonical.set(c, c);

  const covered = new Set<string>();
  const unknown: string[] = [];
  for (const key of Object.keys(approvals)) {
    const canon = aliasToCanonical.get(key);
    if (canon) covered.add(canon);
    else unknown.push(key);
  }
  const missing = [...canonical].filter(c => !covered.has(c));
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

export function approvedFilenames(approvals: ApprovalMap): string[] {
  return Object.entries(approvals).filter(([, a]) => a === 'approve').map(([f]) => f);
}
