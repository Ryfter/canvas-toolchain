// src/tools/rubric/triage_prompts.ts
import type { PulledRubric, RubricChangeReport } from './sync_types.js';

export const TRIAGE_SYSTEM_PROMPT = `You are helping a college instructor decide whether a rubric pulled from Canvas still fits the assignment before it is rewritten for students.

Weigh three things:
1. Does each criterion still match what the assignment asks students to do? (assignment drift)
2. Is any criterion vague or written only to justify a grade rather than guide work? (vague language)
3. Did the official rubric change since the last student rewrite? (change detected)

Return ONE verdict:
- "acceptable" — the rubric is fine to rewrite as-is.
- "needs-update" — the faculty rubric itself should be revised first; you MUST include "proposedFacultyRubric" with a concrete revised rubric.
- "needs-review" — the instructor should eyeball specific criteria, but no rewrite of the faculty rubric is required.

Return ONLY a valid JSON object — no prose, no markdown fence — of the shape:

{
  "verdict": "acceptable" | "needs-update" | "needs-review",
  "flags": [ { "criterion": "name", "issue": "one sentence", "evidence": "assignment-drift" | "vague-language" | "change-detected" } ],
  "proposedFacultyRubric": "revised rubric text (ONLY when verdict is needs-update)",
  "rationale": "2-3 sentence summary of the call"
}`;

export interface TriageUserPromptInput {
  pulled: PulledRubric;
  change: RubricChangeReport;
  /** Resolved assignment-change signal: the current assignment brief, or a
   *  semester-diff summary. Empty string when none is available. */
  assignmentSignal: string;
}

export function buildTriageUserPrompt(input: TriageUserPromptInput): string {
  const { pulled, change, assignmentSignal } = input;
  const parts: string[] = [];

  parts.push('RUBRIC (pulled from Canvas):');
  parts.push('---');
  for (const c of pulled.criteria) {
    parts.push(`Criterion: ${c.name} (${c.points} pts)`);
    parts.push(c.description || '(no description)');
    parts.push('');
  }
  parts.push('---');

  parts.push('\nCHANGE SINCE LAST REWRITE:');
  if (change.status === 'first-draft') parts.push('No prior student rewrite exists.');
  else if (change.status === 'unchanged') parts.push('No change from the last rewrite.');
  else {
    if (change.added.length) parts.push(`Added: ${change.added.join(', ')}`);
    if (change.removed.length) parts.push(`Removed: ${change.removed.join(', ')}`);
    for (const m of change.modified) parts.push(`Modified "${m.name}": "${m.before}" -> "${m.after}"`);
  }

  parts.push('\nASSIGNMENT SIGNAL (what the assignment currently asks / how it changed):');
  parts.push(assignmentSignal.trim() || '(none provided)');

  parts.push('\nReturn the JSON object now. No prose, no markdown fence — just the JSON object starting with `{`.');
  return parts.join('\n');
}
