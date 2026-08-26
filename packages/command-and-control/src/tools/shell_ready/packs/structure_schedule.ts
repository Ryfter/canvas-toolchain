import type { ShellFinding, ShellResolvedWeek } from '../types.js';
import type { ShellGraph, ShellGraphModule } from '../fetch_graph.js';

function ymdFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

export function dateInWeekWindow(ymd: string | null, week: ShellResolvedWeek): boolean {
  if (!ymd) return false;
  return ymd >= week.monday && ymd <= week.sunday;
}

export function runStructurePack(
  graph: ShellGraph,
  week: ShellResolvedWeek,
  modules: ShellGraphModule[],
): ShellFinding[] {
  const out: ShellFinding[] = [];
  const depth = week.depth;
  const weekRole = week.role;

  if (!graph.hasFrontPage && week.role === 'primary') {
    out.push({
      id: 'no-front-page',
      pack: 'structure',
      severity: 'warning',
      message: 'Course has no front page set.',
      weekRole,
      depth,
    });
  }

  for (const mod of modules) {
    if (mod.items.length === 0) {
      out.push({
        id: `empty-module:${mod.id}`,
        pack: 'structure',
        severity: 'warning',
        message: `Empty module "${mod.name}" in Week ${week.index}.`,
        weekRole,
        depth,
        weekIndex: week.index,
        moduleId: mod.id,
        moduleName: mod.name,
        weekProvenance: week.provenance,
      });
    }
    if (!mod.published) {
      out.push({
        id: `unpublished-module:${mod.id}`,
        pack: 'structure',
        severity: 'warning',
        message: `Module "${mod.name}" is unpublished but in the Week ${week.index} scope.`,
        weekRole,
        depth,
        weekIndex: week.index,
        moduleId: mod.id,
        moduleName: mod.name,
        weekProvenance: week.provenance,
      });
    }
    for (const item of mod.items) {
      if (item.published && !mod.published) {
        out.push({
          id: `ghost-item:${mod.id}:${item.id}`,
          pack: 'structure',
          severity: 'blocking',
          message: `Ghost item: published "${item.title}" inside unpublished module "${mod.name}" (invisible to students).`,
          weekRole,
          depth,
          weekIndex: week.index,
          moduleId: mod.id,
          moduleName: mod.name,
          itemId: item.id,
          itemTitle: item.title,
          weekProvenance: week.provenance,
        });
      }
    }
  }

  return out;
}

export function runSchedulePack(
  graph: ShellGraph,
  week: ShellResolvedWeek,
  assignmentIds: Set<number>,
): ShellFinding[] {
  const out: ShellFinding[] = [];
  for (const a of graph.assignments) {
    if (!assignmentIds.has(a.id) && !dateInWeekWindow(ymdFromIso(a.dueAt), week)
      && !dateInWeekWindow(ymdFromIso(a.unlockAt), week)
      && !dateInWeekWindow(ymdFromIso(a.lockAt), week)) {
      continue;
    }
    const inScope = assignmentIds.has(a.id)
      || dateInWeekWindow(ymdFromIso(a.dueAt), week)
      || dateInWeekWindow(ymdFromIso(a.unlockAt), week)
      || dateInWeekWindow(ymdFromIso(a.lockAt), week);
    if (!inScope) continue;

    if ((a.pointsPossible ?? 0) > 0 && !a.dueAt) {
      out.push({
        id: `missing-due:${a.id}`,
        pack: 'schedule',
        severity: 'blocking',
        message: `Graded item "${a.name}" in Week ${week.index} scope has no due_at.`,
        weekRole: week.role,
        depth: week.depth,
        weekIndex: week.index,
        itemId: a.id,
        itemTitle: a.name,
        url: a.htmlUrl,
        canvasDates: { due_at: a.dueAt, unlock_at: a.unlockAt, lock_at: a.lockAt },
      });
    }
    if (a.lockAt && a.dueAt && a.lockAt < a.dueAt) {
      out.push({
        id: `lock-before-due:${a.id}`,
        pack: 'schedule',
        severity: 'warning',
        message: `"${a.name}" lock_at is before due_at.`,
        weekRole: week.role,
        depth: week.depth,
        weekIndex: week.index,
        itemId: a.id,
        itemTitle: a.name,
        canvasDates: { due_at: a.dueAt, unlock_at: a.unlockAt, lock_at: a.lockAt },
      });
    }
  }
  return out;
}

export function runMismatchPack(
  week: ShellResolvedWeek,
  graph: ShellGraph,
  mappedAssignmentIds: Set<number>,
): ShellFinding[] {
  const out: ShellFinding[] = [];
  for (const a of graph.assignments) {
    if (!mappedAssignmentIds.has(a.id)) continue;
    const dates = [a.dueAt, a.unlockAt, a.lockAt].map(ymdFromIso).filter(Boolean) as string[];
    if (dates.length === 0) continue;
    const anyOutside = dates.some(d => !dateInWeekWindow(d, week));
    if (anyOutside) {
      out.push({
        id: `mismatch-dates:${a.id}:w${week.index}`,
        pack: 'mismatch',
        severity: 'warning',
        message: `"${a.name}" is mapped to Week ${week.index} (${week.monday}→${week.sunday}) but Canvas dates fall outside that window.`,
        weekRole: week.role,
        depth: week.depth,
        weekIndex: week.index,
        itemId: a.id,
        itemTitle: a.name,
        weekProvenance: week.provenance,
        canvasDates: { due_at: a.dueAt, unlock_at: a.unlockAt, lock_at: a.lockAt },
      });
    }
  }

  // Orphans: dated in window but not on map
  for (const a of graph.assignments) {
    if (mappedAssignmentIds.has(a.id)) continue;
    const due = ymdFromIso(a.dueAt);
    if (due && dateInWeekWindow(due, week)) {
      out.push({
        id: `orphan-dated:${a.id}:w${week.index}`,
        pack: 'mismatch',
        severity: 'suggestion',
        message: `"${a.name}" has due_at in Week ${week.index} window but is not on the week map.`,
        weekRole: week.role,
        depth: week.depth,
        weekIndex: week.index,
        itemId: a.id,
        itemTitle: a.name,
        canvasDates: { due_at: a.dueAt, unlock_at: a.unlockAt, lock_at: a.lockAt },
      });
    }
  }
  return out;
}
