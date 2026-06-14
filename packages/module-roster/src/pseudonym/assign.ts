import type { MatchedStudent, VaultRecord } from '../types.js';

/** One pseudonym decision for a matched student. */
export interface PseudonymAssignment {
  studentNumber: string;
  canvasId: string;
  pseudonym: string;
  returning: boolean;
}

export interface AssignmentResult {
  assignments: PseudonymAssignment[];
  /** Vault records for genuinely-new students (to be inserted on commit). */
  newRecords: VaultRecord[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The next sequence number for a term prefix = 1 + the max existing number with that prefix. */
export function nextSequence(vault: VaultRecord[], term: string): number {
  let max = 0;
  const re = new RegExp(`^${escapeRegExp(term)}-(\\d+)$`);
  for (const r of vault) {
    const m = r.pseudonym.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function format(term: string, seq: number): string {
  return `${term}-${String(seq).padStart(3, '0')}`;
}

/**
 * Assign pseudonyms. Returning students (studentNumber already in the vault) keep their
 * existing pseudonym and are flagged returning. New students get the next <term>-NNN in
 * sequence. Pure/deterministic — performs no I/O.
 */
export function assignPseudonyms(
  matched: MatchedStudent[], vault: VaultRecord[], term: string,
): AssignmentResult {
  const byStudent = new Map(vault.map((r) => [r.studentNumber, r]));
  let seq = nextSequence(vault, term);
  const assignments: PseudonymAssignment[] = [];
  const newRecords: VaultRecord[] = [];

  for (const ms of matched) {
    const sn = ms.ps.studentNumber;
    const existing = byStudent.get(sn);
    if (existing) {
      assignments.push({ studentNumber: sn, canvasId: ms.canvas.canvasId, pseudonym: existing.pseudonym, returning: true });
      continue;
    }
    const pseudonym = format(term, seq++);
    assignments.push({ studentNumber: sn, canvasId: ms.canvas.canvasId, pseudonym, returning: false });
    newRecords.push({ studentNumber: sn, canvasId: ms.canvas.canvasId, pseudonym, firstSeenTerm: term });
  }

  return { assignments, newRecords };
}
