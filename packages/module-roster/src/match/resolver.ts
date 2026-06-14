import type {
  CanvasUser, MatchKey, MatchResult, MatchedStudent, PeopleSoftRow,
} from '../types.js';

/** Normalize a name for comparison: lowercase, collapse whitespace, reorder "Last, First". */
export function normalizeName(name: string): string {
  let s = name.trim();
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2);
    s = `${first.trim()} ${last.trim()}`;
  }
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

const lc = (s: string | undefined): string => (s ?? '').trim().toLowerCase();

/**
 * Match each PeopleSoft row to at most one Canvas user, trying keys in priority order:
 * student_number -> email -> userId -> name. A Canvas user is consumed by the first
 * PeopleSoft row that claims it. A name that maps to >1 remaining Canvas user is ambiguous.
 */
export function matchStudents(ps: PeopleSoftRow[], canvas: CanvasUser[]): MatchResult {
  const used = new Set<string>();                       // canvasIds already claimed
  const matched: MatchedStudent[] = [];
  const ambiguous: MatchResult['ambiguous'] = [];
  const unmatchedPeopleSoft: PeopleSoftRow[] = [];

  // Build lookup indexes over Canvas users.
  const bySis = new Map<string, CanvasUser>();
  const byEmail = new Map<string, CanvasUser>();
  const byLogin = new Map<string, CanvasUser>();
  const byName = new Map<string, CanvasUser[]>();
  for (const u of canvas) {
    if (u.sisUserId) bySis.set(lc(u.sisUserId), u);
    if (u.email) byEmail.set(lc(u.email), u);
    if (u.loginId) byLogin.set(lc(u.loginId), u);
    const n = normalizeName(u.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), u]);
  }

  const claim = (row: PeopleSoftRow, u: CanvasUser, key: MatchKey): boolean => {
    if (used.has(u.canvasId)) return false;
    used.add(u.canvasId);
    matched.push({ ps: row, canvas: u, matchedOn: key });
    return true;
  };

  for (const row of ps) {
    const sis = bySis.get(lc(row.studentNumber));
    if (row.studentNumber && sis && claim(row, sis, 'student_number')) continue;

    const em = byEmail.get(lc(row.email));
    if (row.email && em && claim(row, em, 'email')) continue;

    const lg = byLogin.get(lc(row.userId));
    if (row.userId && lg && claim(row, lg, 'userId')) continue;

    const nameKey = normalizeName(row.name);
    const candidates = (byName.get(nameKey) ?? []).filter((u) => !used.has(u.canvasId));
    if (candidates.length === 1 && claim(row, candidates[0], 'name')) continue;
    if (candidates.length > 1) { ambiguous.push({ ps: row, candidates }); continue; }

    unmatchedPeopleSoft.push(row);
  }

  const unmatchedCanvas = canvas.filter((u) => !used.has(u.canvasId));
  return { matched, ambiguous, unmatchedPeopleSoft, unmatchedCanvas };
}
