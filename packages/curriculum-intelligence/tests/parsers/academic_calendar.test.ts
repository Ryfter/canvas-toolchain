import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCalendarHtml, inferCalendarFromPattern } from '../../src/parsers/academic_calendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXAMPLE_HTML = readFileSync(join(__dirname, '..', 'fixtures', 'academic-calendar-example.html'), 'utf-8');

describe('parseCalendarHtml', () => {
  test('extracts classesBegin', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').classesBegin).toBe('2026-08-24');
  });

  test('extracts classesEnd', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').classesEnd).toBe('2026-12-11');
  });

  test('extracts finals as date range', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').finals).toEqual({
      start: '2026-12-14',
      end: '2026-12-18',
    });
  });

  test('extracts dead week as date range', () => {
    expect(parseCalendarHtml(EXAMPLE_HTML, 'Fall2026').deadWeek).toEqual({
      start: '2026-12-07',
      end: '2026-12-11',
    });
  });

  test('extracts multi-day Thanksgiving break', () => {
    const cal = parseCalendarHtml(EXAMPLE_HTML, 'Fall2026');
    const t = cal.breaks.find((b) => b.name === 'Thanksgiving Break');
    expect(t).toEqual({ name: 'Thanksgiving Break', start: '2026-11-23', end: '2026-11-27' });
  });

  test('extracts single-day Labor Day break', () => {
    const cal = parseCalendarHtml(EXAMPLE_HTML, 'Fall2026');
    const ld = cal.breaks.find((b) => b.name === 'Labor Day');
    expect(ld).toEqual({ name: 'Labor Day', start: '2026-09-07', end: '2026-09-07' });
  });

  test('source is "url" and partial is false when all required fields found', () => {
    const cal = parseCalendarHtml(EXAMPLE_HTML, 'Fall2026');
    expect(cal.source).toBe('url');
    expect(cal.partial).toBe(false);
  });

  test('returns partial:true with missing list for unrecognized page', () => {
    const cal = parseCalendarHtml('<html><body><p>No dates here</p></body></html>', 'Fall2026');
    expect(cal.partial).toBe(true);
    expect(cal.missing).toContain('classesBegin');
    expect(cal.missing).toContain('classesEnd');
  });
});

describe('inferCalendarFromPattern', () => {
  test('Fall2026 yields classesBegin in late August 2026', () => {
    const cal = inferCalendarFromPattern('Fall2026');
    expect(cal.classesBegin.startsWith('2026-08')).toBe(true);
    expect(cal.source).toBe('pattern');
    expect(cal.partial).toBe(false);
  });

  test('Spring2027 yields classesBegin in January 2027', () => {
    const cal = inferCalendarFromPattern('Spring2027');
    expect(cal.classesBegin.startsWith('2027-01')).toBe(true);
  });

  test('throws for unrecognized semesterId format', () => {
    expect(() => inferCalendarFromPattern('Autumn2026')).toThrow();
  });
});
