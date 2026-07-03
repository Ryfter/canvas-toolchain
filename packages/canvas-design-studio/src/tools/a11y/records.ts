/**
 * Per-course-project accessibility records under <courseDir>/.a11y/:
 * acknowledgments.json (append-only audit trail) and review-queue.json
 * (the "near the edge" human-review worklist). Spec §3 + §5.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AcknowledgmentRecord {
  at: string;                   // ISO timestamp
  page: string;                 // page title or filename
  canvasUrl?: string;
  tier: 'borderline' | 'fail';
  scIds: string[];              // empty for borderline-only acknowledgments
  requiredLevel: string;        // e.g. "WCAG 2.1 AA"
}

export interface ReviewQueueReason {
  sc: string;
  detail: string;
  /** measured/required for measurable criteria (contrast); drives worst-first sorting. */
  marginRatio?: number;
}

export interface ReviewQueueEntry {
  page: string;
  canvasUrl?: string;
  reasons: ReviewQueueReason[];
  lastCheckedAt: string;        // YYYY-MM-DD
  status: 'open' | 'reviewed-by-human';
  resolvedAt?: string;
  note?: string;
}

const A11Y_DIR = '.a11y';
const ACK_FILE = 'acknowledgments.json';
const QUEUE_FILE = 'review-queue.json';

function ensureA11yPath(courseDir: string, file: string): string {
  const dir = join(courseDir, A11Y_DIR);
  mkdirSync(dir, { recursive: true });
  return join(dir, file);
}

/** Audit files are never clobbered: a corrupt one is renamed aside and reading starts fresh. */
function readJsonArray<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (Array.isArray(parsed)) return parsed as T[];
  } catch { /* fall through to quarantine */ }
  renameSync(path, `${path}.corrupt-${Date.now()}`);
  return [];
}

function writeJsonArray(path: string, value: unknown[]): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export function appendAcknowledgment(courseDir: string, record: AcknowledgmentRecord): void {
  const path = ensureA11yPath(courseDir, ACK_FILE);
  const records = readJsonArray<AcknowledgmentRecord>(path);
  records.push(record);
  writeJsonArray(path, records);
}

export function loadAcknowledgments(courseDir: string): AcknowledgmentRecord[] {
  return readJsonArray<AcknowledgmentRecord>(join(courseDir, A11Y_DIR, ACK_FILE));
}

export function loadReviewQueue(courseDir: string): ReviewQueueEntry[] {
  return readJsonArray<ReviewQueueEntry>(join(courseDir, A11Y_DIR, QUEUE_FILE));
}

function saveReviewQueue(courseDir: string, entries: ReviewQueueEntry[]): void {
  writeJsonArray(ensureA11yPath(courseDir, QUEUE_FILE), entries);
}

/** Add or refresh a page's entry. Always reopens — fresh findings supersede an old human review. */
export function upsertReviewEntry(courseDir: string, entry: Omit<ReviewQueueEntry, 'status'>): void {
  const queue = loadReviewQueue(courseDir);
  const next: ReviewQueueEntry = { ...entry, status: 'open' };
  const index = queue.findIndex(e => e.page === entry.page);
  if (index >= 0) queue[index] = next;
  else queue.push(next);
  saveReviewQueue(courseDir, queue);
}

/** Remove a page's entry after a clean re-check. No-op when absent. */
export function clearReviewEntryIfClean(courseDir: string, page: string): void {
  const queue = loadReviewQueue(courseDir);
  const next = queue.filter(e => e.page !== page);
  if (next.length !== queue.length) saveReviewQueue(courseDir, next);
}

/** Mark an entry human-reviewed. Returns false when the page has no entry. */
export function resolveReviewEntry(courseDir: string, page: string, note?: string): boolean {
  const queue = loadReviewQueue(courseDir);
  const entry = queue.find(e => e.page === page);
  if (!entry) return false;
  entry.status = 'reviewed-by-human';
  entry.resolvedAt = new Date().toISOString();
  if (note) entry.note = note;
  saveReviewQueue(courseDir, queue);
  return true;
}

/** Worst first: lowest margin ratio, marginless entries after, ties by page name. */
export function sortWorstFirst(entries: ReviewQueueEntry[]): ReviewQueueEntry[] {
  const minRatio = (e: ReviewQueueEntry): number =>
    Math.min(...e.reasons.map(r => r.marginRatio ?? Number.POSITIVE_INFINITY));
  return [...entries].sort((a, b) => (minRatio(a) - minRatio(b)) || a.page.localeCompare(b.page));
}
