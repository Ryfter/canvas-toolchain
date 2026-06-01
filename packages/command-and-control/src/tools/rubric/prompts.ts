import type { DraftStudentRubricInput } from './types.js';

export const SYSTEM_PROMPT = `You are helping a college instructor turn a faculty-facing rubric into a student-facing one.

Faculty rubrics are written to justify grades. Students need rubrics written to guide work. Your job is to bridge that gap.

For each criterion in the faculty rubric, produce:
1. **studentFacing** — A plain-English explanation in language a student new to the topic can act on. Avoid jargon. Specifically describe what the work needs to LOOK LIKE or DO to satisfy this criterion, not just abstract qualities. Aim for 2–4 short sentences.
2. **workedExample** — A concrete, specific example of what full-credit work looks like for this criterion. Use specific values, cell references, sentence patterns, or step-by-step description. Imagine you're showing a student "do it like this." 2–4 sentences.
3. **facultyFacing** — Reproduce the ORIGINAL faculty rubric language for this criterion VERBATIM. Do not paraphrase. This block exists so the student rewrite stays synchronized with the official rubric.

If the faculty rubric does not specify point values per criterion, divide the total evenly. If points are unspecified entirely, default to a 100-point scale.

Return ONLY a valid JSON object — no prose before or after — of the shape:

{
  "criteria": [
    {
      "number": "1",
      "name": "Brief criterion name (3-6 words)",
      "points": 30,
      "studentFacing": "...",
      "workedExample": "...",
      "facultyFacing": "..."
    }
  ]
}

Use the criterion numbering from the source if present, otherwise number them 1, 2, 3, … in source order.`;

export function buildUserPrompt(input: DraftStudentRubricInput): string {
  const parts: string[] = [];
  parts.push('FACULTY RUBRIC:');
  parts.push('---');
  parts.push(input.facultyRubricText.trim());
  parts.push('---');
  if (input.assignmentBrief) {
    parts.push('\nASSIGNMENT BRIEF (for grounding worked examples in concrete task language):');
    parts.push('---');
    parts.push(input.assignmentBrief.trim());
    parts.push('---');
  }
  if (input.courseContext) {
    parts.push('\nCOURSE CONTEXT (for tailoring student-facing tone):');
    parts.push('---');
    parts.push(input.courseContext.trim());
    parts.push('---');
  }
  if (typeof input.totalPoints === 'number') {
    parts.push(`\nTotal points for this assignment: ${input.totalPoints}. Distribute among criteria.`);
  }
  parts.push('\nReturn the JSON object now. No prose, no markdown fence — just the JSON object starting with `{`.');
  return parts.join('\n');
}
