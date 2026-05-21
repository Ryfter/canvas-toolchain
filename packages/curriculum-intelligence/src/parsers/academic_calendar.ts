import type { SemesterCalendar, BreakRange } from '../types.js';

const MONTH_MAP: Record<string, string> = {
  January: '01', February: '02', March: '03', April: '04',
  May: '05', June: '06', July: '07', August: '08',
  September: '09', October: '10', November: '11', December: '12',
};

function toIso(month: string, day: string | number, year: string | number): string {
  const m = MONTH_MAP[month];
  if (!m) throw new Error(`Unknown month: ${month}`);
  return `${year}-${m}-${String(day).padStart(2, '0')}`;
}

function extractSingleDate(text: string, patterns: string[]): string | undefined {
  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx === -1) continue;
    const nearby = text.slice(idx, idx + 250);
    const m = nearby.match(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})\b/
    );
    if (m) return toIso(m[1], m[2], m[3]);
  }
  return undefined;
}

function extractDateRange(text: string, patterns: string[]): { start: string; end: string } | undefined {
  const RANGE_RE =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})\b/g;
  const SINGLE_RE =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})\b/g;

  for (const p of patterns) {
    const idx = text.indexOf(p);
    if (idx === -1) continue;
    const nearby = text.slice(idx, idx + 300);

    // Find first occurrence of each pattern type and pick whichever starts earlier.
    RANGE_RE.lastIndex = 0;
    SINGLE_RE.lastIndex = 0;
    const rangeMatch = RANGE_RE.exec(nearby);
    const singleMatch = SINGLE_RE.exec(nearby);

    if (rangeMatch && (!singleMatch || rangeMatch.index <= singleMatch.index)) {
      return { start: toIso(rangeMatch[1], rangeMatch[2], rangeMatch[4]), end: toIso(rangeMatch[1], rangeMatch[3], rangeMatch[4]) };
    }
    if (singleMatch) {
      const d = toIso(singleMatch[1], singleMatch[2], singleMatch[3]);
      return { start: d, end: d };
    }
  }
  return undefined;
}

const BREAK_VOCAB: Array<{ name: string; patterns: string[] }> = [
  { name: 'Labor Day',                   patterns: ['Labor Day'] },
  { name: 'Fall Break',                  patterns: ['Fall Break'] },
  { name: 'Thanksgiving Break',          patterns: ['Thanksgiving Break', 'Thanksgiving'] },
  { name: 'Spring Break',               patterns: ['Spring Break'] },
  { name: 'Winter Break',               patterns: ['Winter Break', 'Winter Recess'] },
  { name: 'Martin Luther King Jr. Day', patterns: ['Martin Luther King', 'MLK Day'] },
  { name: 'Memorial Day',               patterns: ['Memorial Day'] },
  { name: "Presidents' Day",            patterns: ["Presidents' Day", "Presidents Day"] },
];

export function parseCalendarHtml(html: string, semesterId: string): SemesterCalendar {
  const missing: string[] = [];

  const classesBegin = extractSingleDate(html, [
    'Classes Begin', 'First Day of Classes', 'Instruction Begins', 'Classes begin',
  ]);
  if (!classesBegin) missing.push('classesBegin');

  const classesEnd = extractSingleDate(html, [
    'Last Day of Classes', 'End of Instruction', 'Classes end', 'Last day of classes',
  ]);
  if (!classesEnd) missing.push('classesEnd');

  const deadWeek = extractDateRange(html, ['Dead Week', 'dead week']);
  const finals = extractDateRange(html, ['Final Examinations', 'Finals Week', 'Final Exams']);

  const breaks: BreakRange[] = [];
  for (const { name, patterns } of BREAK_VOCAB) {
    const range = extractDateRange(html, patterns);
    if (range) breaks.push({ name, ...range });
  }

  const partial = missing.length > 0;
  return {
    semesterId,
    classesBegin: classesBegin ?? '',
    classesEnd: classesEnd ?? '',
    ...(deadWeek ? { deadWeek } : {}),
    ...(finals ? { finals } : {}),
    breaks,
    source: 'url',
    partial,
    ...(partial ? { missing } : {}),
  };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Returns YYYY-MM-DD of the Nth weekday (0=Sun … 6=Sat) in month (1-12) of year.
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  let count = 0;
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (true) {
    if (d.getUTCDay() === weekday) { count++; if (count === n) return d.toISOString().slice(0, 10); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function inferCalendarFromPattern(semesterId: string): SemesterCalendar {
  const m = semesterId.match(/^(Spring|Summer|Fall)(\d{4})$/i);
  if (!m) throw new Error(`Cannot infer calendar from "${semesterId}". Use format "Fall2026".`);
  const term = m[1].toLowerCase();
  const year = parseInt(m[2], 10);

  if (term === 'fall') {
    const classesBegin = nthWeekday(year, 8, 1, 4);   // 4th Monday of August
    const classesEnd = addDays(`${year}-12-01`, 10);   // ~Dec 11
    return {
      semesterId, classesBegin, classesEnd,
      finals: { start: addDays(classesEnd, 3), end: addDays(classesEnd, 7) },
      breaks: [
        { name: 'Labor Day', start: nthWeekday(year, 9, 1, 1), end: nthWeekday(year, 9, 1, 1) },
        { name: 'Thanksgiving Break', start: nthWeekday(year, 11, 4, 4), end: addDays(nthWeekday(year, 11, 4, 4), 3) },
      ],
      source: 'pattern', partial: false,
    };
  }

  if (term === 'spring') {
    const classesBegin = nthWeekday(year, 1, 1, 2);   // 2nd Monday of January
    const classesEnd = addDays(`${year}-04-28`, 5);    // ~first week of May
    return {
      semesterId, classesBegin, classesEnd,
      finals: { start: addDays(classesEnd, 3), end: addDays(classesEnd, 7) },
      breaks: [
        { name: 'Spring Break', start: addDays(classesBegin, 49), end: addDays(classesBegin, 55) },
      ],
      source: 'pattern', partial: false,
    };
  }

  // Summer — minimal
  return {
    semesterId,
    classesBegin: `${year}-05-18`,
    classesEnd: `${year}-08-07`,
    breaks: [],
    source: 'pattern', partial: false,
  };
}
