import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runConformanceCheck } from 'canvas-design-mcp/dist/tools/a11y/conformance.js';
import { upsertReviewEntry, clearReviewEntryIfClean, loadReviewQueue } from 'canvas-design-mcp/dist/tools/a11y/records.js';
import type { ConformanceReport } from '@canvas-toolchain/shared-types';

export interface AuditCourseAccessibilityInput {
  courseDir: string;
  /** Where generated HTML lives. Defaults to <courseDir>/output (generate_course's default). */
  outputDir?: string;
}

export interface AuditCourseAccessibilityResult {
  courseDir: string;
  pages: number;
  pass: number;
  borderline: number;
  fail: number;
  queueOpen: number;
  text: string;
  error?: string;
  fix?: string[];
}

function walkHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkHtmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function queueReasons(report: ConformanceReport) {
  return report.findings.map(f => ({
    sc: f.sc,
    detail: `${f.scName}: ${f.message}`,
    ...(f.margin && { marginRatio: f.margin.measured / f.margin.required }),
  }));
}

/** The between-semesters "regular check" (spec §5): full engine stack over every
 *  generated page, one course-level summary, review queue refreshed. */
export async function auditCourseAccessibility(
  input: AuditCourseAccessibilityInput
): Promise<AuditCourseAccessibilityResult> {
  const base = { courseDir: input.courseDir, pages: 0, pass: 0, borderline: 0, fail: 0, queueOpen: 0, text: '' };
  const outDir = input.outputDir ?? join(input.courseDir, 'output');
  if (!existsSync(outDir)) {
    return {
      ...base, error: 'NO_GENERATED_OUTPUT',
      text: `No generated HTML found at ${outDir}.`,
      fix: ['Run generate_course first, or pass outputDir pointing at the generated HTML.'],
    };
  }

  const files = walkHtmlFiles(outDir);
  const counts = { pass: 0, borderline: 0, fail: 0 };
  const perPage: Array<{ page: string; verdict: ConformanceReport['verdict']; findings: number }> = [];

  for (const file of files) {
    const page = relative(outDir, file).split('\\').join('/');
    const report = await runConformanceCheck(readFileSync(file, 'utf-8'));
    counts[report.verdict] += 1;
    perPage.push({ page, verdict: report.verdict, findings: report.findings.length });
    if (report.verdict === 'pass') {
      clearReviewEntryIfClean(input.courseDir, page);
    } else {
      upsertReviewEntry(input.courseDir, {
        page,
        reasons: queueReasons(report),
        lastCheckedAt: new Date().toISOString().slice(0, 10),
      });
    }
  }

  const queueOpen = loadReviewQueue(input.courseDir).filter(e => e.status === 'open').length;
  const icon = { pass: '✓', borderline: '⚠', fail: '✗' } as const;
  const worstFirst = [...perPage].sort((a, b) =>
    (a.verdict === b.verdict ? b.findings - a.findings : a.verdict === 'fail' ? -1 : b.verdict === 'fail' ? 1 : a.verdict === 'borderline' ? -1 : 1));

  const lines = [
    `Course accessibility audit — ${files.length} page(s) against WCAG 2.1 AA (checked with WCAG 2.2 rules)`,
    `✓ pass: ${counts.pass}   ⚠ borderline: ${counts.borderline}   ✗ fail: ${counts.fail}`,
    '',
    ...worstFirst.map(p => `${icon[p.verdict]} ${p.page} — ${p.verdict}${p.findings > 0 ? ` (${p.findings} finding(s))` : ''}`),
    '',
    `Review queue: ${queueOpen} open entr${queueOpen === 1 ? 'y' : 'ies'}. Walk it with accessibility_review_queue — the professor is the final arbiter.`,
  ];

  return {
    courseDir: input.courseDir, pages: files.length,
    pass: counts.pass, borderline: counts.borderline, fail: counts.fail,
    queueOpen, text: lines.join('\n'),
  };
}
