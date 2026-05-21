import { readFileSync, writeFileSync } from 'node:fs';
import { AnthropicAdapter } from '../llm/anthropic_adapter.js';
import { parseBriefFile, serializeBriefFile } from '../parsers/front_matter.js';
import type { LlmClient } from '../llm/client.js';
import type { CourseId, SemesterId } from '../types.js';

const CURRENT_YEAR = new Date().getFullYear();

const STALE_TOOL_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bGPT-3(?:\.5)?\b/g,     replacement: '[current-model]' },
  { pattern: /\bGPT-4\b(?!\s*[o.])/g,  replacement: '[current-model]' },
  { pattern: /\bLLaMA\s*[12]\b/gi,      replacement: '[current-model]' },
  { pattern: /\bPaLM\s*2?\b/g,          replacement: '[current-model]' },
  { pattern: /\bBard\b/g,               replacement: '[current-AI-assistant]' },
];

export interface Substitution {
  original: string;
  replacement: string;
  type: 'year' | 'tool';
}

export interface ProposedRewrite {
  section: string;
  proposed: string;
}

export interface UpdateExamplesInput {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  llmPass?: boolean;
  llmClient?: LlmClient;
}

export interface UpdateExamplesResult {
  courseId: CourseId;
  semesterId: SemesterId;
  briefPath: string;
  substitutions: Substitution[];
  proposedRewrites?: ProposedRewrite[];
}

function mechanicalPass(body: string): { result: string; substitutions: Substitution[] } {
  const substitutions: Substitution[] = [];
  let result = body;

  result = result.replace(/\b(20\d{2})\b/g, (match, year) => {
    if (parseInt(year, 10) < CURRENT_YEAR) {
      substitutions.push({ original: year, replacement: String(CURRENT_YEAR), type: 'year' });
      return String(CURRENT_YEAR);
    }
    return match;
  });

  for (const { pattern, replacement } of STALE_TOOL_PATTERNS) {
    result = result.replace(pattern, (match) => {
      substitutions.push({ original: match, replacement, type: 'tool' });
      return replacement;
    });
  }

  return { result, substitutions };
}

export function updateExamples(input: UpdateExamplesInput & { llmPass?: false }): UpdateExamplesResult;
export function updateExamples(input: UpdateExamplesInput & { llmPass: true }): Promise<UpdateExamplesResult>;
export function updateExamples(input: UpdateExamplesInput): UpdateExamplesResult | Promise<UpdateExamplesResult> {
  const content = readFileSync(input.briefPath, 'utf-8');
  const { data, body } = parseBriefFile(content);

  const { result: updatedBody, substitutions } = mechanicalPass(body);
  writeFileSync(input.briefPath, serializeBriefFile(data, updatedBody), 'utf-8');

  const baseResult: UpdateExamplesResult = {
    courseId: input.courseId,
    semesterId: input.semesterId,
    briefPath: input.briefPath,
    substitutions,
  };

  if (!input.llmPass) return baseResult;

  const client = input.llmClient ?? new AnthropicAdapter();
  const prompt =
    `You are reviewing a course assignment brief for stale content.\n\n` +
    `Brief:\n${updatedBody}\n\n` +
    `Identify any claims, examples, or case studies that reference something that has evolved or become outdated. ` +
    `Return a JSON array of objects with shape { "section": "quoted excerpt", "proposed": "replacement text" }. ` +
    `Return an empty array if nothing needs changing. Return only the JSON array, no commentary.`;

  return client.complete(prompt).then((raw) => {
    let proposedRewrites: ProposedRewrite[] = [];
    try { proposedRewrites = JSON.parse(raw) as ProposedRewrite[]; } catch { /* malformed — return empty */ }
    return { ...baseResult, proposedRewrites };
  });
}
