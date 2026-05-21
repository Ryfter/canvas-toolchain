import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCoursePath } from '../kb/course_state.js';
import type { CourseId } from '../types.js';

export interface GenerateIdeasFileInput {
  courseId: CourseId;
  usageNotes?: string;
}

export interface GenerateIdeasFileResult {
  courseId: CourseId;
  ideasPath: string;
}

const DEFERRED_TOOLS = [
  'generate_recommended_outline',
  'draft_assignment_brief',
  'import_previous_shell',
  'shift_dates',
  'update_examples',
  'export_course_folder',
];

export function generateIdeasFile(input: GenerateIdeasFileInput): GenerateIdeasFileResult {
  const usageSection = input.usageNotes
    ? `## Usage notes from this run\n\n${input.usageNotes}\n\n`
    : '';

  const content =
    `# Curriculum Intelligence — Follow-on Ideas\n\n` +
    `*Generated after v0.5/0.6 run. Use this file to scope the next milestone.*\n\n` +
    usageSection +
    `## Deferred v1 scope\n\n` +
    `These capabilities were explicitly out of scope for v0.5/0.6. Build them once you have ` +
    `real usage data from the tools above.\n\n` +
    DEFERRED_TOOLS.map((t) => `- \`${t}\``).join('\n') +
    `\n\n` +
    `## Architecture follow-ons\n\n` +
    `- **Second-brain TopicSource** — add a \`SecondBrainSource\` adapter once that app ships.\n` +
    `- **Local LLM OllamaAdapter** — slot into \`LlmClient\` when you want to A/B against Anthropic.\n` +
    `- **Model routing harness** — route across Gemini / Claude / Grok / local based on task.\n\n` +
    `## Suggested next prompts for Claude\n\n` +
    `After running the full pipeline on real ITM 370 data, ask Claude:\n\n` +
    `1. "Based on the off-syllabus report and quote bank, what topics is the lecture actually ` +
    `spending time on that aren't in the syllabus?"\n` +
    `2. "Using the diff and currency scores, draft a recommended module sequence for next semester."\n` +
    `3. "Which assignments from the diff could be reused verbatim vs. need an update?"\n`;

  const ideasPath = join(getCoursePath(input.courseId), 'ideas.md');
  writeFileSync(ideasPath, content, 'utf-8');

  return { courseId: input.courseId, ideasPath };
}
