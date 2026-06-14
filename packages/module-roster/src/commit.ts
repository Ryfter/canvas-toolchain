import { loadVault, saveVault, indexByStudentNumber, detectCollision } from './vault/store.js';
import { writeRosterCsv } from './roster/output.js';
import type { ProposalReport, VaultRecord, VaultCollision } from './types.js';

export interface CommitResult {
  rosterPath: string;
  rowsWritten: number;
  vaultAdded: number;
  vaultPathWritten: string;
}

/**
 * The only writer. Writes the de-id roster CSV and inserts new students into the vault.
 * Returning students (already in the vault) are left untouched, so re-commit is idempotent.
 * Refuses to run if the report carries unresolved collisions OR if a fresh check against the
 * live vault finds any (so a hand-built proposal cannot bypass the guard).
 */
export function commitRoster(report: ProposalReport, rosterPath: string): CommitResult {
  if (report.collisions.length > 0) {
    throw new Error(
      `COMMIT_BLOCKED: ${report.collisions.length} vault collision(s) must be resolved before commit ` +
      `(same student number now maps to a different Canvas id).`,
    );
  }

  // Re-validate against the LIVE vault — never trust the caller-supplied report alone.
  const vault = loadVault();
  const idx = indexByStudentNumber(vault);
  const liveCollisions: VaultCollision[] = [];
  for (const r of report.rows) {
    const c = detectCollision(idx, r.studentNumber, r.canvasId);
    if (c) liveCollisions.push(c);
  }
  if (liveCollisions.length > 0) {
    throw new Error(
      `COMMIT_BLOCKED: ${liveCollisions.length} live vault collision(s) detected against the current ` +
      `vault; re-run propose_roster and resolve them before committing.`,
    );
  }

  const rosterPathWritten = writeRosterCsv(rosterPath, report.rows);

  const additions: VaultRecord[] = [];
  for (const r of report.rows) {
    if (!idx.has(r.studentNumber)) {
      additions.push({
        studentNumber: r.studentNumber,
        canvasId: r.canvasId,
        pseudonym: r.pseudonym,
        firstSeenTerm: report.term,
      });
    }
  }
  const vaultPathWritten = saveVault([...vault, ...additions]);

  return {
    rosterPath: rosterPathWritten,
    rowsWritten: report.rows.length,
    vaultAdded: additions.length,
    vaultPathWritten,
  };
}
