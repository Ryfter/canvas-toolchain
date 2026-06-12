import type { DesignOralAssessmentInput } from './design.js';

export const SYSTEM_PROMPT = [
  'You design short oral/video assessments for university courses.',
  'Return ONLY a JSON object (no prose, no code fences) with this exact shape:',
  '{',
  '  "title": string,',
  '  "promptSummary": string,            // one student-facing sentence',
  '  "questions": [{ "prompt": string }],// the randomization pool',
  '  "rubricCriteria": [{ "name": string, "description": string, "points": number }]',
  '}',
  'Write prompts a student answers by speaking on camera for 1-3 minutes.',
  'Favor prompts that require genuine understanding and are resistant to AI ghost-writing.',
].join('\n');

export function buildUserPrompt(input: DesignOralAssessmentInput): string {
  const parts: string[] = [];
  if (input.assignmentBrief) {
    parts.push('ASSIGNMENT BRIEF:', input.assignmentBrief);
  } else {
    parts.push('TOPIC:', input.topic ?? '', '', 'LEARNING GOAL:', input.learningGoal ?? '');
  }
  if (input.courseContext) parts.push('', 'COURSE CONTEXT:', input.courseContext);
  const n = input.questionCount ?? 3;
  parts.push('', `Produce ${n} distinct question(s) for the randomization pool.`);
  return parts.join('\n');
}
