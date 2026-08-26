import type { ShellFinding, ShellQuizCallout, ShellReadinessReport, ShellResolvedWeek } from './types.js';
import type { ShellGraph } from './fetch_graph.js';

export function collectQuizCallouts(
  graph: ShellGraph,
  primary: ShellResolvedWeek,
  secondary: ShellResolvedWeek,
): ShellQuizCallout[] {
  const out: ShellQuizCallout[] = [];
  for (const week of [primary, secondary]) {
    // Classic Quizzes API ids only — module item type "Quiz" contentId.
    // Do NOT add assignment.id for isQuiz rows (assignment id ≠ quiz id).
    const quizIds = new Set<number>();
    for (const mod of graph.modules) {
      if (!week.moduleIds.includes(mod.id)) continue;
      for (const item of mod.items) {
        if (/^quiz$/i.test(item.type.trim()) && item.contentId != null) {
          quizIds.add(item.contentId);
        }
      }
    }
    if (quizIds.size > 0) {
      out.push({
        weekRole: week.role,
        weekIndex: week.index,
        quizIds: [...quizIds],
        hint: `Run validate_quiz({ courseId, quizId }) for these Classic Quiz ids (validate-first; generate_quiz is separate).`,
      });
    }
  }
  return out;
}

const SEV_ORDER = { blocking: 0, warning: 1, suggestion: 2 } as const;

export function sortFindings(findings: ShellFinding[]): ShellFinding[] {
  return [...findings].sort((a, b) => {
    const band = (a.weekRole === 'primary' ? 0 : 1) - (b.weekRole === 'primary' ? 0 : 1);
    if (band !== 0) return band;
    const sev = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.pack.localeCompare(b.pack);
  });
}

export function formatShellReportMarkdown(report: ShellReadinessReport): string {
  const lines: string[] = [
    `## Shell readiness (${report.trigger}): ${report.courseName}`,
    `asOfDate ${report.asOfDate} · framing: hybrid week map · source: live Canvas`,
    `Weekly preference: ${report.preference.enabled ? 'enabled' : 'disabled'} · day: ${report.preference.day ?? '—'}`,
  ];
  if (report.cadenceNote) lines.push(report.cadenceNote);
  lines.push(
    `Week resolution: ${report.weekResolution.inferredWeekCount} inferred, ${report.weekResolution.overrideWeekCount} override · termStartMonday ${report.weekResolution.termStartMonday}`,
    '',
    `### Primary week (thorough) — Week ${report.primaryWeek.index} · ${report.primaryWeek.monday}→${report.primaryWeek.sunday} · provenance: ${report.primaryWeek.provenance}`,
  );
  const primary = report.findings.filter(f => f.weekRole === 'primary');
  appendFindings(lines, primary);
  lines.push(
    '',
    `### Secondary week (lighter) — Week ${report.secondaryWeek.index} · ${report.secondaryWeek.monday}→${report.secondaryWeek.sunday} · provenance: ${report.secondaryWeek.provenance}`,
  );
  appendFindings(lines, report.findings.filter(f => f.weekRole === 'secondary'));
  lines.push('', '### Quizzes (call-out)');
  if (report.quizCallouts.length === 0) {
    lines.push('- None in primary/secondary weeks.');
  } else {
    for (const c of report.quizCallouts) {
      lines.push(`- Week ${c.weekIndex} (${c.weekRole}): quiz ids [${c.quizIds.join(', ')}] — ${c.hint}`);
    }
  }
  lines.push(
    '',
    '### Next steps',
    '- Fix primary-week blocking items before that Monday.',
    '- Re-run on your weekly day (or anytime manually).',
    '- For quiz content QC: validate_quiz (sibling tool; validate-first).',
  );
  return lines.join('\n');
}

function appendFindings(lines: string[], findings: ShellFinding[]): void {
  const blocking = findings.filter(f => f.severity === 'blocking');
  const warnings = findings.filter(f => f.severity === 'warning');
  const suggestions = findings.filter(f => f.severity === 'suggestion');
  if (blocking.length) {
    lines.push('#### Blocking');
    blocking.forEach((f, i) => lines.push(`${i + 1}. ${f.message}`));
  }
  if (warnings.length) {
    lines.push('#### Warnings');
    warnings.forEach((f, i) => lines.push(`${i + 1}. ${f.message}`));
  }
  if (suggestions.length) {
    lines.push('#### Suggestions');
    suggestions.forEach((f, i) => lines.push(`${i + 1}. ${f.message}`));
  }
  if (!findings.length) lines.push('- No findings.');
}
