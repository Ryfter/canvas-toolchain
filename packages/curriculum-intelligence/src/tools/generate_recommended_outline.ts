import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSemesterPath } from '../kb/course_state.js';
import { loadPlanConfig, getNextPlanPath } from '../kb/next_plan.js';
import { loadTopicMap } from '../kb/topic_map.js';
import type { CourseId, SemesterId } from '../types.js';

export interface GenerateRecommendedOutlineInput {
  courseId: CourseId;
  semesterId: SemesterId;
}

export interface OutlineTopic {
  week: number;
  module: string;
  verdict: string;
  notes: string;
}

export interface GenerateRecommendedOutlineResult {
  courseId: CourseId;
  semesterId: SemesterId;
  outlinePath: string;
  topics: OutlineTopic[];
  warning?: string;
}

interface CurrencyReportTopic {
  topic: string;
  verdict: string;
  currencyClass: string;
  newsHits: number;
  semestersSince: number;
}

interface CurrencyReport {
  topics: CurrencyReportTopic[];
}

export function generateRecommendedOutline(
  input: GenerateRecommendedOutlineInput
): GenerateRecommendedOutlineResult {
  const { courseId, semesterId } = input;
  const planConfig = loadPlanConfig(courseId, semesterId);
  const sourceSemesterId = planConfig.sourceSemesterId;
  const sourceTopicMap = loadTopicMap(courseId, sourceSemesterId);
  const sourceSemDir = getSemesterPath(courseId, sourceSemesterId);

  const reportPath = join(sourceSemDir, 'currency-report.json');
  let report: CurrencyReport | null = null;
  let warning: string | undefined;
  if (existsSync(reportPath)) {
    report = JSON.parse(readFileSync(reportPath, 'utf-8')) as CurrencyReport;
  } else {
    warning = 'No currency-report.json found for source semester. Run recommend_for_topic for richer output. Outline generated from module structure only.';
  }

  const verdictByModule = new Map<string, CurrencyReportTopic>();
  if (report) {
    for (const t of report.topics) {
      verdictByModule.set(t.topic.toLowerCase(), t);
    }
  }

  const topics: OutlineTopic[] = sourceTopicMap.modules.map((mod) => {
    const key = mod.name.toLowerCase();
    const match = verdictByModule.get(key);
    const verdict = match?.verdict ?? 'UPDATE';
    const notes = match
      ? `newsHits=${match.newsHits}, semestersSince=${match.semestersSince}`
      : '—';
    return { week: mod.position, module: mod.name, verdict, notes };
  });

  const header = '| Week | Module | Verdict | Notes |\n|------|--------|---------|-------|\n';
  const rows = topics
    .map((t) => `| ${String(t.week).padStart(2, '0')} | ${t.module} | ${t.verdict} | ${t.notes} |`)
    .join('\n');
  const outline = `# Recommended Outline — ${semesterId}\n\n${header}${rows}\n`;

  const outlinePath = join(getNextPlanPath(courseId, semesterId), 'plan-outline.md');
  writeFileSync(outlinePath, outline, 'utf-8');

  return { courseId, semesterId, outlinePath, topics, ...(warning ? { warning } : {}) };
}
