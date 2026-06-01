import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fetchCourseSnapshot } from '../snapshot/fetch_snapshot.js';
import { parseExistingSnapshot } from '../snapshot/parse_existing.js';
import { composeSnapshot } from '../snapshot/compose.js';
import { loadCanvasConfig } from '../setup_canvas.js';
import type { SnapshotInput, SnapshotResult, CourseSnapshot } from '../snapshot/types.js';
import type { UpdateLogRow } from '../snapshot/render_sections.js';

export interface SnapshotCourseTestHooks {
  /** Inject a pre-fetched CourseSnapshot, skipping the Canvas API call. Used by tests. */
  fetchSnapshot?: () => Promise<CourseSnapshot>;
  /** Override the host base URL embedded in the Identifiers table.
   *  Production reads cfg.host from canvas-config.json. */
  hostBase?: string;
}

/** Write or update a course reference markdown doc.
 *
 *  Behavior:
 *  - If outputPath doesn't exist → writes a fresh doc with auto-managed
 *    sections inside HTML-comment marker pairs and scaffold prose between
 *    them. Update Log starts with a single "Initial snapshot" row.
 *  - If outputPath exists → reads it, regenerates ONLY the content between
 *    `<!-- AUTO:start id="..." -->` ... `<!-- AUTO:end -->` markers, and
 *    prepends a new row to the Update Log table. Any prose outside markers
 *    is preserved verbatim.
 *
 *  Missing required sections (a user deleted one) are appended at the
 *  bottom of the file rather than silently lost.
 */
export async function snapshotCourse(
  input: SnapshotInput,
  hooks: SnapshotCourseTestHooks = {},
): Promise<SnapshotResult> {
  const outputPath = resolve(input.outputPath);
  const firstRun = !existsSync(outputPath);

  // 1. Fetch current Canvas state (or use test injection)
  const snapshot = hooks.fetchSnapshot
    ? await hooks.fetchSnapshot()
    : await fetchCourseSnapshot(input.courseId);

  // 2. Determine host base for URL composition
  let hostBase = hooks.hostBase;
  if (!hostBase) {
    const cfg = loadCanvasConfig();
    hostBase = `https://${cfg.host}`;
  }

  // 3. Build the Update Log row (skipped only on first run with no existing context — composer
  //    will still emit a placeholder "Initial snapshot" row in that case).
  const now = input.now ?? new Date().toISOString();
  const newLogRow: UpdateLogRow = {
    date: now.slice(0, 10),
    semester: snapshot.course.termName ?? '—',
    what: firstRun
      ? 'Initial snapshot'
      : 'Course state refreshed via snapshot_course (diff summary TBD)',
    by: 'snapshot_course',
  };

  // 4. Parse existing if re-run
  const existing = firstRun ? undefined : parseExistingSnapshot(readFileSync(outputPath, 'utf-8'));

  // 5. Compose final markdown
  const finalContent = composeSnapshot({ snapshot, hostBase, existing, newLogRow });

  // 6. Write
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, finalContent, 'utf-8');

  // 7. Count managed sections in final output for the result summary
  const sectionsWritten = (finalContent.match(/<!--\s*AUTO:start/g) ?? []).length;

  return {
    outputPath,
    firstRun,
    sectionsWritten,
    updateLogAppended: !firstRun,
  };
}
