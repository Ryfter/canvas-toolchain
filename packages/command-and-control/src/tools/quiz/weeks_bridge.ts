/**
 * Thin bridge to shell-owned week helpers.
 * Canonical implementation: `src/tools/shell_ready/weeks.ts` (shell claim).
 * Do not fork title-regex / override-merge logic here.
 */
import { addDaysYmd, weekBoundsFromTermStart } from '../shell_ready/weeks.js';

export { addDaysYmd, weekBoundsFromTermStart };

/** Inclusive Mon–Sun window from weekStartMonday (YYYY-MM-DD). */
export function mondaySundayWindow(weekStartMonday: string): { monday: string; sunday: string } {
  const monday = weekStartMonday.slice(0, 10);
  return { monday, sunday: addDaysYmd(monday, 6) };
}

/** True if ISO datetime/date falls on calendar day within Mon–Sun window (UTC date). */
export function dateInWeekWindow(iso: string | null | undefined, weekStartMonday: string): boolean {
  if (!iso) return true; // missing dates are not a week-map mismatch here
  const day = iso.slice(0, 10);
  const { monday, sunday } = mondaySundayWindow(weekStartMonday);
  return day >= monday && day <= sunday;
}
