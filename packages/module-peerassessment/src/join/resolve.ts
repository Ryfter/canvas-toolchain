import { splitName } from '../name.js';
import type { PaGroup, PaCanvasUser, PeerAssessmentRow } from '../types.js';
import type { PeopleSoftRow } from '@canvas-toolchain/module-roster';

export interface ResolveSources {
  /** canvas_id -> student_number, from the roster vault. */
  vaultIndex: Map<string, string>;
  /** student_number -> PeopleSoft row, or null when unavailable. */
  peopleSoftIndex: Map<string, PeopleSoftRow> | null;
}

/** A member paired with its resolved output row (the report needs the member identity). */
export interface ResolvedMember {
  member: PaCanvasUser;
  row: PeerAssessmentRow;
}

/** Build one output row for a member: Canvas-first, then vault/PeopleSoft fallback. */
export function resolveRow(team: string, m: PaCanvasUser, src: ResolveSources): PeerAssessmentRow {
  const studentNumber = src.vaultIndex.get(m.canvasId);
  const ps = studentNumber && src.peopleSoftIndex ? src.peopleSoftIndex.get(studentNumber) : undefined;

  const email = m.email || ps?.email || '';
  const loginId = m.loginId || ps?.userId || '';
  const studentId = m.sisUserId || studentNumber || ps?.studentNumber || '';

  let { firstName, lastName } = splitName(m.sortableName || m.name || '');
  if (!firstName && !lastName && ps?.name) ({ firstName, lastName } = splitName(ps.name));

  return { team, loginId, email, firstName, lastName, studentId };
}

/** Flatten all groups into resolved rows, preserving group order then member order. */
export function resolveMembers(groups: PaGroup[], src: ResolveSources): ResolvedMember[] {
  const out: ResolvedMember[] = [];
  for (const g of groups) {
    for (const m of g.members) out.push({ member: m, row: resolveRow(g.name, m, src) });
  }
  return out;
}
