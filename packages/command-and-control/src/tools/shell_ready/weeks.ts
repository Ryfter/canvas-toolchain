import type {
  CourseWeekResolved,
  ShellResolvedWeek,
  ShellWeekMapOverride,
  ShellWeekResolutionSummary,
  ShellWeekProvenance,
} from './types.js';
import { WEEK_TITLE_PATTERN, WEEK_TITLE_RE } from './types.js';

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${ymd}`);
  return { y, m, d };
}

/** Add days to YYYY-MM-DD (UTC date-only arithmetic). */
export function addDaysYmd(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function weekBoundsFromTermStart(termStartMonday: string, index: number): { monday: string; sunday: string } {
  const monday = addDaysYmd(termStartMonday, (index - 1) * 7);
  const sunday = addDaysYmd(monday, 6);
  return { monday, sunday };
}

/** 1-based week index containing asOfDate given termStartMonday. */
export function weekIndexContaining(termStartMonday: string, asOfDate: string): number {
  const { y: y0, m: m0, d: d0 } = parseYmd(termStartMonday);
  const { y: y1, m: m1, d: d1 } = parseYmd(asOfDate);
  const start = Date.UTC(y0, m0 - 1, d0);
  const asOf = Date.UTC(y1, m1 - 1, d1);
  const diffDays = Math.floor((asOf - start) / 86_400_000);
  if (diffDays < 0) return 1;
  return Math.floor(diffDays / 7) + 1;
}

function ensureWeek(
  map: Map<number, CourseWeekResolved>,
  index: number,
  termStartMonday: string,
  provenance: ShellWeekProvenance,
  label?: string,
): CourseWeekResolved {
  let w = map.get(index);
  if (!w) {
    const bounds = weekBoundsFromTermStart(termStartMonday, index);
    w = {
      index,
      label: label ?? `Week ${index}`,
      monday: bounds.monday,
      sunday: bounds.sunday,
      moduleIds: [],
      provenance,
    };
    map.set(index, w);
  }
  return w;
}

export function resolveCourseWeeks(input: {
  termStartMonday: string;
  modules: Array<{ id: number; name: string }>;
  overrides?: ShellWeekMapOverride[];
}): { weeks: CourseWeekResolved[]; summary: ShellWeekResolutionSummary } {
  const { termStartMonday, modules, overrides = [] } = input;
  const map = new Map<number, CourseWeekResolved>();
  const notes: string[] = [];
  let inferredWeekCount = 0;

  for (const mod of modules) {
    const m = mod.name.match(WEEK_TITLE_RE);
    if (!m) continue;
    const index = Number(m[1]);
    if (!Number.isFinite(index) || index < 1) continue;
    const w = ensureWeek(map, index, termStartMonday, 'inferred');
    if (w.provenance === 'inferred' && !w.moduleIds.includes(mod.id)) {
      w.moduleIds.push(mod.id);
    }
  }
  inferredWeekCount = [...map.values()].filter(w => w.provenance === 'inferred').length;

  for (const ov of overrides) {
    const bounds = ov.monday && ov.sunday
      ? { monday: ov.monday, sunday: ov.sunday }
      : weekBoundsFromTermStart(termStartMonday, ov.index);
    map.set(ov.index, {
      index: ov.index,
      label: ov.label ?? `Week ${ov.index}`,
      monday: bounds.monday,
      sunday: bounds.sunday,
      moduleIds: [...(ov.moduleIds ?? [])],
      provenance: 'override',
    });
  }

  if (map.size === 0) {
    notes.push('no modules matched Week N titles');
  }

  const weeks = [...map.values()].sort((a, b) => a.index - b.index);
  const overrideWeekCount = weeks.filter(w => w.provenance === 'override').length;

  return {
    weeks,
    summary: {
      termStartMonday,
      method: 'hybrid',
      inferredWeekCount,
      overrideWeekCount,
      inferencePattern: WEEK_TITLE_PATTERN,
      notes: notes.length ? notes : undefined,
    },
  };
}

export function resolveSpotCheckWeeks(input: {
  termStartMonday: string;
  asOfDate: string;
  courseWeeks: CourseWeekResolved[];
}): {
  currentWeekIndex: number;
  primaryWeek: ShellResolvedWeek;
  secondaryWeek: ShellResolvedWeek;
} {
  const currentWeekIndex = weekIndexContaining(input.termStartMonday, input.asOfDate);
  const secondaryIndex = currentWeekIndex + 1;
  const primaryIndex = currentWeekIndex + 2;

  const byIndex = new Map(input.courseWeeks.map(w => [w.index, w]));

  function toResolved(index: number, role: 'primary' | 'secondary', depth: 'thorough' | 'lighter'): ShellResolvedWeek {
    const existing = byIndex.get(index);
    const bounds = existing
      ? { monday: existing.monday, sunday: existing.sunday }
      : weekBoundsFromTermStart(input.termStartMonday, index);
    return {
      role,
      depth,
      index,
      label: existing?.label ?? `Week ${index}`,
      monday: bounds.monday,
      sunday: bounds.sunday,
      moduleIds: existing?.moduleIds ?? [],
      provenance: existing?.provenance ?? 'inferred',
    };
  }

  return {
    currentWeekIndex,
    secondaryWeek: toResolved(secondaryIndex, 'secondary', 'lighter'),
    primaryWeek: toResolved(primaryIndex, 'primary', 'thorough'),
  };
}
