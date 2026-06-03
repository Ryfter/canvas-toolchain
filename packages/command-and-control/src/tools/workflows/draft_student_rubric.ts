import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  DraftStudentRubricInput, DraftStudentRubricResult, RubricCriterionDraft,
} from '../rubric/types.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../rubric/prompts.js';
import { renderRubricMarkdown } from '../rubric/render_md.js';
import { AnthropicLlmClient, type LlmClient } from '@canvas-toolchain/shared-llm';
import { loadAnthropicConfig } from '../setup_anthropic.js';

export interface DraftStudentRubricHooks {
  /** Injectable LLM client for testing. Production uses AnthropicLlmClient. */
  llm?: LlmClient;
}

function parseCriteriaJson(raw: string): RubricCriterionDraft[] {
  // The model may wrap the JSON in code fences despite the prompt. Strip them.
  let trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*\n/, '').replace(/\n?```\s*$/, '').trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new Error(`LLM did not return valid JSON. First 200 chars: ${trimmed.slice(0, 200)}`);
  }

  if (!parsed || typeof parsed !== 'object' || !('criteria' in parsed)) {
    throw new Error(`LLM response missing 'criteria' field. Got: ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  const criteria = (parsed as { criteria: unknown }).criteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new Error(`LLM 'criteria' is not a non-empty array.`);
  }

  return criteria.map((c, i) => {
    if (!c || typeof c !== 'object') {
      throw new Error(`Criterion ${i} is not an object.`);
    }
    const o = c as Record<string, unknown>;
    const required = ['number', 'name', 'points', 'studentFacing', 'workedExample', 'facultyFacing'];
    for (const key of required) {
      if (!(key in o)) throw new Error(`Criterion ${i} missing required field '${key}'.`);
    }
    return {
      number: String(o.number),
      name: String(o.name),
      points: typeof o.points === 'number' ? o.points : parseInt(String(o.points), 10),
      studentFacing: String(o.studentFacing),
      workedExample: String(o.workedExample),
      facultyFacing: String(o.facultyFacing),
    };
  });
}

/** Take a faculty rubric and produce a student-facing rewrite plus worked
 *  examples for each criterion, then write the result as a markdown file
 *  matching the CDS rubric page-type schema (so generate_course can render
 *  it as a Canvas-safe HTML page + LLM-paste .md export).
 *
 *  Calls the Anthropic API via the configured key (run setup_anthropic
 *  first if not configured).
 */
export async function draftStudentRubric(
  input: DraftStudentRubricInput,
  hooks: DraftStudentRubricHooks = {},
): Promise<DraftStudentRubricResult> {
  const llm = hooks.llm ?? new AnthropicLlmClient(loadAnthropicConfig());

  const systemPrompt = SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(input);

  const response = await llm.complete(systemPrompt, userPrompt, { maxTokens: 4096 });
  const criteria = parseCriteriaJson(response.text);

  const md = renderRubricMarkdown({
    criteria,
    week: input.week,
    title: input.title,
    totalPoints: input.totalPoints,
    assignmentNumber: input.assignmentNumber,
  });

  const outputPath = resolve(input.outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, md, 'utf-8');

  return {
    outputPath,
    criteriaCount: criteria.length,
    criteria: criteria.map(c => ({ number: c.number, name: c.name, points: c.points })),
    usage: response.usage,
  };
}
