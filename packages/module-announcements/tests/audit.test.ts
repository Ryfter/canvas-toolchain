import { describe, it, expect } from 'vitest';
import { classifyAnnouncements, type AnnouncementRow } from '../src/audit.js';

const NOW = Date.parse('2026-08-20T12:00:00Z'); // e.g. start of a fall term

function ann(overrides: Partial<AnnouncementRow>): AnnouncementRow {
  return { id: 1, title: 'Welcome', message: '<p>Hi</p>', posted_at: null, delayed_post_at: null, ...overrides };
}

describe('classifyAnnouncements', () => {
  it('flags a scheduled announcement whose fire date already passed as stale', () => {
    const rows = [ann({ id: 10, delayed_post_at: '2026-05-01T09:00:00Z' })]; // spring date after a course copy
    const res = classifyAnnouncements(rows, NOW);
    expect(res.stale).toHaveLength(1);
    expect(res.stale[0].reason).toContain('already passed');
  });
  it('flags a fire date outside the given term window', () => {
    const rows = [ann({ id: 11, delayed_post_at: '2027-03-01T09:00:00Z' })];
    const res = classifyAnnouncements(rows, NOW, { termStart: '2026-08-15T00:00:00Z', termEnd: '2026-12-20T00:00:00Z' });
    expect(res.stale[0].reason).toContain('outside');
  });
  it('a future in-term scheduled announcement is ok', () => {
    const rows = [ann({ id: 12, delayed_post_at: '2026-09-01T09:00:00Z' })];
    const res = classifyAnnouncements(rows, NOW, { termStart: '2026-08-15T00:00:00Z', termEnd: '2026-12-20T00:00:00Z' });
    expect(res.stale).toHaveLength(0);
    expect(res.ok).toHaveLength(1);
  });
  it('already-posted announcements (no delayed_post_at) are reported ok, never stale', () => {
    const rows = [ann({ id: 13, posted_at: '2026-08-18T09:00:00Z' })];
    const res = classifyAnnouncements(rows, NOW);
    expect(res.stale).toHaveLength(0);
  });
  it('flags an unparseable delayed_post_at as stale instead of silently passing', () => {
    const rows = [ann({ id: 14, delayed_post_at: 'not-a-date' })];
    const res = classifyAnnouncements(rows, NOW);
    expect(res.stale).toHaveLength(1);
    expect(res.stale[0].reason).toContain('could not be parsed');
  });
});
