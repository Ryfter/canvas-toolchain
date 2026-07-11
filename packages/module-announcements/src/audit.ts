export interface AnnouncementRow {
  id: number;
  title: string;
  message: string;
  posted_at: string | null;
  delayed_post_at: string | null;
}

export interface StaleFinding {
  id: number;
  title: string;
  delayedPostAt: string;
  reason: string;
}

export interface AuditResult {
  stale: StaleFinding[];
  ok: Array<{ id: number; title: string; delayedPostAt: string | null }>;
}

export interface TermWindow { termStart?: string; termEnd?: string }

/** Pure classification. An announcement is stale when it is SCHEDULED (delayed_post_at set)
 *  and its fire date already passed, or falls outside the given term window —
 *  the classic symptom of a course copy keeping last term's dates. */
export function classifyAnnouncements(
  rows: AnnouncementRow[],
  nowMs: number,
  term: TermWindow = {},
): AuditResult {
  const stale: StaleFinding[] = [];
  const ok: AuditResult['ok'] = [];
  for (const row of rows) {
    if (!row.delayed_post_at) {
      ok.push({ id: row.id, title: row.title, delayedPostAt: null });
      continue;
    }
    const fire = Date.parse(row.delayed_post_at);
    let reason: string | null = null;
    if (!Number.isNaN(fire) && fire < nowMs) {
      reason = `fire date ${row.delayed_post_at} has already passed`;
    } else if (term.termStart && fire < Date.parse(term.termStart)) {
      reason = `fire date ${row.delayed_post_at} is outside the term (before ${term.termStart})`;
    } else if (term.termEnd && fire > Date.parse(term.termEnd)) {
      reason = `fire date ${row.delayed_post_at} is outside the term (after ${term.termEnd})`;
    }
    if (reason) stale.push({ id: row.id, title: row.title, delayedPostAt: row.delayed_post_at, reason });
    else ok.push({ id: row.id, title: row.title, delayedPostAt: row.delayed_post_at });
  }
  return { stale, ok };
}
