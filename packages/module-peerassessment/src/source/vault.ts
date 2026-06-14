import { loadVault } from '@canvas-toolchain/module-roster';

/**
 * Map canvas_id -> student_number from the roster vault. This is the bridge that lets the
 * PeerAssessment builder turn a Canvas member into a PeopleSoft row for the ID columns.
 * Empty when the vault has never been committed.
 */
export function buildVaultIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const r of loadVault()) idx.set(r.canvasId, r.studentNumber);
  return idx;
}
