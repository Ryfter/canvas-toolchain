import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LlmClient } from '@canvas-toolchain/shared-llm';
import { parseFrontMatter } from '../../lib/front_matter.js';
import { loadInstitutionConfig, type InstitutionConfigBridge } from '../publish/canvas_config_bridge.js';
import type {
  CheckShellReadinessInput,
  ShellFinding,
  ShellFindingPack,
  ShellReadinessReport,
  ShellResolvedWeek,
  ShellRunTrigger,
  ShellWeekMapOverride,
} from '../shell_ready/types.js';
import { loadSpotCheckPreference } from '../shell_ready/spot_check_preference.js';
import { resolveCourseWeeks, resolveSpotCheckWeeks } from '../shell_ready/weeks.js';
import { fetchShellGraph, type ShellGraph, type ShellGraphPage } from '../shell_ready/fetch_graph.js';
import {
  runMismatchPack,
  runSchedulePack,
  runStructurePack,
} from '../shell_ready/packs/structure_schedule.js';
import { runInstructionsPack, runLinksPack } from '../shell_ready/packs/links_instructions.js';
import { collectQuizCallouts, formatShellReportMarkdown, sortFindings } from '../shell_ready/format_report.js';

export interface CheckShellReadinessDeps {
  loadCfg?: () => InstitutionConfigBridge;
  fetchGraph?: (courseId: number, deps: { cfg: InstitutionConfigBridge; fetchFn?: typeof fetch }) => Promise<ShellGraph>;
  fetchFn?: typeof fetch;
  loadPreference?: typeof loadSpotCheckPreference;
  llm?: LlmClient;
  nowYmd?: () => string;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse Hybrid C week fields from course-config.md front matter. */
export function readCourseConfigWeekFields(courseDir: string): {
  termStartMonday?: string;
  weekMapOverrides?: ShellWeekMapOverride[];
} {
  const path = join(courseDir, 'course-config.md');
  if (!existsSync(path)) return {};
  const text = readFileSync(path, 'utf-8');
  const { data } = parseFrontMatter(text);
  const termStartMonday =
    typeof data.termStartMonday === 'string' ? data.termStartMonday.trim() : undefined;

  let weekMapOverrides: ShellWeekMapOverride[] | undefined;
  if (Array.isArray(data.weekMapOverrides)) {
    weekMapOverrides = [];
    for (const raw of data.weekMapOverrides) {
      if (!raw || typeof raw !== 'object') continue;
      const o = raw as Record<string, unknown>;
      const index = typeof o.index === 'number' ? o.index : Number(o.index);
      if (!Number.isFinite(index) || index < 1) continue;
      const entry: ShellWeekMapOverride = { index };
      if (typeof o.label === 'string') entry.label = o.label;
      if (typeof o.monday === 'string') entry.monday = o.monday;
      if (typeof o.sunday === 'string') entry.sunday = o.sunday;
      if (Array.isArray(o.moduleIds)) {
        entry.moduleIds = o.moduleIds
          .map((id) => (typeof id === 'number' ? id : Number(id)))
          .filter((id) => Number.isFinite(id));
      }
      weekMapOverrides.push(entry);
    }
    if (weekMapOverrides.length === 0) weekMapOverrides = undefined;
  }

  return { termStartMonday, weekMapOverrides };
}

/** Pages attached to modules in the resolved week (by Page/WikiPage item title). */
function pagesForWeek(graph: ShellGraph, week: ShellResolvedWeek): ShellGraphPage[] {
  const titles = new Set<string>();
  for (const mod of modulesForWeek(graph, week)) {
    for (const item of mod.items) {
      if (/page|wiki/i.test(item.type)) titles.add(item.title);
    }
  }
  return graph.pages.filter((p) => Boolean(p.body) && titles.has(p.title));
}

function countBySev(findings: ShellFinding[], role: 'primary' | 'secondary') {
  const f = findings.filter(x => x.weekRole === role);
  return {
    modules: 0,
    items: 0,
    blocking: f.filter(x => x.severity === 'blocking').length,
    warning: f.filter(x => x.severity === 'warning').length,
    suggestion: f.filter(x => x.severity === 'suggestion').length,
  };
}

function modulesForWeek(graph: ShellGraph, week: ShellResolvedWeek) {
  return graph.modules.filter(m => week.moduleIds.includes(m.id));
}

function assignmentIdsForModules(graph: ShellGraph, week: ShellResolvedWeek): Set<number> {
  const ids = new Set<number>();
  for (const mod of modulesForWeek(graph, week)) {
    for (const item of mod.items) {
      if (item.contentId != null && /assignment|quiz/i.test(item.type)) ids.add(item.contentId);
    }
  }
  return ids;
}

export type CheckShellReadinessResult =
  | ShellReadinessReport
  | { preview: true; message: string; fix: string[] }
  | { error: string; message: string; fix: string[] };

export async function checkShellReadiness(
  input: CheckShellReadinessInput,
  deps: CheckShellReadinessDeps = {},
): Promise<CheckShellReadinessResult> {
  if (input.senseCheck === 'llm' && !input.confirm) {
    return {
      preview: true,
      message: 'senseCheck:"llm" requires confirm:true (two-call gate). Heuristics run without confirm.',
      fix: ['Re-call check_shell_readiness with senseCheck:"llm" and confirm:true, or omit senseCheck for heuristics.'],
    };
  }

  const fromDir = input.courseDir ? readCourseConfigWeekFields(input.courseDir) : {};
  const termStartMonday = input.termStartMonday ?? fromDir.termStartMonday;
  if (!termStartMonday) {
    return {
      error: 'TERM_START_REQUIRED',
      message: 'termStartMonday is required (YYYY-MM-DD Week 1 Monday).',
      fix: [
        'Pass termStartMonday on check_shell_readiness, or set termStartMonday in course-config.md and pass courseDir.',
      ],
    };
  }

  const asOfDate = input.asOfDate ?? (deps.nowYmd ?? todayYmd)();
  const trigger: ShellRunTrigger = input.trigger ?? 'manual';
  const pref = (deps.loadPreference ?? loadSpotCheckPreference)();
  const preference = pref
    ? { configured: true, enabled: pref.weeklyCheckEnabled, day: pref.weeklyCheckDay }
    : { configured: false, enabled: false, day: null as null };

  let cadenceNote: string | undefined;
  if (pref?.weeklyCheckEnabled && pref.weeklyCheckDay) {
    const dow = new Date(`${asOfDate}T12:00:00Z`).getUTCDay();
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    if (names[dow] !== pref.weeklyCheckDay) {
      cadenceNote = `Weekly preference is ${pref.weeklyCheckDay}; this run is manual/off-day.`;
    }
  }

  // When tests inject fetchGraph, skip live Canvas credentials (same pattern as review_canvas_rubric).
  let cfg: InstitutionConfigBridge | undefined;
  if (!deps.fetchGraph || deps.loadCfg) {
    try {
      cfg = (deps.loadCfg ?? loadInstitutionConfig)();
    } catch (err) {
      if (!deps.fetchGraph) {
        return {
          error: 'CANVAS_NOT_CONFIGURED',
          message: err instanceof Error ? err.message : String(err),
          fix: ['Run setup_canvas with your Canvas host and API token.'],
        };
      }
    }
  }
  const canvasOrigin = cfg?.canvasUrl ?? 'https://example.instructure.com';

  let graph: ShellGraph;
  try {
    if (deps.fetchGraph) {
      graph = await deps.fetchGraph(Number(input.courseId), {
        cfg: cfg ?? { canvasUrl: canvasOrigin, apiToken: '' },
        fetchFn: deps.fetchFn,
      });
    } else {
      graph = await fetchShellGraph(Number(input.courseId), {
        cfg: cfg!,
        fetchFn: deps.fetchFn,
      });
    }
  } catch (err) {
    return {
      error: 'CANVAS_FETCH_FAILED',
      message: err instanceof Error ? err.message : String(err),
      fix: ['Check Canvas connectivity and courseId.', 'Confirm setup_canvas token still works.'],
    };
  }

  const overrides = [
    ...(fromDir.weekMapOverrides ?? []),
    ...(input.weekMapOverrides ?? []),
  ];
  const { weeks, summary: weekResolution } = resolveCourseWeeks({
    termStartMonday,
    modules: graph.modules.map(m => ({ id: m.id, name: m.name })),
    overrides,
  });
  const spot = resolveSpotCheckWeeks({ termStartMonday, asOfDate, courseWeeks: weeks });

  if (input.moduleIds?.length) {
    const target = input.forceWeekRole === 'secondary' ? spot.secondaryWeek : spot.primaryWeek;
    target.moduleIds = [...new Set([...target.moduleIds, ...input.moduleIds])];
  }

  const packs: ShellFindingPack[] = input.packs ?? ['structure', 'schedule', 'mismatch', 'links', 'instructions'];
  const findings: ShellFinding[] = [];
  let linksProbed = 0;

  for (const week of [spot.primaryWeek, spot.secondaryWeek]) {
    const mods = modulesForWeek(graph, week);
    const mappedAssignIds = assignmentIdsForModules(graph, week);

    if (packs.includes('structure')) findings.push(...runStructurePack(graph, week, mods));
    if (packs.includes('schedule')) findings.push(...runSchedulePack(graph, week, mappedAssignIds));
    if (packs.includes('mismatch')) findings.push(...runMismatchPack(week, graph, mappedAssignIds));

    if (packs.includes('instructions')) {
      const items = graph.assignments
        .filter(a => mappedAssignIds.has(a.id)
          || (a.dueAt && a.dueAt.slice(0, 10) >= week.monday && a.dueAt.slice(0, 10) <= week.sunday))
        .map(a => ({ id: a.id, title: a.name, body: a.description, points: a.pointsPossible }));
      const pageItems = pagesForWeek(graph, week)
        .map((p, i) => ({ id: 10_000 + i, title: p.title, body: p.body, points: 0 }));
      findings.push(...runInstructionsPack({
        week,
        items: week.depth === 'thorough' ? [...items, ...pageItems] : items.filter(i => !i.body || PLACEHOLDER_ONLY(i.body)),
      }));
    }

    if (packs.includes('links')) {
      const budget = week.role === 'primary'
        ? (input.linkProbeBudget ?? 100)
        : (input.secondaryLinkProbeBudget ?? 25);
      // Always scope to the resolved week — never all course pages (burns budget / mislabels findings).
      const htmlBodies = [
        ...graph.assignments
          .filter(a => mappedAssignIds.has(a.id) && a.description)
          .map(a => ({ id: `a${a.id}`, title: a.name, html: a.description! })),
        ...pagesForWeek(graph, week)
          .map(p => ({ id: `p-${p.url}`, title: p.title, html: p.body! })),
      ];
      // Secondary (lighter): assignment bodies only; primary includes in-week pages too.
      const bodies = week.depth === 'thorough'
        ? htmlBodies
        : htmlBodies.filter(b => b.id.startsWith('a'));
      const linkResult = await runLinksPack({
        week,
        htmlBodies: bodies,
        canvasOrigin,
        budget,
        fetchFn: deps.fetchFn,
      });
      findings.push(...linkResult.findings);
      linksProbed += linkResult.probed;
    }
  }

  const sorted = sortFindings(findings);
  const quizCallouts = collectQuizCallouts(graph, spot.primaryWeek, spot.secondaryWeek);
  const primarySummary = countBySev(sorted, 'primary');
  primarySummary.modules = spot.primaryWeek.moduleIds.length;
  primarySummary.items = modulesForWeek(graph, spot.primaryWeek).reduce((n, m) => n + m.items.length, 0);
  const secondarySummary = countBySev(sorted, 'secondary');
  secondarySummary.modules = spot.secondaryWeek.moduleIds.length;
  secondarySummary.items = modulesForWeek(graph, spot.secondaryWeek).reduce((n, m) => n + m.items.length, 0);

  const report: ShellReadinessReport = {
    courseId: graph.courseId,
    courseName: graph.courseName,
    source: 'live-canvas',
    framing: 'professor-week-map-hybrid',
    trigger,
    asOfDate,
    preference,
    cadenceNote,
    weekResolution,
    primaryWeek: spot.primaryWeek,
    secondaryWeek: spot.secondaryWeek,
    quizCallouts,
    summary: {
      primary: primarySummary,
      secondary: secondarySummary,
      mismatches: sorted.filter(f => f.pack === 'mismatch').length,
      linksProbed,
      packsRun: packs,
    },
    findings: sorted,
    text: '',
  };
  report.text = formatShellReportMarkdown(report);
  return report;
}

function PLACEHOLDER_ONLY(body: string): boolean {
  return /\b(TODO|TBD)\b/i.test(body) || body.trim().length === 0;
}
