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

/** Look up a professor-supplied per-file map by canonical key, falling back to the
 *  bare filename alias (back-compat; safe here because validateApprovals rejected
 *  ambiguous filename aliases up front). */
export function entryKeyLookup<T>(map: Record<string, T> | undefined, entry: KeyedEntry): T | undefined {
  if (!map) return undefined;
  return map[canonicalKey(entry)] ?? map[entry.filename];
}

export function validateApprovals(manifest: PreviewManifest, approvals: ApprovalMap): ApprovalValidation {
  const entries = manifest.entries.filter(e => e.type !== 'skipped');
  const canonical = new Set(entries.map(canonicalKey));

  // A filename is a usable alias only when exactly one entry carries it.
  const filenameCounts = new Map<string, number>();
  for (const e of entries) filenameCounts.set(e.filename, (filenameCounts.get(e.filename) ?? 0) + 1);
  const aliasToCanonical = new Map<string, string>();
  for (const e of entries) {
    const canon = canonicalKey(e);
    aliasToCanonical.set(canon, canon);
    if (filenameCounts.get(e.filename) === 1) aliasToCanonical.set(e.filename, canon);
  }

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
