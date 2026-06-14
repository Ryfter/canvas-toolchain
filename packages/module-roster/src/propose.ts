import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { loadVault, indexByStudentNumber, detectCollision } from './vault/store.js';
import { matchStudents } from './match/resolver.js';
import { assignPseudonyms } from './pseudonym/assign.js';
import { normalizeMajors } from './major/normalize.js';
import type {
  CanvasUser, PeopleSoftRow, ProposalReport, ProposalRow, VaultCollision,
} from './types.js';

export interface ProposeRosterInput {
  term: string;
  courseId: string;
  peopleSoft: PeopleSoftRow[];
  canvasUsers: CanvasUser[];
  /** LLM for major normalization, or null to passthrough. */
  llm: LlmClient | null;
  aliases: Record<string, string>;
}

/**
 * Read-only proposal: match -> assign pseudonyms (computed, not persisted) -> normalize
 * majors -> assemble report. Reads the vault but writes nothing.
 */
export async function proposeRoster(input: ProposeRosterInput): Promise<ProposalReport> {
  const vault = loadVault();
  const vaultIdx = indexByStudentNumber(vault);

  const match = matchStudents(input.peopleSoft, input.canvasUsers);
  const { assignments } = assignPseudonyms(match.matched, vault, input.term);
  const assignBySn = new Map(assignments.map((a) => [a.studentNumber, a]));

  const collisions: VaultCollision[] = [];
  for (const ms of match.matched) {
    const c = detectCollision(vaultIdx, ms.ps.studentNumber, ms.canvas.canvasId);
    if (c) collisions.push(c);
  }

  const { map: majorMap, llmUsed } = await normalizeMajors(
    match.matched.map((m) => m.ps.rawMajor), input.llm, input.aliases,
  );

  const warnings: string[] = [];
  if (
    input.canvasUsers.length > 0 &&
    !input.canvasUsers.some((u) => u.sisUserId) &&
    !input.canvasUsers.some((u) => u.loginId)
  ) {
    warnings.push(
      'No Canvas user carried a sis_user_id or login_id, so matching could use only email and name. ' +
      'If match coverage looks low, verify your Canvas token can read SIS ids / logins.',
    );
  }

  const rows: ProposalRow[] = match.matched.map((ms) => {
    const a = assignBySn.get(ms.ps.studentNumber)!;
    const raw = ms.ps.rawMajor.trim();
    return {
      studentNumber: ms.ps.studentNumber,
      canvasId: ms.canvas.canvasId,
      pseudonym: a.pseudonym,
      returning: a.returning,
      matchedOn: ms.matchedOn,
      rawMajor: raw,
      canonicalMajor: raw ? (majorMap[raw] ?? raw) : '',
      secondMajor: ms.ps.secondMajor,
    };
  });

  return {
    term: input.term,
    courseId: input.courseId,
    rows,
    ambiguous: match.ambiguous,
    unmatchedPeopleSoft: match.unmatchedPeopleSoft,
    unmatchedCanvas: match.unmatchedCanvas,
    majorMap,
    collisions,
    llmUsed,
    warnings,
  };
}
