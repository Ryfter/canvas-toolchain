import type {
  PaCanvasUser, PeerAssessmentRow, IncompleteStudent, UngroupedStudent, DuplicateEmail,
} from './types.js';
import type { ResolvedMember } from './join/resolve.js';

const REQUIRED: Array<{ key: keyof PeerAssessmentRow; label: string }> = [
  { key: 'team', label: 'Team' },
  { key: 'loginId', label: 'Login ID' },
  { key: 'email', label: 'Email' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'studentId', label: 'Student ID #' },
];

/** Grouped students missing any required column after fallback, with the blank column labels. */
export function findIncomplete(resolved: ResolvedMember[]): IncompleteStudent[] {
  const out: IncompleteStudent[] = [];
  for (const { member, row } of resolved) {
    const missing = REQUIRED.filter((f) => !row[f.key].trim()).map((f) => f.label);
    if (missing.length) out.push({ name: member.name, canvasId: member.canvasId, missing });
  }
  return out;
}

/** Enrolled students who are in no group in the named set (they won't appear in the file). */
export function findUngrouped(allStudents: PaCanvasUser[], grouped: ResolvedMember[]): UngroupedStudent[] {
  const inGroup = new Set(grouped.map((r) => r.member.canvasId));
  return allStudents
    .filter((s) => !inGroup.has(s.canvasId))
    .map((s) => ({ name: s.name, canvasId: s.canvasId }));
}

/** Emails shared by more than one output row (PeerAssessment.com keys on email). */
export function findDuplicateEmails(resolved: ResolvedMember[]): DuplicateEmail[] {
  const byEmail = new Map<string, string[]>();
  for (const { member, row } of resolved) {
    const e = row.email.trim().toLowerCase();
    if (!e) continue;
    byEmail.set(e, [...(byEmail.get(e) ?? []), member.name]);
  }
  const out: DuplicateEmail[] = [];
  for (const [email, names] of byEmail) if (names.length > 1) out.push({ email, names });
  return out;
}
