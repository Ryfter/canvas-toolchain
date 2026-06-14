import type {
  PaCanvasUser, PeerAssessmentRow, IncompleteStudent, UngroupedStudent, DuplicateEmail, MultiGroupedStudent,
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

/** Emails shared by more than one DISTINCT student (different canvas_ids). A single student in
 *  two groups is NOT a duplicate email — that is reported separately by findMultiGrouped. */
export function findDuplicateEmails(resolved: ResolvedMember[]): DuplicateEmail[] {
  const byEmail = new Map<string, Map<string, string>>(); // email -> (canvasId -> name)
  for (const { member, row } of resolved) {
    const e = row.email.trim().toLowerCase();
    if (!e) continue;
    const people = byEmail.get(e) ?? new Map<string, string>();
    people.set(member.canvasId, member.name);
    byEmail.set(e, people);
  }
  const out: DuplicateEmail[] = [];
  for (const [email, people] of byEmail) {
    if (people.size > 1) out.push({ email, names: [...people.values()] });
  }
  return out;
}

/** Students (by canvas_id) appearing in more than one group of the set — produces duplicate
 *  rows in the upload file (PeerAssessment.com keys on email), so the professor must resolve it. */
export function findMultiGrouped(resolved: ResolvedMember[]): MultiGroupedStudent[] {
  const byId = new Map<string, { name: string; teams: string[] }>();
  for (const { member, row } of resolved) {
    const entry = byId.get(member.canvasId) ?? { name: member.name, teams: [] };
    if (!entry.teams.includes(row.team)) entry.teams.push(row.team);
    byId.set(member.canvasId, entry);
  }
  const out: MultiGroupedStudent[] = [];
  for (const [canvasId, { name, teams }] of byId) {
    if (teams.length > 1) out.push({ canvasId, name, teams });
  }
  return out;
}
