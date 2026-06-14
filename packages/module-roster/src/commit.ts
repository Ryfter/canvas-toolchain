import { loadVault, saveVault, indexByStudentNumber } from './vault/store.js';
import { writeRosterCsv } from './roster/output.js';
import type { ProposalReport, VaultRecord } from './types.js';

export interface CommitResult {
  rosterPath: string;
  rowsWritten: number;
  vaultAdded: number;
  vaultPathWritten: string;
}

/**
 * The only writer. Writes the de-id roster CSV and inserts new students into the vault.
 * Returning students (already in the vault) are left untouched, so re-commit is idempotent.
 * Refuses to run if the report carries unresolved collisions.
 */
export function commitRoster(report: ProposalReport, rosterPath: string): CommitResult {
  if (report.collisions.length > 0) {
    throw new Error(
      `COMMIT_BLOCKED: ${report.collisions.length} vault collision(s) must be resolved before commit ` +
      `(same student number now maps to a different Canvas id).`,
    );
  }

  const rosterPathWritten = writeRosterCsv(rosterPath, report.rows);

  const vault = loadVault();
  const idx = indexByStudentNumber(vault);
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
