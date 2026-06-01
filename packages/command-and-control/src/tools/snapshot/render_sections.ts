import type { CourseSnapshot, SectionId } from './types.js';

/** Wrap content in the auto-managed marker pair. Used both at first-write and
 *  on re-run. The id matches the section name; HTML comments are invisible in
 *  rendered markdown but trivially regex-able for re-runs. */
export function wrapSection(id: SectionId, content: string): string {
  return `<!-- AUTO:start id="${id}" -->\n${content.trim()}\n<!-- AUTO:end -->`;
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function renderIdentifiers(snap: CourseSnapshot, hostBase: string): string {
  const c = snap.course;
  return [
    '| Field | Value |',
    '|---|---|',
    `| Canvas course title | ${escapeTableCell(c.title)} |`,
    `| Canvas course ID | **${c.id}** |`,
    `| Canvas course URL | ${hostBase}/courses/${c.id} |`,
    `| Course code | ${escapeTableCell(c.courseCode) || '—'} |`,
    `| Term | ${escapeTableCell(c.termName ?? '—')} |`,
    `| Workflow state | ${escapeTableCell(c.workflowState)} |`,
    `| Course start | ${fmtDate(c.startAt)} |`,
    `| Course end | ${fmtDate(c.endAt)} |`,
  ].join('\n');
}

export function renderAssignmentGroups(snap: CourseSnapshot): string {
  if (snap.assignmentGroups.length === 0) return '_No assignment groups in this course._';
  const lines = [
    '| Pos | Group | Group ID | Published | Unpublished |',
    '|---|---|---|---|---|',
  ];
  for (const g of snap.assignmentGroups) {
    lines.push(
      `| ${g.position} | ${escapeTableCell(g.name)} | ${g.id} | ${g.publishedCount} | ${g.unpublishedCount} |`,
    );
  }
  return lines.join('\n');
}

export function renderModules(snap: CourseSnapshot): string {
  if (snap.modules.length === 0) return '_No modules in this course._';
  const lines = [
    '| Pos | Module | Items | Content types |',
    '|---|---|---|---|',
  ];
  for (const m of snap.modules) {
    const types = m.itemTypes.length > 0 ? m.itemTypes.join(', ') : '—';
    lines.push(`| ${m.position} | ${escapeTableCell(m.name)} | ${m.itemCount} | ${escapeTableCell(types)} |`);
  }
  return lines.join('\n');
}

export interface UpdateLogRow {
  date: string;
  semester: string;
  what: string;
  by: string;
}

/** Render the Update Log table given a fixed list of rows in newest-first order.
 *  Snapshot composer is responsible for ordering / inserting new rows. */
export function renderUpdateLog(rows: UpdateLogRow[]): string {
  const lines = [
    '| Date | Semester | What changed | By |',
    '|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.date} | ${escapeTableCell(r.semester)} | ${escapeTableCell(r.what)} | ${escapeTableCell(r.by)} |`,
    );
  }
  return lines.join('\n');
}
