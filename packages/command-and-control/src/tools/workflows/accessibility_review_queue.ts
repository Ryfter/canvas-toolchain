import { existsSync } from 'node:fs';
import {
  loadReviewQueue, resolveReviewEntry, sortWorstFirst,
  type ReviewQueueEntry,
} from 'canvas-design-mcp/dist/tools/a11y/records.js';

export interface AccessibilityReviewQueueInput {
  courseDir: string;
  action?: 'list' | 'resolve';
  page?: string;
  note?: string;
}

export interface AccessibilityReviewQueueResult {
  courseDir: string;
  open: number;
  reviewed: number;
  text: string;
  error?: string;
  fix?: string[];
}

function formatEntry(entry: ReviewQueueEntry, index: number): string {
  const lines = [`${index + 1}. ${entry.page}${entry.canvasUrl ? ` — ${entry.canvasUrl}` : ''}`];
  for (const r of entry.reasons) {
    const pct = r.marginRatio !== undefined ? ` (${Math.round(r.marginRatio * 100)}% of threshold)` : '';
    lines.push(`   • ${r.sc}: ${r.detail}${pct}`);
  }
  lines.push(`   last checked ${entry.lastCheckedAt}`);
  return lines.join('\n');
}

/** The "near the edge" worklist (spec §5): pages a human should verify with real eyes.
 *  The professor is the final arbiter — resolving records their judgment. */
export async function accessibilityReviewQueue(
  input: AccessibilityReviewQueueInput
): Promise<AccessibilityReviewQueueResult> {
  const base = { courseDir: input.courseDir, open: 0, reviewed: 0, text: '' };
  if (!existsSync(input.courseDir)) {
    return {
      ...base, error: 'COURSE_DIR_NOT_FOUND',
      text: `Course project folder not found: ${input.courseDir}`,
      fix: ['Pass the course project folder that contains course-config.md (and the .a11y/ records).'],
    };
  }

  if (input.action === 'resolve') {
    if (!input.page) {
      return { ...base, error: 'PAGE_REQUIRED', text: 'action: "resolve" needs a page.', fix: ['Pass the page exactly as listed by action: "list".'] };
    }
    if (!resolveReviewEntry(input.courseDir, input.page, input.note)) {
      return { ...base, error: 'PAGE_NOT_IN_QUEUE', text: `No queue entry for ${input.page}.`, fix: ['Run action: "list" to see current entries.'] };
    }
  }

  const queue = loadReviewQueue(input.courseDir);
  const open = sortWorstFirst(queue.filter(e => e.status === 'open'));
  const reviewed = queue.filter(e => e.status === 'reviewed-by-human');

  const lines: string[] = [`Accessibility review queue — ${open.length} open, ${reviewed.length} reviewed`];
  if (input.action === 'resolve') lines.push(`✓ ${input.page} marked reviewed-by-human.`);
  if (open.length === 0) {
    lines.push('', 'The queue is empty — nothing is waiting on human eyes.');
  } else {
    lines.push('', 'Open the URL in your logged-in browser and double-check with human eyes', '(free deep checks: WAVE browser extension, or MS Accessibility Insights — https://accessibilityinsights.io/downloads/):', '');
    lines.push(...open.map(formatEntry));
    lines.push('', 'Mark one done: accessibility_review_queue with action: "resolve", page: "<page>", note: "<what you verified>".');
  }

  return { courseDir: input.courseDir, open: open.length, reviewed: reviewed.length, text: lines.join('\n') };
}
