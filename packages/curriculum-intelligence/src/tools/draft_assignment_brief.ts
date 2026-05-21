import { readFileSync, writeFileSync } from 'node:fs';
import { AnthropicAdapter } from '../llm/anthropic_adapter.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import type { LlmClient } from '../llm/client.js';
import type { CourseId, SemesterId } from '../types.js';

export interface DraftAssignmentBriefInput {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  includeDetails?: boolean;
  llmClient?: LlmClient;
}

export interface DraftAssignmentBriefResult {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  replacementRecommended: boolean;
}

export async function draftAssignmentBrief(
  input: DraftAssignmentBriefInput
): Promise<DraftAssignmentBriefResult> {
  const { courseId, semesterId, briefPath } = input;
  const client = input.llmClient ?? new AnthropicAdapter();

  const content = readFileSync(briefPath, 'utf-8');
  const { data, body } = parseBriefFile(content);

  const title = (data['title'] as string) ?? '';
  const verdict = (data['verdict'] as string) ?? 'UPDATE';
  const semestersSince = (data['semestersSince'] as number) ?? 0;
  const newsHits = (data['newsHits'] as number) ?? 0;
  const currency = (data['currency'] as string) ?? 'evergreen';

  const replacementRecommended = verdict === 'DROP' || semestersSince >= 6;

  const detailsSection = input.includeDetails
    ? `\nVerdict details: verdict=${verdict}, currency=${currency}, newsHits=${newsHits}, semestersSince=${semestersSince}\n`
    : '';

  const replacementNote = replacementRecommended
    ? '\n\nNote: This assignment has not been meaningfully updated in 3+ years — consider replacing it with a new concept rather than editing further.\n'
    : '';

  const prompt =
    `You are helping a professor update a course assignment brief for next semester.\n\n` +
    `Assignment title: ${title}\n` +
    `Verdict: ${verdict} | Currency: ${currency} | News hits: ${newsHits} | Semesters since last taught: ${semestersSince}\n` +
    detailsSection +
    `Current brief content:\n${body}\n\n` +
    `Write an updated version of this assignment brief. Keep the same learning objectives but refresh any dated examples, tool references, or case studies. Return only the updated brief text (no front matter, no commentary).` +
    replacementNote;

  const updatedBody = await client.complete(prompt);

  data['replacement_recommended'] = replacementRecommended;
  writeFileSync(briefPath, serializeBriefFile(data, `\n${updatedBody}\n`), 'utf-8');

  return { courseId, semesterId, briefPath, replacementRecommended };
}
