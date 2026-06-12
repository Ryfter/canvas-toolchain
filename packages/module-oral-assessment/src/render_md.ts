import type { AssessmentSpec } from './provider.js';

export interface PageFrontMatterOptions {
  week?: number;
  title?: string;
  launchUrl?: string | null;
  aiasLevel?: number;
}

export function renderOralAssessmentMarkdown(spec: AssessmentSpec, fm: PageFrontMatterOptions): string {
  const title = (fm.title ?? spec.title).replace(/"/g, '\\"');
  const lines: string[] = ['---'];
  if (typeof fm.week === 'number') lines.push(`week: ${fm.week}`);
  lines.push(`title: "${title}"`);
  lines.push('hero_image: ""');
  lines.push(`prep_seconds: ${spec.prepSeconds}`);
  lines.push(`response_seconds: ${spec.responseSeconds}`);
  lines.push(`randomize_pick: ${spec.randomization.pick}`);
  lines.push(`randomize_of: ${spec.randomization.of}`);
  lines.push(`attempts: "${spec.attempts}"`);
  if (fm.launchUrl) lines.push(`launch_url: "${fm.launchUrl}"`);
  if (typeof fm.aiasLevel === 'number') lines.push(`aiasLevel: ${fm.aiasLevel}`);
  lines.push('---', '');

  lines.push('## What to expect', '', spec.promptSummary, '');
  lines.push('## Rubric', '');
  spec.rubricCriteria.forEach((c, i) => {
    lines.push(`## Criterion ${i + 1}: ${c.name} — ${c.points} pts`, '', c.description, '');
  });
  return lines.join('\n');
}
