import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TrajectoryEntry, TrajectoryFlag, Verdict } from '../types.js';
import type { CourseId } from '../types.js';
import { getCoursePath } from './course_state.js';

/**
 * Compute the trajectory flag for a topic given its chronological verdict history.
 * History is ordered oldest → newest. The most recent verdict (last element) is the current run.
 *
 * Flag rules (checked in this order — first match wins):
 *   - 1 verdict           → 'new'
 *   - last 4+ all KEEP    → 'true-evergreen'
 *   - last 4 with 2+ changes between adjacent pairs → 'unstable'
 *   - last 3 with exactly 1 change between adjacent pairs → 'stabilising'
 *   - last >=2 unchanged (and not true-evergreen) → 'stable'
 *   - fallback when <3 verdicts but a change is present → 'unstable'
 */
export function computeTrajectoryFlag(history: Verdict[]): TrajectoryFlag {
  if (history.length === 0) {
    throw new Error('computeTrajectoryFlag called with empty history');
  }
  if (history.length === 1) return 'new';

  const last4 = history.slice(-4);
  if (last4.length >= 4 && last4.every((v) => v === 'KEEP')) {
    return 'true-evergreen';
  }

  const changesInLast4 = countAdjacentChanges(last4);
  if (changesInLast4 >= 2) return 'unstable';

  const last3 = history.slice(-3);
  if (last3.length === 3 && countAdjacentChanges(last3) === 1) return 'stabilising';

  if (changesInLast4 === 0) return 'stable';
  return 'unstable';
}

function countAdjacentChanges(verdicts: Verdict[]): number {
  let n = 0;
  for (let i = 1; i < verdicts.length; i++) {
    if (verdicts[i] !== verdicts[i - 1]) n++;
  }
  return n;
}

/**
 * Compute the average fraction of topics whose verdict changes between adjacent runs.
 * Returns 0 for fewer than 2 entries.
 */
export function computeChurnRate(entries: TrajectoryEntry[]): number {
  if (entries.length < 2) return 0;

  const churnPerTransition: number[] = [];
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    const prevByTopic = new Map(prev.perAssignment.map((t) => [t.topic, t.verdict]));
    let changed = 0;
    let comparable = 0;
    for (const t of curr.perAssignment) {
      const before = prevByTopic.get(t.topic);
      if (before === undefined) continue;
      comparable++;
      if (before !== t.verdict) changed++;
    }
    if (comparable > 0) churnPerTransition.push(changed / comparable);
  }

  if (churnPerTransition.length === 0) return 0;
  return churnPerTransition.reduce((a, b) => a + b, 0) / churnPerTransition.length;
}

/** Topics whose verdict flipped >=2 times in the last 4 runs. Operates on perAssignment. */
export function identifyUnstableTopics(entries: TrajectoryEntry[]): string[] {
  if (entries.length === 0) return [];
  const latest = entries[entries.length - 1];
  return latest.perAssignment
    .filter((t) => computeTrajectoryFlag(t.verdictHistory) === 'unstable')
    .map((t) => t.topic);
}

/** Topics in true-evergreen state in the most recent entry. Operates on perAssignment. */
export function identifyTrueEvergreens(entries: TrajectoryEntry[]): string[] {
  if (entries.length === 0) return [];
  const latest = entries[entries.length - 1];
  return latest.perAssignment
    .filter((t) => computeTrajectoryFlag(t.verdictHistory) === 'true-evergreen')
    .map((t) => t.topic);
}

// ---------------------------------------------------------------------------
// JSONL persistence
// ---------------------------------------------------------------------------

export function getHistoryPath(courseId: CourseId): string {
  return join(getCoursePath(courseId), 'history.jsonl');
}

export function appendEntry(entry: TrajectoryEntry): void {
  const path = getHistoryPath(entry.courseId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
}

/** Pick the same-season prior semester (e.g., Fall2025 for Fall2026 input), if any. */
export function findSameSeasonPrior(currentSemesterId: string, allSemesters: string[]): string | null {
  const seasonMatch = currentSemesterId.match(/^([A-Za-z]+)(\d{4})$/);
  if (!seasonMatch) return null;
  const [, season, yearStr] = seasonMatch;
  const currentYear = parseInt(yearStr, 10);
  for (let y = currentYear - 1; y >= currentYear - 10; y--) {
    const candidate = `${season}${y}`;
    if (allSemesters.includes(candidate)) return candidate;
  }
  return null;
}

/** Pick the most recently registered semester strictly before `currentSemesterId`. */
export function findMostRecentPrior(
  currentSemesterId: string,
  registeredSemesters: { id: string; registeredAt: string }[],
): string | null {
  // Semesters are appended in registration order, so a later index means a later
  // registration. Two registrations inside the same millisecond compare equal on
  // registeredAt alone, which left the winner to the sort's tie handling — and
  // yielded the OLDEST semester, the opposite of the intent.
  const sorted = registeredSemesters
    .map((semester, index) => ({ semester, index }))
    .filter(({ semester }) => semester.id !== currentSemesterId)
    .sort(
      (a, b) =>
        b.semester.registeredAt.localeCompare(a.semester.registeredAt) || b.index - a.index,
    );
  return sorted[0]?.semester.id ?? null;
}

export function readEntries(courseId: CourseId, lookback?: number): TrajectoryEntry[] {
  let path: string;
  try {
    path = getHistoryPath(courseId);
  } catch {
    return [];
  }
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf-8');
  const entries: TrajectoryEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    entries.push(JSON.parse(trimmed) as TrajectoryEntry);
  }
  if (lookback !== undefined && lookback > 0) {
    return entries.slice(-lookback);
  }
  return entries;
}
