import type { RubricCriterionDraft } from './types.js';

interface RenderMarkdownInput {
  criteria: RubricCriterionDraft[];
  week?: number;
  title?: string;
  totalPoints?: number;
  assignmentNumber?: string;
}

/** Render criteria into the rubric markdown schema that CDS's renderRubric
 *  (in @canvas-toolchain/canvas-design-studio) consumes. Schema:
 *
 *    ---
 *    week: N
 *    title: "..."
 *    assignment_number: "..."
 *    points: N
 *    ---
 *
 *    ## Criterion 1: Name — N pts
 *
 *    **For students:**
 *    ...
 *
 *    **Worked example:**
 *    ...
 *
 *    **Faculty rubric language:**
 *    ...
 *
 *    [repeat per criterion]
 */
export function renderRubricMarkdown(input: RenderMarkdownInput): string {
  const { criteria, week, totalPoints, assignmentNumber } = input;
  const title = input.title
    ?? (assignmentNumber ? `Rubric — Assignment ${assignmentNumber}` : 'Rubric');

  const fm: string[] = ['---'];
  if (typeof week === 'number') fm.push(`week: ${week}`);
  fm.push(`title: "${title.replace(/"/g, '\\"')}"`);
  fm.push('hero_image: ""');
  if (assignmentNumber) fm.push(`assignment_number: "${assignmentNumber}"`);
  if (typeof totalPoints === 'number') fm.push(`points: ${totalPoints}`);
  fm.push('---');

  const body = criteria.map(c =>
    `## Criterion ${c.number}: ${c.name} — ${c.points} pts\n\n` +
    `**For students:**\n${c.studentFacing.trim()}\n\n` +
    `**Worked example:**\n${c.workedExample.trim()}\n\n` +
    `**Faculty rubric language:**\n${c.facultyFacing.trim()}\n`
  ).join('\n');

  const notes = `\n## Notes for students

Use this rubric to self-check your work BEFORE you submit. The "Worked example" sections under each criterion are the most reliable guide — if your work matches the worked-example pattern, you're on track.

You can also download this rubric as a markdown file (link at the top of the page) and paste it into ChatGPT, Claude, or any LLM along with your work for personalized help. Don't outsource your thinking — use the rubric as a starting point for a conversation about what to fix.
`;

  return [fm.join('\n'), '', body, notes].join('\n');
}
